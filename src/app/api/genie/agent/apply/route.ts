/**
 * Genie Store Agent — APPLY (mutation) endpoint.
 *
 * Receives a proposal produced by /api/genie/agent and performs the change.
 * Authenticated to verified bicycle stores. Every write is scoped to the
 * authenticated user_id, so a tampered proposal can only ever affect the
 * caller's own rows.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLightspeedClient } from '@/lib/services/lightspeed'
import { lightspeedPurchaseOrderUrl } from '@/lib/services/lightspeed/lightspeed-client'
import { buildFullPathName } from '@/lib/services/lightspeed/category-helpers'
import type {
  GenieProposal,
  ApplyResult,
  CarouselSizeOption,
  ProductBrandCategoryChange,
  GmailEmailActionProposal,
} from '@/lib/types/genie-agent'
import { NEW_CAROUSEL_SLOT } from '@/lib/types/genie-agent'
import { executeGmailCreateDraft, executeGmailSendEmail } from '@/lib/composio/gmail'
import { isComposioConfigured } from '@/lib/composio/client'

export const dynamic = 'force-dynamic'

const SIZE_VALUES: CarouselSizeOption[] = ['featured', 'normal', 'compact']

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single()

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json(
        { error: 'Store agent is only available to verified bicycle stores.' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const proposal = body?.proposal as GenieProposal | undefined
    if (!proposal || typeof proposal !== 'object' || !('kind' in proposal)) {
      return NextResponse.json({ error: 'Missing or invalid proposal.' }, { status: 400 })
    }

    // ── Carousel layout ──────────────────────────────────────────────────
    if (proposal.kind === 'carousel_layout') {
      const changes = Array.isArray(proposal.changes) ? proposal.changes : []
      if (changes.length === 0) {
        return NextResponse.json({ error: 'No changes to apply.' }, { status: 400 })
      }

      let affected = 0
      for (const ch of changes) {
        if (!ch?.id) continue
        const size: CarouselSizeOption = SIZE_VALUES.includes(ch.carousel_size) ? ch.carousel_size : 'normal'
        const { error } = await supabase
          .from('store_categories')
          .update({
            display_order: Number(ch.display_order) || 0,
            is_active: ch.is_active !== false,
            carousel_size: size,
          })
          .eq('id', ch.id)
          .eq('user_id', user.id) // ownership scope
        if (error) {
          console.error('Apply carousel_layout error:', error)
          return NextResponse.json({ error: 'Failed to update carousels.' }, { status: 500 })
        }
        affected++
      }

      const result: ApplyResult = {
        ok: true,
        kind: 'carousel_layout',
        affected,
        message: `Updated ${affected} carousel${affected === 1 ? '' : 's'}.`,
      }
      return NextResponse.json(result)
    }

    // ── Create carousel ──────────────────────────────────────────────────
    if (proposal.kind === 'carousel_create') {
      const name = (proposal.name ?? '').trim()
      if (!name) {
        return NextResponse.json({ error: 'A carousel name is required.' }, { status: 400 })
      }
      const productIds = Array.isArray(proposal.product_ids) ? proposal.product_ids.filter(Boolean) : []
      const size: CarouselSizeOption = SIZE_VALUES.includes(proposal.carousel_size) ? proposal.carousel_size : 'normal'

      // Insert at the end first, so a partial failure still leaves a usable row.
      const { data: maxRow } = await supabase
        .from('store_categories')
        .select('display_order')
        .eq('user_id', user.id)
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      const endOrder = (maxRow?.display_order ?? -1) + 1

      const { data: created, error: insertErr } = await supabase
        .from('store_categories')
        .insert({
          user_id: user.id,
          name,
          source: 'custom',
          product_ids: productIds,
          display_order: endOrder,
          is_active: true,
          carousel_size: size,
        })
        .select('id')
        .single()

      if (insertErr || !created) {
        console.error('Apply carousel_create insert error:', insertErr)
        return NextResponse.json({ error: 'Failed to create the carousel.' }, { status: 500 })
      }
      const newId = created.id as string

      // Re-sequence display_order to honour the proposed position. Best-effort:
      // the row already exists at the end if any of this fails.
      const proposedOrder = Array.isArray(proposal.ordered_ids) ? proposal.ordered_ids : []
      const { data: owned } = await supabase
        .from('store_categories')
        .select('id, display_order')
        .eq('user_id', user.id)

      if (owned && owned.length > 0) {
        const ownedRows = owned as Array<{ id: string; display_order: number }>
        const ownedIds = new Set(ownedRows.map((c) => c.id))
        const curOrder = new Map(ownedRows.map((c) => [c.id, c.display_order]))

        // Map sentinel → real id, keep only ids the store still owns, dedupe.
        const seen = new Set<string>()
        const finalOrder: string[] = []
        for (const id of proposedOrder) {
          const real = id === NEW_CAROUSEL_SLOT ? newId : id
          if (ownedIds.has(real) && !seen.has(real)) { seen.add(real); finalOrder.push(real) }
        }
        // Append any owned carousels the proposal didn't mention (e.g. added since).
        for (const c of ownedRows) {
          const id = c.id
          if (!seen.has(id)) { seen.add(id); finalOrder.push(id) }
        }

        for (let i = 0; i < finalOrder.length; i++) {
          if (curOrder.get(finalOrder[i]) === i) continue // already correct
          const { error: reErr } = await supabase
            .from('store_categories')
            .update({ display_order: i })
            .eq('id', finalOrder[i])
            .eq('user_id', user.id)
          if (reErr) {
            console.error('Apply carousel_create reorder error:', reErr)
            break // row exists; ordering is self-healing on the next layout change
          }
        }
      }

      const result: ApplyResult = {
        ok: true,
        kind: 'carousel_create',
        affected: productIds.length,
        message: `Created "${name}" with ${productIds.length} product${productIds.length === 1 ? '' : 's'}.`,
      }
      return NextResponse.json(result)
    }

    // ── Rename carousel ──────────────────────────────────────────────────
    if (proposal.kind === 'carousel_rename') {
      const name = (proposal.name ?? '').trim()
      if (!proposal.id || !name) {
        return NextResponse.json({ error: 'Carousel id and a new name are required.' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('store_categories')
        .update({ name })
        .eq('id', proposal.id)
        .eq('user_id', user.id) // ownership scope
        .select('id')

      if (error) {
        console.error('Apply carousel_rename error:', error)
        return NextResponse.json({ error: 'Failed to rename the carousel.' }, { status: 500 })
      }
      if (!data || data.length === 0) {
        return NextResponse.json({ error: 'Carousel not found.' }, { status: 404 })
      }

      const result: ApplyResult = {
        ok: true,
        kind: 'carousel_rename',
        affected: 1,
        message: `Renamed to "${name}".`,
      }
      return NextResponse.json(result)
    }

    // ── Apply discount ───────────────────────────────────────────────────
    if (proposal.kind === 'discount_apply') {
      const ids = Array.isArray(proposal.product_ids) ? proposal.product_ids.filter(Boolean) : []
      const pct = Number(proposal.discount_percent)
      if (ids.length === 0) {
        return NextResponse.json({ error: 'No products to discount.' }, { status: 400 })
      }
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
        return NextResponse.json({ error: 'Invalid discount percentage.' }, { status: 400 })
      }
      let endsAt: string | null = null
      if (proposal.ends_at) {
        const d = new Date(proposal.ends_at)
        if (isNaN(d.getTime())) {
          return NextResponse.json({ error: 'Invalid end date.' }, { status: 400 })
        }
        endsAt = d.toISOString()
      }

      const { data, error } = await supabase
        .from('products')
        .update({
          discount_percent: Math.round(pct * 100) / 100,
          discount_active: true,
          discount_ends_at: endsAt,
        })
        .eq('user_id', user.id) // ownership scope
        .in('id', ids)
        .select('id')

      if (error) {
        console.error('Apply discount_apply error:', error)
        return NextResponse.json({ error: 'Failed to apply discount.' }, { status: 500 })
      }

      const affected = data?.length ?? 0
      const result: ApplyResult = {
        ok: true,
        kind: 'discount_apply',
        affected,
        message: `${Math.round(pct)}% off applied to ${affected} product${affected === 1 ? '' : 's'}${endsAt ? ' (with end date)' : ''}.`,
      }
      return NextResponse.json(result)
    }

    // ── Remove discount ──────────────────────────────────────────────────
    if (proposal.kind === 'discount_remove') {
      const ids = Array.isArray(proposal.product_ids) ? proposal.product_ids.filter(Boolean) : []
      if (ids.length === 0) {
        return NextResponse.json({ error: 'No products to update.' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('products')
        .update({
          discount_percent: null,
          discount_active: false,
          discount_ends_at: null,
        })
        .eq('user_id', user.id) // ownership scope
        .in('id', ids)
        .select('id')

      if (error) {
        console.error('Apply discount_remove error:', error)
        return NextResponse.json({ error: 'Failed to remove discount.' }, { status: 500 })
      }

      const affected = data?.length ?? 0
      const result: ApplyResult = {
        ok: true,
        kind: 'discount_remove',
        affected,
        message: `Discount removed from ${affected} product${affected === 1 ? '' : 's'}.`,
      }
      return NextResponse.json(result)
    }

    // ── Lightspeed brand/category write-back ─────────────────────────────
    if (proposal.kind === 'product_brand_category_update') {
      const changes = Array.isArray(proposal.changes) ? proposal.changes : []
      if (changes.length === 0) {
        return NextResponse.json({ error: 'No changes to apply.' }, { status: 400 })
      }

      const client = createLightspeedClient(user.id)
      let affected = 0
      const createdBrandIds = new Map<string, string>()
      const createdCategoryIds = new Map<string, string>()
      const appliedChanges: ProductBrandCategoryChange[] = []

      for (const change of changes) {
        const itemId = change?.lightspeed_item_id
        if (!itemId) continue

        const { data: existing } = await supabase
          .from('lightspeed_inventory')
          .select('lightspeed_item_id')
          .eq('user_id', user.id)
          .eq('lightspeed_item_id', itemId)
          .maybeSingle()

        if (!existing) {
          return NextResponse.json({ error: `Inventory item ${itemId} was not found for this store.` }, { status: 404 })
        }

        let nextBrandId = change.next_brand_id
        if (change.create_brand && change.next_brand_name && !nextBrandId) {
          const brandKey = change.next_brand_name.trim().toLowerCase()
          const cachedBrandId = createdBrandIds.get(brandKey)
          if (cachedBrandId) {
            nextBrandId = cachedBrandId
          } else {
            const manufacturer = await client.createManufacturer(change.next_brand_name.trim())
            nextBrandId = String(manufacturer.manufacturerID)
            createdBrandIds.set(brandKey, nextBrandId)
          }
        }

        let nextCategoryId = change.next_category_id
        let nextCategoryName = change.next_category_name
        let nextCategoryPath = change.next_category_path
        if (change.create_category && change.next_category_name && !nextCategoryId) {
          const categoryKey = (change.next_category_path || change.next_category_name).trim().toLowerCase()
          const cachedCategoryId = createdCategoryIds.get(categoryKey)
          if (cachedCategoryId) {
            nextCategoryId = cachedCategoryId
          } else {
            const existingCategories = await client.getAllCategories({ archived: 'false' }).catch(() => [])
            const categoriesById = new Map(
              existingCategories.map((row) => [String(row.categoryID), row]),
            )
            const parentID = change.next_category_parent_id && change.next_category_parent_id !== '0'
              ? String(change.next_category_parent_id)
              : '0'
            const name = change.next_category_name.trim()
            const fullPathName = (change.next_category_path || '').trim()
              || buildFullPathName(name, parentID, categoriesById)
            const category = await client.createCategory({
              name,
              fullPathName,
              parentID: parentID !== '0' ? parentID : undefined,
            })
            nextCategoryId = String(category.categoryID)
            nextCategoryName = category.name
            nextCategoryPath = category.fullPathName || category.name
            createdCategoryIds.set(categoryKey, nextCategoryId)
          }
        }

        const brandChanging = Boolean(nextBrandId) || change.create_brand || change.clear_brand
        const categoryChanging = Boolean(nextCategoryId) || change.create_category || change.clear_category

        const payload: Record<string, string> = {}
        if (brandChanging) payload.manufacturerID = nextBrandId || '0'
        if (categoryChanging) payload.categoryID = nextCategoryId || '0'

        if (Object.keys(payload).length === 0) continue

        await client.updateItem(itemId, payload)

        const cachePatch: Record<string, unknown> = {
          last_synced_at: new Date().toISOString(),
        }
        if (brandChanging) {
          cachePatch.brand_id = nextBrandId || null
          cachePatch.brand_name = change.clear_brand ? null : change.next_brand_name
        }
        if (categoryChanging) {
          cachePatch.category_id = nextCategoryId || null
          cachePatch.category_name = change.clear_category ? null : nextCategoryName
          cachePatch.category_path = change.clear_category ? null : nextCategoryPath
        }

        await supabase
          .from('lightspeed_inventory')
          .update(cachePatch)
          .eq('user_id', user.id)
          .eq('lightspeed_item_id', itemId)

        const productPatch: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (brandChanging) {
          productPatch.manufacturer_id = nextBrandId || null
          productPatch.manufacturer_name = change.clear_brand ? null : change.next_brand_name
        }
        if (categoryChanging) {
          productPatch.lightspeed_category_id = nextCategoryId || null
          productPatch.category_name = change.clear_category ? null : nextCategoryName
          productPatch.full_category_path = change.clear_category ? null : nextCategoryPath
        }

        await supabase
          .from('products')
          .update(productPatch)
          .eq('user_id', user.id)
          .eq('lightspeed_item_id', itemId)

        appliedChanges.push({
          lightspeed_item_id: itemId,
          product_name: change.product_name,
          sku: change.sku,
          image_url: change.image_url ?? null,
          prev_brand_id: change.prev_brand_id,
          prev_brand_name: change.prev_brand_name,
          next_brand_id: nextBrandId || null,
          next_brand_name: change.clear_brand ? null : change.next_brand_name,
          prev_category_id: change.prev_category_id,
          prev_category_name: change.prev_category_name,
          prev_category_path: change.prev_category_path,
          next_category_id: nextCategoryId || null,
          next_category_name: change.clear_category ? null : nextCategoryName,
          next_category_path: change.clear_category ? null : nextCategoryPath,
        })

        affected++
      }

      const result: ApplyResult = {
        ok: true,
        kind: 'product_brand_category_update',
        affected,
        message: `Updated brand/category for ${affected} product${affected === 1 ? '' : 's'} in Lightspeed.`,
        applied_changes: appliedChanges,
      }
      return NextResponse.json(result)
    }

    // ── Lightspeed category create ───────────────────────────────────────
    if (proposal.kind === 'lightspeed_category_create') {
      const name = (proposal.name ?? '').trim()
      if (!name) {
        return NextResponse.json({ error: 'Category name is required.' }, { status: 400 })
      }

      const client = createLightspeedClient(user.id)
      const existingCategories = await client.getAllCategories({ archived: 'false' }).catch(() => [])
      const categoriesById = new Map(
        existingCategories.map((row) => [String(row.categoryID), row]),
      )
      const parentID = proposal.parent_category_id && proposal.parent_category_id !== '0'
        ? String(proposal.parent_category_id)
        : '0'
      const fullPathName = (proposal.path ?? '').trim()
        || buildFullPathName(name, parentID, categoriesById)

      const category = await client.createCategory({
        name,
        fullPathName,
        parentID: parentID !== '0' ? parentID : undefined,
      })

      const result: ApplyResult = {
        ok: true,
        kind: 'lightspeed_category_create',
        affected: 1,
        message: `Created Lightspeed category "${category.fullPathName || category.name}".`,
      }
      return NextResponse.json(result)
    }

    // ── Gmail send / draft via Composio ───────────────────────────────────
    if (proposal.kind === 'gmail_email_action') {
      if (!isComposioConfigured()) {
        return NextResponse.json({ error: 'Gmail integration is not configured.' }, { status: 503 })
      }

      const gmailProposal = proposal as GmailEmailActionProposal
      const recipient = (gmailProposal.recipient_email ?? '').trim()
      if (!recipient) {
        return NextResponse.json({ error: 'Recipient email is required.' }, { status: 400 })
      }

      const executeArgs = {
        recipient_email: recipient,
        subject: gmailProposal.subject ?? '',
        body: gmailProposal.body ?? '',
        cc: gmailProposal.cc,
        bcc: gmailProposal.bcc,
        is_html: gmailProposal.is_html,
        connected_account_id: gmailProposal.connected_account_id ?? undefined,
        composio_session_id: gmailProposal.composio_session_id ?? undefined,
      }

      try {
        const result = gmailProposal.action === 'draft'
          ? await executeGmailCreateDraft(user.id, executeArgs)
          : await executeGmailSendEmail(user.id, executeArgs)

        const resultMessage: ApplyResult = {
          ok: true,
          kind: 'gmail_email_action',
          affected: 1,
          message: gmailProposal.action === 'draft'
            ? `Draft created for ${recipient}.`
            : `Email sent to ${recipient}.`,
        }
        return NextResponse.json({ ...resultMessage, provider_result: result })
      } catch (error) {
        console.error('Apply gmail_email_action error:', error)
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Gmail action failed.' },
          { status: 502 },
        )
      }
    }

    // ── Lightspeed purchase order create (from supplier invoice) ─────────
    if (proposal.kind === 'lightspeed_purchase_order_create') {
      const po = proposal
      const lines = Array.isArray(po.lines) ? po.lines : []
      const orderableLines = lines.filter((line) => !line.skipped && (line.item_id || line.create_item))
      const unresolvedLines = lines.filter((line) => !line.skipped && !line.item_id && !line.create_item)

      if (unresolvedLines.length > 0) {
        return NextResponse.json(
          { error: `${unresolvedLines.length} line${unresolvedLines.length === 1 ? '' : 's'} still need an item match, a new product, or skip before the purchase order can be created.` },
          { status: 400 },
        )
      }
      if (orderableLines.length === 0) {
        return NextResponse.json({ error: 'No matched lines to order — every line was skipped.' }, { status: 400 })
      }
      if (!po.vendor_id && !(po.create_vendor_name ?? '').trim()) {
        return NextResponse.json({ error: 'Choose a Lightspeed vendor (or create one) before creating the purchase order.' }, { status: 400 })
      }

      const client = createLightspeedClient(user.id)

      try {
        let vendorId = po.vendor_id
        let vendorName = po.vendor_name
        if (!vendorId) {
          const vendor = await client.createVendor({ name: (po.create_vendor_name ?? po.supplier_name).trim() })
          vendorId = String(vendor.vendorID)
          vendorName = vendor.name
        }

        const skipped = lines.filter((line) => line.skipped || (!line.item_id && !line.create_item))
        const stockInstructions = [
          `Created by Yellow Jersey Genie from supplier invoice${po.invoice_number ? ` ${po.invoice_number}` : ''} (${po.source_label}).`,
          skipped.length > 0
            ? `Skipped invoice lines (no Lightspeed item): ${skipped.map((line) => `${line.quantity}x ${line.description}`).join('; ')}`
            : '',
        ].filter(Boolean).join(' ')

        const order = await client.createPurchaseOrder({
          vendorID: vendorId,
          shopID: po.shop_id ?? undefined,
          orderedDate: po.invoice_date ?? new Date().toISOString().slice(0, 10),
          refNum: po.invoice_number ?? undefined,
          shipCost: po.shipping_cost ?? undefined,
          otherCost: po.other_cost ?? undefined,
          stockInstructions: stockInstructions.slice(0, 1000),
        })

        let lineCount = 0
        let createdItemCount = 0
        const lineErrors: string[] = []
        for (const line of orderableLines) {
          try {
            let itemId = line.item_id
            if (!itemId && line.create_item) {
              const item = await client.createItem({
                description: line.description,
                defaultCost: line.unit_cost,
                upc: line.upc?.replace(/\D/g, '') || undefined,
                manufacturerSku: line.supplier_sku ?? undefined,
              })
              itemId = String(item.itemID)
              createdItemCount++
            }
            if (!itemId) continue
            await client.createPurchaseOrderLine({
              orderID: String(order.orderID),
              itemID: itemId,
              quantity: line.quantity,
              price: line.unit_cost,
            })
            lineCount++
          } catch (lineError) {
            console.error('Apply purchase order line failed:', lineError)
            lineErrors.push(line.description)
          }
        }

        // Write shipping/other costs again AFTER the lines exist — Lightspeed
        // recalculates order totals on update, and shipCost set only at create
        // time has been observed not to stick.
        if (po.shipping_cost != null || po.other_cost != null) {
          try {
            await client.updatePurchaseOrder(String(order.orderID), {
              shipCost: po.shipping_cost ?? undefined,
              otherCost: po.other_cost ?? undefined,
            })
          } catch (shipError) {
            console.warn('Apply purchase order shipping update failed:', shipError)
          }
        }

        const orderUrl = lightspeedPurchaseOrderUrl(String(order.orderID))

        if (po.invoice_id) {
          await supabase
            .from('store_supplier_invoices')
            .update({
              status: 'po_created',
              lightspeed_order_id: String(order.orderID),
              lightspeed_order_url: orderUrl,
              error: lineErrors.length > 0 ? `Lines failed: ${lineErrors.join('; ')}` : null,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', user.id)
            .eq('id', po.invoice_id)
        }

        const result: ApplyResult = {
          ok: true,
          kind: 'lightspeed_purchase_order_create',
          affected: lineCount,
          message: [
            `Created purchase order #${order.orderID} for ${vendorName ?? po.supplier_name} with ${lineCount} line${lineCount === 1 ? '' : 's'}.`,
            createdItemCount > 0 ? `Created ${createdItemCount} new product${createdItemCount === 1 ? '' : 's'} in Lightspeed (cost set, retail price still 0).` : '',
            lineErrors.length > 0 ? `${lineErrors.length} line${lineErrors.length === 1 ? '' : 's'} failed and need manual entry.` : '',
          ].filter(Boolean).join(' '),
          lightspeed_url: orderUrl,
        }
        return NextResponse.json(result)
      } catch (error) {
        console.error('Apply lightspeed_purchase_order_create error:', error)
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Could not create the purchase order in Lightspeed.' },
          { status: 502 },
        )
      }
    }

    // ── Price update ─────────────────────────────────────────────────────
    if (proposal.kind === 'price_update') {
      const newPrices = proposal.new_prices
      if (!newPrices || typeof newPrices !== 'object' || Object.keys(newPrices).length === 0) {
        return NextResponse.json({ error: 'No price changes to apply.' }, { status: 400 })
      }

      let affected = 0
      for (const [id, price] of Object.entries(newPrices)) {
        const rounded = Math.round(Number(price) * 100) / 100
        if (!id || !Number.isFinite(rounded) || rounded < 0) continue

        const { error } = await supabase
          .from('products')
          .update({ price: rounded })
          .eq('id', id)
          .eq('user_id', user.id) // ownership scope
        if (error) {
          console.error('Apply price_update error:', error)
          return NextResponse.json({ error: `Failed to update price for product ${id}.` }, { status: 500 })
        }
        affected++
      }

      const result: ApplyResult = {
        ok: true,
        kind: 'price_update',
        affected,
        message: `Updated retail price for ${affected} product${affected === 1 ? '' : 's'}.`,
      }
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Unsupported proposal kind.' }, { status: 400 })
  } catch (error) {
    console.error('Error in POST /api/genie/agent/apply:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
