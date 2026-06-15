import OpenAI from 'openai'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { createLightspeedClient } from '@/lib/services/lightspeed'
import {
  buildTitleGenerationContext,
  ensureTitlePreservesVariants,
  TITLE_VARIANT_RULES,
} from '@/lib/product-copy-context'

const MODEL = 'gpt-5.4-mini'
const DEFAULT_BATCH_SIZE = 2
const MAX_BATCH_SIZE = 5

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const TITLE_PROMPT = `You are an ecommerce product title specialist for Yellow Jersey, an Australian cycling marketplace.

You MUST search the web before generating any title. Raw product names come from a bike shop Lightspeed POS system and are often ALL CAPS, abbreviated, or include internal codes. In Lightspeed, Item.description is the product title. Only the manufacturer's official product name found via web search is authoritative. Never guess or invent a name.

STEPS:
1. Search the web for the product using the raw Lightspeed title, SKU, UPC, and any available context.
2. Prefer the manufacturer's official product page. Trusted cycling retailers are acceptable when the manufacturer page is unavailable.
3. Use the exact official product name as the basis for the title.

TITLE RULES:
- Use the manufacturer's official capitalisation.
- CRITICAL SIZE RULE: If the raw Lightspeed title, SKU/UPC context, or official product page includes a size, dimension, fit, capacity, speed, tooth count, width, length, diameter, wheel size, frame size, clothing size, shoe size, volume, or other variant size, the final title MUST include it.
${TITLE_VARIANT_RULES}
- Keep the title concise, but preserving variant details is more important than hitting the word target.
- Australian English spelling.
- Do not include internal POS codes, stock codes, price, or availability.
- Return ONLY the final title. No explanation, no quotes, no trailing punctuation.

Examples:
"WAHOO ELEMNT ROAM BIKE COMPUTER" -> Wahoo ELEMNT Roam GPS Computer
"SHIMANO DURA ACE R9200 CRANKSET FC-R9200" -> Shimano Dura-Ace R9200 Crankset
"GARMIN EDGE 530 CYCLING COMPUTER" -> Garmin Edge 530 GPS Computer
"SPECIALIZED TARMAC SL7 EXPERT DISC BICYCLE" -> Specialized Tarmac SL7 Expert Disc Road Bike
"MAXXIS ARDENT RACE 29X2.2 EXO/TR" -> Maxxis Ardent Race 29x2.2 Tyre`

interface ClaimedTitleCleaningItem {
  id: string
  job_id: string
  user_id: string
  lightspeed_item_id: string
  original_description: string | null
  attempts: number
}

interface InventoryTitleRow {
  lightspeed_item_id: string
  system_sku: string | null
  description: string | null
  upc: string | null
  category_id: string | null
  manufacturer_id: string | null
  price: number | string | null
}

interface ResponseWithOutput {
  output?: Array<{
    type: string
    content?: Array<{
      type: string
      text?: string
    }>
  }>
}

export interface TitleCleaningBatchResult {
  success: boolean
  claimed: number
  processed: number
  completed: number
  failed: number
  results: Array<{
    queueId: string
    jobId: string
    itemId: string
    success: boolean
    title?: string
    error?: string
  }>
}

function extractOutputText(response: ResponseWithOutput): string {
  let text = ''
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) text += content.text
    }
  }
  return text.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '')
}

async function generateCleanTitle(row: InventoryTitleRow): Promise<string> {
  const product = {
    description: row.description,
    marketplace_category: row.category_id,
  }
  const { lightspeedTitle, searchTerms, contextBlock } = buildTitleGenerationContext(product)

  if (!lightspeedTitle) {
    throw new Error('Missing Lightspeed description')
  }

  const response = await openai.responses.create({
    model: MODEL,
    instructions: TITLE_PROMPT,
    tools: [{ type: 'web_search_preview' as const }],
    tool_choice: 'required',
    input: `Search the web for "${searchTerms}" and return the clean ecommerce title for this Lightspeed item:\n\n${contextBlock}\nSystem SKU: ${row.system_sku || 'n/a'}\nUPC: ${row.upc || 'n/a'}\nLightspeed category ID: ${row.category_id || 'n/a'}\nLightspeed manufacturer ID: ${row.manufacturer_id || 'n/a'}\nPrice: ${row.price ?? 'n/a'}\n\nReturn ONLY the clean title.`,
  })

  const title = ensureTitlePreservesVariants(extractOutputText(response), product)
  if (!title) throw new Error('No title generated')
  return title
}

async function processQueueItem(item: ClaimedTitleCleaningItem) {
  const supabase = createServiceRoleClient()

  const { data: row, error: rowError } = await supabase
    .from('products_all_ls')
    .select('lightspeed_item_id, system_sku, description, upc, category_id, manufacturer_id, price')
    .eq('user_id', item.user_id)
    .eq('lightspeed_item_id', item.lightspeed_item_id)
    .single()

  if (rowError || !row) {
    throw new Error(`Inventory row not found: ${rowError?.message || item.lightspeed_item_id}`)
  }

  const title = await generateCleanTitle(row as InventoryTitleRow)
  const client = createLightspeedClient(item.user_id)

  await client.updateItem(item.lightspeed_item_id, { description: title })

  const now = new Date().toISOString()
  const { error: cacheError } = await supabase
    .from('products_all_ls')
    .update({ description: title, last_synced_at: now })
    .eq('user_id', item.user_id)
    .eq('lightspeed_item_id', item.lightspeed_item_id)

  if (cacheError) {
    throw new Error(`Lightspeed updated but cache update failed: ${cacheError.message}`)
  }

  const { error: productError } = await supabase
    .from('products')
    .update({
      description: title,
      display_name: title,
      updated_at: now,
    })
    .eq('user_id', item.user_id)
    .eq('lightspeed_item_id', item.lightspeed_item_id)

  if (productError) {
    console.error('[Title Cleaning] Synced products update error:', productError)
  }

  return title
}

export async function processLightspeedTitleCleaningBatch(
  batchSize = DEFAULT_BATCH_SIZE
): Promise<TitleCleaningBatchResult> {
  const supabase = createServiceRoleClient()
  const safeBatchSize = Math.min(Math.max(Math.floor(batchSize) || DEFAULT_BATCH_SIZE, 1), MAX_BATCH_SIZE)

  const { data: claimedItems, error: claimError } = await supabase.rpc(
    'claim_lightspeed_title_cleaning_items',
    {
      p_batch_size: safeBatchSize,
      p_max_attempts: 3,
    }
  )

  if (claimError) {
    throw new Error(`Failed to claim title cleaning queue: ${claimError.message}`)
  }

  const items = (claimedItems || []) as ClaimedTitleCleaningItem[]
  const results: TitleCleaningBatchResult['results'] = []

  for (const item of items) {
    try {
      const title = await processQueueItem(item)

      const { error: completeError } = await supabase.rpc(
        'complete_lightspeed_title_cleaning_item',
        {
          p_queue_id: item.id,
          p_cleaned_description: title,
        }
      )

      if (completeError) {
        throw new Error(`Failed to mark title cleaning item complete: ${completeError.message}`)
      }

      results.push({
        queueId: item.id,
        jobId: item.job_id,
        itemId: item.lightspeed_item_id,
        success: true,
        title,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Title cleaning failed'

      const { error: failError } = await supabase.rpc(
        'fail_lightspeed_title_cleaning_item',
        {
          p_queue_id: item.id,
          p_error_message: errorMessage,
          p_max_attempts: 3,
        }
      )

      if (failError) {
        console.error('[Title Cleaning] Failed to mark queue item failed:', failError)
      }

      results.push({
        queueId: item.id,
        jobId: item.job_id,
        itemId: item.lightspeed_item_id,
        success: false,
        error: errorMessage,
      })
    }
  }

  const completed = results.filter((result) => result.success).length
  const failed = results.length - completed

  return {
    success: true,
    claimed: items.length,
    processed: results.length,
    completed,
    failed,
    results,
  }
}
