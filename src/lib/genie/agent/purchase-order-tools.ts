// Genie agent tools: supplier invoice → Lightspeed purchase order pipeline.
// list_supplier_invoices → extract_supplier_invoice → propose_lightspeed_purchase_order.
// The propose tool only STAGES the PO; the apply endpoint performs the writes
// after the user resolves any ambiguity buttons and clicks Create.

import { tool } from '@openai/agents'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

import { compactGenieProgressText } from '@/lib/genie/progress-text'
import { extractSupplierInvoiceFromPdf } from '@/lib/ai/supplier-invoice-extract'
import {
  getSupplierInvoice,
  loadSupplierInvoicePdf,
  matchInvoiceLineToItems,
  matchLightspeedVendor,
  scanGmailForSupplierInvoices,
  updateSupplierInvoice,
  type SupplierInvoiceRow,
} from '@/lib/genie/supplier-invoices'
import { createLightspeedClient } from '@/lib/services/lightspeed/lightspeed-client'
import type {
  GenieProposal,
  LightspeedPurchaseOrderCreateProposal,
  PurchaseOrderLineDraft,
} from '@/lib/types/genie-agent'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, 'public', any>
type Emit = (data: object) => void

function emitInvoiceStatus(emit: Emit, text: string) {
  emit({ event: 'status', phase: 'invoice', text: compactGenieProgressText(text, 'invoice') })
}

function invoiceSourceLabel(row: SupplierInvoiceRow): string {
  if (row.source === 'upload') return `Uploaded PDF · ${row.attachment_filename ?? 'invoice.pdf'}`
  const from = row.email_from?.replace(/<[^>]*>/g, '').trim() || 'Gmail'
  return `Gmail · ${from}${row.email_subject ? ` · "${row.email_subject}"` : ''}`
}

export function buildPurchaseOrderTools(
  supabase: Supa,
  userId: string,
  emit: Emit,
) {
  const emitProposal = (proposal: GenieProposal) => emit({ event: 'proposal', proposal })

  return [
    tool({
      name: 'list_supplier_invoices',
      description: 'List supplier invoices detected in the connected Gmail inbox or uploaded by the store (PDF invoices awaiting purchase-order creation, plus recently processed ones). Set rescan=true to re-check Gmail first. Use when the user asks about new supplier invoices, the invoice pill, or wants to process an invoice without naming one. Returns invoice ids needed by extract_supplier_invoice.',
      parameters: z.object({
        rescan: z.boolean().optional().describe('true = scan Gmail for new PDF invoices before listing.'),
        include_processed: z.boolean().optional().describe('true = include po_created/dismissed/failed rows. Default pending only.'),
      }),
      async execute(args) {
        emitInvoiceStatus(emit, args.rescan ? 'Scanning inbox for supplier invoices...' : 'Checking detected supplier invoices...')
        let scan: { scanned: number; new_invoices: number } | null = null
        if (args.rescan) {
          try {
            scan = await scanGmailForSupplierInvoices(supabase, userId)
          } catch (error) {
            console.warn('[purchase-order-tools] rescan failed:', error)
          }
        }

        let query = supabase
          .from('store_supplier_invoices')
          .select('id, source, attachment_filename, email_subject, email_from, email_date, status, lightspeed_order_id, lightspeed_order_url, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20)
        if (!args.include_processed) {
          query = query.in('status', ['detected', 'processing', 'failed'])
        }
        const { data, error } = await query
        if (error) return { error: `Could not list supplier invoices: ${error.message}` }

        return {
          scan,
          invoices: (data ?? []).map((row) => ({
            invoice_id: row.id,
            source: row.source,
            filename: row.attachment_filename,
            email_subject: row.email_subject,
            email_from: row.email_from,
            email_date: row.email_date,
            status: row.status,
            lightspeed_order_id: row.lightspeed_order_id,
            lightspeed_order_url: row.lightspeed_order_url,
          })),
          next_step: 'Call extract_supplier_invoice with an invoice_id to read the PDF and match it against Lightspeed.',
        }
      },
    }),

    tool({
      name: 'extract_supplier_invoice',
      description: 'Read a supplier invoice PDF (Gmail attachment or uploaded file), extract supplier, invoice number/date, and every line (description, SKU, quantity, unit cost), then match the supplier against Lightspeed vendors and each line against Lightspeed inventory. ALWAYS call this before propose_lightspeed_purchase_order. Returns the extraction plus vendor/item match candidates and which fields are ambiguous.',
      parameters: z.object({
        invoice_id: z.string().describe('store_supplier_invoices id from list_supplier_invoices or the user prompt.'),
      }),
      async execute(args) {
        const invoice = await getSupplierInvoice(supabase, userId, args.invoice_id.trim()).catch((error) => {
          console.warn('[purchase-order-tools] load invoice failed:', error)
          return null
        })
        if (!invoice) {
          return { error: `Supplier invoice ${args.invoice_id} was not found. Call list_supplier_invoices to get valid invoice ids.` }
        }
        if (invoice.status === 'po_created') {
          return {
            warning: 'A purchase order was already created from this invoice.',
            lightspeed_order_id: invoice.lightspeed_order_id,
            lightspeed_order_url: invoice.lightspeed_order_url,
          }
        }

        await updateSupplierInvoice(supabase, userId, invoice.id, { status: 'processing', error: null })

        try {
          emitInvoiceStatus(emit, `Downloading ${invoice.attachment_filename ?? 'invoice PDF'}...`)
          const { pdf, filename } = await loadSupplierInvoicePdf(supabase, userId, invoice)

          emitInvoiceStatus(emit, 'Reading invoice details from the PDF...')
          const extracted = await extractSupplierInvoiceFromPdf(pdf, filename)
          await updateSupplierInvoice(supabase, userId, invoice.id, { extracted })

          if (!extracted.is_supplier_invoice || extracted.lines.length === 0) {
            await updateSupplierInvoice(supabase, userId, invoice.id, {
              status: 'failed',
              error: `Not a usable supplier invoice (${extracted.document_type}).`,
            })
            return {
              invoice_id: invoice.id,
              is_supplier_invoice: extracted.is_supplier_invoice,
              document_type: extracted.document_type,
              message: 'This PDF does not look like a supplier invoice with product lines. Tell the user what the document actually is and do not create a purchase order.',
            }
          }

          emitInvoiceStatus(emit, `Matching ${extracted.supplier_name} against Lightspeed vendors...`)
          const client = createLightspeedClient(userId)
          const [vendorMatch, shops] = await Promise.all([
            matchLightspeedVendor(client, extracted.supplier_name),
            client.getShops({ archived: 'false' }).catch(() => []),
          ])

          emitInvoiceStatus(emit, `Matching ${extracted.lines.length} invoice lines to inventory...`)
          const lines = [] as Array<{
            description: string
            supplier_sku: string | null
            upc: string | null
            quantity: number
            unit_cost: number
            matches: Awaited<ReturnType<typeof matchInvoiceLineToItems>>
            auto_matched_item_id: string | null
          }>
          for (const line of extracted.lines) {
            const matches = await matchInvoiceLineToItems(supabase, userId, line)
            const top = matches[0]
            const autoMatched = top && (top.confidence >= 0.95 || (top.confidence >= 0.8 && matches.length === 1))
            lines.push({
              description: line.description,
              supplier_sku: line.sku,
              upc: line.upc,
              quantity: line.quantity,
              unit_cost: line.unit_cost,
              matches,
              auto_matched_item_id: autoMatched ? top.item_id : null,
            })
          }

          const unmatchedCount = lines.filter((line) => !line.auto_matched_item_id).length
          emitInvoiceStatus(emit, 'Invoice extraction ready')

          return {
            invoice_id: invoice.id,
            source_label: invoiceSourceLabel(invoice),
            extracted: {
              supplier_name: extracted.supplier_name,
              supplier_email: extracted.supplier_email,
              invoice_number: extracted.invoice_number,
              invoice_date: extracted.invoice_date,
              currency: extracted.currency,
              shipping_cost: extracted.shipping_cost,
              other_cost: extracted.other_cost,
              subtotal: extracted.subtotal,
              tax_total: extracted.tax_total,
              total: extracted.total,
              notes: extracted.notes,
            },
            vendor_match: {
              auto_matched: vendorMatch.best,
              candidates: vendorMatch.candidates,
            },
            shops: shops.map((shop) => ({ shop_id: String(shop.shopID), name: shop.name })),
            lines,
            ambiguity_summary: {
              vendor_needs_user_choice: !vendorMatch.best,
              lines_needing_user_choice: unmatchedCount,
            },
            next_step: 'Call propose_lightspeed_purchase_order now. Pass auto-matched item_ids as resolved; leave ambiguous lines unresolved with their candidates so the user can click to choose. Do NOT ask the user questions in text — the proposal card shows buttons.',
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Invoice extraction failed.'
          await updateSupplierInvoice(supabase, userId, invoice.id, { status: 'failed', error: message })
          console.error('[purchase-order-tools] extraction failed:', error)
          return { error: message }
        }
      },
    }),

    tool({
      name: 'propose_lightspeed_purchase_order',
      description: 'Stage a Lightspeed purchase order from an extracted supplier invoice for user approval. Pass the vendor (matched vendor_id, or vendor_options + create_vendor_name when ambiguous) and every invoice line (with item_id when matched, or item_options when the user must choose). The UI renders clickable buttons for every ambiguity and a Create button — never ask the user to type choices. Requires extract_supplier_invoice to have been called first.',
      parameters: z.object({
        invoice_id: z.string().nullable().describe('store_supplier_invoices id this PO is built from. Null only for ad-hoc requests with no tracked invoice.'),
        summary: z.string().describe('One sentence describing the PO, e.g. "Purchase order for Shimano Australia invoice #INV-2041 with 6 lines totalling $1,842.50".'),
        supplier_name: z.string(),
        invoice_number: z.string().nullable(),
        invoice_date: z.string().nullable().describe('YYYY-MM-DD'),
        currency: z.string().nullable(),
        vendor_id: z.string().nullable().describe('Matched Lightspeed vendorID; null when the user must choose.'),
        vendor_name: z.string().nullable().describe('Name of the matched vendor when vendor_id is set.'),
        vendor_options: z.array(z.object({
          vendor_id: z.string(),
          name: z.string(),
          score: z.number(),
        })).describe('Vendor candidates from extract_supplier_invoice when vendor_id is null. Empty array when resolved.'),
        create_vendor_name: z.string().nullable().describe('Supplier name to offer as a "create new vendor" button when no existing vendor fits.'),
        shop_id: z.string().nullable().describe('Lightspeed shopID for the PO. Use the only shop automatically; null when multiple shops and unclear.'),
        shop_options: z.array(z.object({ shop_id: z.string(), name: z.string() })).describe('All active shops (from extract_supplier_invoice). Required when shop_id is null.'),
        lines: z.array(z.object({
          description: z.string(),
          supplier_sku: z.string().nullable(),
          upc: z.string().nullable().describe('Barcode from the invoice line — used if the user chooses to create a new Lightspeed product for this line.'),
          quantity: z.number(),
          unit_cost: z.number(),
          item_id: z.string().nullable().describe('Resolved Lightspeed itemID, or null when the user must choose.'),
          item_name: z.string().nullable(),
          item_options: z.array(z.object({
            item_id: z.string(),
            name: z.string(),
            sku: z.string().nullable(),
            upc: z.string().nullable(),
            default_cost: z.number().nullable(),
            qoh: z.number().nullable(),
            confidence: z.number(),
            matched_on: z.enum(['barcode', 'sku', 'description']),
          })).describe('Item candidates when item_id is null. Empty array when resolved or no candidates exist (line becomes skippable).'),
        })).min(1),
        shipping_cost: z.number().nullable(),
        other_cost: z.number().nullable(),
        invoice_total: z.number().nullable(),
        source_label: z.string().describe('Where the invoice came from, e.g. \'Gmail · orders@shimano.com · "Invoice INV-2041"\'.'),
      }),
      async execute(args) {
        emitInvoiceStatus(emit, 'Preparing purchase order for approval...')

        const lines: PurchaseOrderLineDraft[] = args.lines.map((line) => ({
          description: line.description,
          supplier_sku: line.supplier_sku,
          upc: line.upc,
          quantity: Math.max(1, Math.round(line.quantity)),
          unit_cost: Math.round(line.unit_cost * 100) / 100,
          item_id: line.item_id,
          item_name: line.item_name,
          item_options: line.item_options,
        }))

        const proposal: LightspeedPurchaseOrderCreateProposal = {
          kind: 'lightspeed_purchase_order_create',
          summary: args.summary,
          invoice_id: args.invoice_id,
          invoice_number: args.invoice_number,
          invoice_date: args.invoice_date,
          supplier_name: args.supplier_name,
          currency: args.currency,
          vendor_id: args.vendor_id,
          vendor_name: args.vendor_name,
          vendor_options: args.vendor_options,
          create_vendor_name: args.create_vendor_name ?? args.supplier_name,
          shop_id: args.shop_id ?? (args.shop_options.length === 1 ? args.shop_options[0].shop_id : null),
          shop_options: args.shop_options,
          lines,
          shipping_cost: args.shipping_cost,
          other_cost: args.other_cost,
          invoice_total: args.invoice_total,
          source_label: args.source_label,
        }

        emitProposal(proposal)
        emitInvoiceStatus(emit, 'Purchase order staged for approval')

        const unresolvedLines = lines.filter((line) => !line.item_id).length
        return {
          staged: true,
          vendor_resolved: Boolean(args.vendor_id),
          unresolved_lines: unresolvedLines,
          message: unresolvedLines > 0 || !args.vendor_id
            ? 'Purchase order staged. Tell the user (briefly) to resolve the highlighted choices on the card with one click each, then press Create purchase order. Do not list the choices again in text.'
            : 'Purchase order staged. Tell the user to review the card and press Create purchase order. After creation the card shows a View in Lightspeed link.',
        }
      },
    }),
  ]
}
