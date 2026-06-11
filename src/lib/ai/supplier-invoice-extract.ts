// Structured extraction of supplier invoice PDFs into purchase-order-ready data.

import OpenAI from 'openai'

const EXTRACTION_MODEL = 'gpt-5.4'

export interface ExtractedInvoiceLine {
  description: string
  sku: string | null
  upc: string | null
  quantity: number
  unit_cost: number
  line_total: number | null
}

export interface ExtractedSupplierInvoice {
  is_supplier_invoice: boolean
  document_type: string
  supplier_name: string
  supplier_email: string | null
  invoice_number: string | null
  invoice_date: string | null
  currency: string | null
  lines: ExtractedInvoiceLine[]
  shipping_cost: number | null
  other_cost: number | null
  subtotal: number | null
  tax_total: number | null
  total: number | null
  notes: string | null
}

const INVOICE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    is_supplier_invoice: {
      type: 'boolean',
      description: 'True only when the document is an invoice/bill/order confirmation from a supplier for goods (not a customer receipt, statement, or marketing PDF).',
    },
    document_type: { type: 'string', description: 'e.g. "tax invoice", "order confirmation", "statement", "receipt", "other".' },
    supplier_name: { type: 'string', description: 'The supplier/vendor business name issuing the invoice.' },
    supplier_email: { type: ['string', 'null'] },
    invoice_number: { type: ['string', 'null'] },
    invoice_date: { type: ['string', 'null'], description: 'YYYY-MM-DD when determinable.' },
    currency: { type: ['string', 'null'], description: 'ISO currency code, e.g. AUD, USD.' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          description: { type: 'string' },
          sku: { type: ['string', 'null'], description: 'Supplier SKU / part number / item code printed on the line.' },
          upc: { type: ['string', 'null'], description: 'UPC/EAN barcode number if printed.' },
          quantity: { type: 'number' },
          unit_cost: { type: 'number', description: 'Per-unit cost excluding order-level shipping. Use the ex-tax unit price when both are shown.' },
          line_total: { type: ['number', 'null'] },
        },
        required: ['description', 'sku', 'upc', 'quantity', 'unit_cost', 'line_total'],
      },
    },
    shipping_cost: { type: ['number', 'null'] },
    other_cost: { type: ['number', 'null'], description: 'Other order-level charges (handling, surcharges). Negative for order-level discounts.' },
    subtotal: { type: ['number', 'null'] },
    tax_total: { type: ['number', 'null'] },
    total: { type: ['number', 'null'] },
    notes: { type: ['string', 'null'], description: 'Anything unusual: backorders, credits, partial shipment, payment terms worth flagging.' },
  },
  required: [
    'is_supplier_invoice', 'document_type', 'supplier_name', 'supplier_email', 'invoice_number',
    'invoice_date', 'currency', 'lines', 'shipping_cost', 'other_cost', 'subtotal', 'tax_total',
    'total', 'notes',
  ],
} as const

const EXTRACTION_INSTRUCTIONS = [
  'You extract structured purchase data from supplier invoice PDFs for a bicycle retail store.',
  'Read every line item: product description, supplier SKU/part number, barcode (UPC/EAN), quantity, and per-unit cost.',
  'Quantities and costs must come from the document — never invent or estimate values that are not printed.',
  'If the document is not a supplier invoice/bill/order confirmation for goods, set is_supplier_invoice=false and leave lines empty.',
  'Exclude freight/shipping rows from lines and report them in shipping_cost instead.',
].join('\n')

/**
 * Extract structured invoice data from a PDF using OpenAI with direct file input.
 */
export async function extractSupplierInvoiceFromPdf(
  pdf: Buffer,
  filename: string,
): Promise<ExtractedSupplierInvoice> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const response = await openai.responses.create({
    model: EXTRACTION_MODEL,
    instructions: EXTRACTION_INSTRUCTIONS,
    text: {
      format: {
        type: 'json_schema',
        name: 'supplier_invoice',
        strict: true,
        schema: INVOICE_JSON_SCHEMA as unknown as Record<string, unknown>,
      },
    },
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_file',
            filename: filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`,
            file_data: `data:application/pdf;base64,${pdf.toString('base64')}`,
          },
          {
            type: 'input_text',
            text: 'Extract the supplier invoice details from this PDF.',
          },
        ],
      },
    ],
  })

  const text = response.output_text
  if (!text) throw new Error('Invoice extraction returned no output.')

  let parsed: ExtractedSupplierInvoice
  try {
    parsed = JSON.parse(text) as ExtractedSupplierInvoice
  } catch {
    throw new Error('Invoice extraction returned invalid JSON.')
  }

  parsed.lines = (parsed.lines ?? []).filter(
    (line) => line.description?.trim() && Number.isFinite(line.quantity) && line.quantity > 0,
  )
  return parsed
}
