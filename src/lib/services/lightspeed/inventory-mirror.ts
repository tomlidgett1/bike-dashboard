import crypto from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { createLightspeedClient } from './lightspeed-client'
import type {
  LightspeedCategory,
  LightspeedItem,
  LightspeedItemImage,
  LightspeedItemPrice,
  LightspeedItemShop,
  LightspeedManufacturer,
  LightspeedVendor,
} from './types'

type SupabaseAdminClient = ReturnType<typeof createServiceRoleClient>

type SyncType = 'manual' | 'cron'
type SyncMode = 'full' | 'incremental'

interface ExistingInventoryRow {
  lightspeed_item_id: string
  source_hash: string | null
  total_qoh: number | string | null
  total_sellable: number | string | null
  default_price: number | string | null
  online_price: number | string | null
  msrp: number | string | null
  default_cost: number | string | null
  avg_cost: number | string | null
  is_in_stock: boolean | null
}

interface InventorySyncRow {
  user_id: string
  lightspeed_item_id: string
  lightspeed_account_id: string | null
  product_uuid: string | null
  system_sku: string | null
  custom_sku: string | null
  manufacturer_sku: string | null
  upc: string | null
  ean: string | null
  name: string | null
  description: string | null
  model_year: string | null
  item_type: string | null
  labor_duration_minutes: number | null
  brand_id: string | null
  brand_name: string | null
  category_id: string | null
  category_name: string | null
  category_path: string | null
  supplier_id: string | null
  supplier_name: string | null
  supplier_archived: boolean | null
  supplier_currency_code: string | null
  default_price: number
  online_price: number | null
  msrp: number | null
  default_cost: number
  avg_cost: number
  total_qoh: number
  total_sellable: number
  backorder: number
  component_qoh: number
  component_backorder: number
  reorder_point: number
  reorder_level: number
  on_layaway: number
  on_special_order: number
  on_workorder: number
  on_transfer_in: number
  on_transfer_out: number
  is_in_stock: boolean
  archived: boolean
  publish_to_ecom: boolean | null
  serialized: boolean | null
  discountable: boolean | null
  taxable: boolean | null
  tax_class_id: string | null
  tax_class_name: string | null
  department_id: string | null
  season_id: string | null
  default_vendor_id: string | null
  item_matrix_id: string | null
  primary_image_url: string | null
  images: unknown[]
  prices: Array<{ useType: string | null; useTypeID: string | null; amount: string | null }>
  stock_data: LightspeedItemShop[]
  raw_item: LightspeedItem
  raw_item_shops: LightspeedItemShop[]
  raw_vendor: LightspeedVendor | null
  source_hash: string
  lightspeed_created_at: string | null
  lightspeed_updated_at: string | null
  inventory_updated_at: string | null
  last_seen_at: string
  last_synced_at: string
  sync_batch_id: string
}

export interface InventoryMirrorSyncResult {
  user_id: string
  sync_batch_id: string
  sync_type: SyncType
  sync_mode: SyncMode
  status: 'completed'
  incremental_since: string | null
  total_item_shop_rows: number
  total_unique_items: number
  rows_upserted: number
  rows_created: number
  rows_changed: number
  rows_unchanged: number
  rows_marked_out_of_stock: number
  stock_changed: number
  price_changed: number
  pages_fetched: number
  hit_page_limit: boolean
  item_detail_pages_fetched: number
  item_detail_batches: number
  duration_ms: number
}

const MAX_STOCK_PAGES = 400
const MAX_INCREMENTAL_STOCK_PAGES = 80
const MAX_INCREMENTAL_ITEM_PAGES = 80
const MAX_ITEM_DETAIL_PAGES_PER_BATCH = 5
const BATCH_SIZE = 100
const UPSERT_BATCH_SIZE = 500
const INCREMENTAL_OVERLAP_MS = 2 * 60 * 1000

function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toNum(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value !== 'string') return 0
  const parsed = Number(value.replace(/[$,]/g, '').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

function toOptionalNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = toNum(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null
  if (value.toLowerCase() === 'true') return true
  if (value.toLowerCase() === 'false') return false
  return null
}

function toIso(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function itemIdFilter(itemIds: string[]): string | undefined {
  const ids = Array.from(new Set(itemIds.map(id => String(id).trim()).filter(Boolean)))
  if (ids.length === 0) return undefined
  if (ids.length === 1) return ids[0]
  return `IN,[${ids.join(',')}]`
}

function priceRows(item: LightspeedItem) {
  return ensureArray(item.Prices?.ItemPrice).map((price: LightspeedItemPrice) => ({
    useType: price.useType ?? null,
    useTypeID: price.useTypeID ?? null,
    amount: price.amount ?? null,
  }))
}

function priceByType(prices: ReturnType<typeof priceRows>, type: string): number | null {
  const price = prices.find(row => row.useType?.toLowerCase() === type.toLowerCase())
  return price ? toOptionalNum(price.amount) : null
}

function imageRows(item: LightspeedItem) {
  return ensureArray(item.Images?.Image).map((image: LightspeedItemImage) => ({
    imageID: image.imageID ?? null,
    filename: image.filename ?? null,
    description: image.description ?? null,
    ordering: image.ordering ?? null,
    publicID: image.publicID ?? null,
    baseImageURL: image.baseImageURL ?? null,
    url: image.baseImageURL && image.publicID ? `${image.baseImageURL}${image.publicID}` : null,
  }))
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

function sourceHash(value: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex')
}

function totalStockRow(stockRows: LightspeedItemShop[]): LightspeedItemShop | null {
  return stockRows.find(row => String(row.shopID) === '0') ?? null
}

function stockValue(stockRows: LightspeedItemShop[], key: keyof LightspeedItemShop): number {
  const totalRow = totalStockRow(stockRows)
  if (totalRow) return toNum(totalRow[key])
  return stockRows.reduce((sum, row) => sum + toNum(row[key]), 0)
}

function firstInventoryTimestamp(stockRows: LightspeedItemShop[]): string | null {
  const totalRow = totalStockRow(stockRows)
  return toIso(totalRow?.timeStamp ?? stockRows[0]?.timeStamp)
}

function withIncrementalOverlap(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Date(date.getTime() - INCREMENTAL_OVERLAP_MS).toISOString()
}

function groupStockRowsByItemId(stockRows: LightspeedItemShop[]) {
  const stockByItemId = new Map<string, LightspeedItemShop[]>()

  for (const row of stockRows) {
    const itemId = String(row.itemID)
    const rows = stockByItemId.get(itemId) ?? []
    rows.push(row)
    stockByItemId.set(itemId, rows)
  }

  return stockByItemId
}

function buildInventoryRow(args: {
  userId: string
  accountId: string
  item: LightspeedItem
  stockRows: LightspeedItemShop[]
  categoryMap: Map<string, LightspeedCategory>
  manufacturerMap: Map<string, LightspeedManufacturer>
  vendorMap: Map<string, LightspeedVendor>
  now: string
  syncBatchId: string
}): InventorySyncRow {
  const item = args.item
  const stockRows = args.stockRows
  const category = args.categoryMap.get(String(item.categoryID ?? ''))
  const manufacturer = args.manufacturerMap.get(String(item.manufacturerID ?? ''))
  const vendorId = cleanText(item.defaultVendorID)
  const vendor = vendorId && vendorId !== '0' ? args.vendorMap.get(vendorId) ?? null : null
  const prices = priceRows(item)
  const defaultPrice = priceByType(prices, 'Default') ?? toNum(prices[0]?.amount)
  const onlinePrice = priceByType(prices, 'Online')
  const msrp = priceByType(prices, 'MSRP')
  const images = imageRows(item)
  const totalRow = totalStockRow(stockRows)
  const totalQoh = stockValue(stockRows, 'qoh')
  const totalSellable = stockValue(stockRows, 'sellable')

  const source = {
    itemID: item.itemID,
    systemSku: item.systemSku,
    customSku: item.customSku,
    manufacturerSku: item.manufacturerSku,
    upc: item.upc,
    ean: item.ean,
    description: item.description,
    modelYear: item.modelYear,
    itemType: item.itemType,
    archived: item.archived,
    publishToEcom: item.publishToEcom,
    categoryID: item.categoryID,
    categoryName: category?.name ?? null,
    categoryPath: category?.fullPathName ?? null,
    manufacturerID: item.manufacturerID,
    manufacturerName: manufacturer?.name ?? null,
    defaultVendorID: item.defaultVendorID,
    vendorName: vendor?.name ?? null,
    defaultCost: item.defaultCost,
    avgCost: item.avgCost,
    prices,
    stockRows,
  }

  return {
    user_id: args.userId,
    lightspeed_item_id: String(item.itemID),
    lightspeed_account_id: args.accountId,
    product_uuid: null,
    system_sku: cleanText(item.systemSku),
    custom_sku: cleanText(item.customSku),
    manufacturer_sku: cleanText(item.manufacturerSku),
    upc: cleanText(item.upc),
    ean: cleanText(item.ean),
    name: cleanText(item.description),
    description: cleanText(item.description),
    model_year: cleanText(item.modelYear),
    item_type: cleanText(item.itemType),
    labor_duration_minutes: toOptionalNum((item as unknown as { laborDurationMinutes?: string }).laborDurationMinutes),
    brand_id: cleanText(item.manufacturerID),
    brand_name: cleanText(manufacturer?.name),
    category_id: cleanText(item.categoryID),
    category_name: cleanText(category?.name),
    category_path: cleanText(category?.fullPathName || category?.name),
    supplier_id: vendor ? cleanText(vendor.vendorID) : null,
    supplier_name: cleanText(vendor?.name),
    supplier_archived: toBool(vendor?.archived),
    supplier_currency_code: cleanText(vendor?.purchasingCurrency?.code),
    default_price: defaultPrice,
    online_price: onlinePrice,
    msrp,
    default_cost: toNum(item.defaultCost),
    avg_cost: toNum(item.avgCost),
    total_qoh: totalQoh,
    total_sellable: totalSellable,
    backorder: stockValue(stockRows, 'backorder'),
    component_qoh: stockValue(stockRows, 'componentQoh'),
    component_backorder: toNum((totalRow as unknown as { componentBackorder?: string } | null)?.componentBackorder),
    reorder_point: stockValue(stockRows, 'reorderPoint'),
    reorder_level: stockValue(stockRows, 'reorderLevel'),
    on_layaway: toNum((totalRow as unknown as { onLayaway?: string } | null)?.onLayaway),
    on_special_order: toNum((totalRow as unknown as { onSpecialOrder?: string } | null)?.onSpecialOrder),
    on_workorder: toNum((totalRow as unknown as { onWorkorder?: string } | null)?.onWorkorder),
    on_transfer_in: toNum((totalRow as unknown as { onTransferIn?: string } | null)?.onTransferIn),
    on_transfer_out: toNum((totalRow as unknown as { onTransferOut?: string } | null)?.onTransferOut),
    is_in_stock: totalQoh > 0,
    archived: toBool(item.archived) ?? false,
    publish_to_ecom: toBool(item.publishToEcom),
    serialized: toBool(item.serialized),
    discountable: toBool(item.discountable),
    taxable: toBool(item.tax),
    tax_class_id: cleanText(item.taxClassID),
    tax_class_name: null,
    department_id: cleanText(item.departmentID),
    season_id: cleanText(item.seasonID),
    default_vendor_id: vendorId,
    item_matrix_id: cleanText(item.itemMatrixID),
    primary_image_url: images.find(image => image.url)?.url ?? null,
    images,
    prices,
    stock_data: stockRows,
    raw_item: item,
    raw_item_shops: stockRows,
    raw_vendor: vendor,
    source_hash: sourceHash(source),
    lightspeed_created_at: toIso(item.createTime),
    lightspeed_updated_at: toIso(item.timeStamp),
    inventory_updated_at: firstInventoryTimestamp(stockRows),
    last_seen_at: args.now,
    last_synced_at: args.now,
    sync_batch_id: args.syncBatchId,
  }
}

async function fetchExistingInventory(admin: SupabaseAdminClient, userId: string): Promise<ExistingInventoryRow[]> {
  const rows: ExistingInventoryRow[] = []
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from('lightspeed_inventory')
      .select('lightspeed_item_id, source_hash, total_qoh, total_sellable, default_price, online_price, msrp, default_cost, avg_cost, is_in_stock')
      .eq('user_id', userId)
      .range(from, from + pageSize - 1)

    if (error) throw new Error(`Failed to read existing inventory mirror: ${error.message}`)
    rows.push(...((data ?? []) as ExistingInventoryRow[]))
    if (!data || data.length < pageSize) break
  }

  return rows
}

async function countExistingInventoryRows(admin: SupabaseAdminClient, userId: string): Promise<number> {
  const { count, error } = await admin
    .from('lightspeed_inventory')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (error) throw new Error(`Failed to count existing inventory mirror rows: ${error.message}`)
  return count ?? 0
}

async function fetchLatestCompletedInventoryRun(admin: SupabaseAdminClient, userId: string): Promise<{
  completed_at: string | null
  started_at: string
} | null> {
  const { data, error } = await admin
    .from('lightspeed_inventory_sync_runs')
    .select('completed_at, started_at')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Failed to load latest completed inventory sync run: ${error.message}`)
  return data ?? null
}

async function upsertRows(admin: SupabaseAdminClient, rows: InventorySyncRow[]) {
  for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + UPSERT_BATCH_SIZE)
    const { error } = await admin
      .from('lightspeed_inventory')
      .upsert(batch, { onConflict: 'user_id,lightspeed_item_id' })

    if (error) throw new Error(`Failed to upsert inventory batch: ${error.message}`)
  }
}

async function fetchItemsForIds(args: {
  userId: string
  itemIds: string[]
  maxPagesPerBatch?: number
}) {
  const client = createLightspeedClient(args.userId)
  const items: LightspeedItem[] = []
  let pagesFetched = 0
  let hitPageLimit = false
  const batchCount = Math.ceil(args.itemIds.length / BATCH_SIZE)

  for (let index = 0; index < args.itemIds.length; index += BATCH_SIZE) {
    const batch = args.itemIds.slice(index, index + BATCH_SIZE)
    const result = await client.getAllItemsCursor({
      itemID: itemIdFilter(batch),
    }, {
      maxPages: args.maxPagesPerBatch ?? MAX_ITEM_DETAIL_PAGES_PER_BATCH,
      limit: 100,
    })
    items.push(...result.items)
    pagesFetched += result.pagesFetched
    hitPageLimit ||= result.hitPageLimit
  }

  return {
    items,
    pagesFetched,
    hitPageLimit,
    batchesFetched: batchCount,
  }
}

export async function getInventoryMirrorStatus(userId: string, admin: SupabaseAdminClient = createServiceRoleClient()) {
  const [totalResult, inStockResult, latestRunResult] = await Promise.all([
    admin.from('lightspeed_inventory').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('lightspeed_inventory').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_in_stock', true).gt('total_qoh', 0),
    admin
      .from('lightspeed_inventory_sync_runs')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (totalResult.error) throw new Error(`Failed to count inventory mirror rows: ${totalResult.error.message}`)
  if (inStockResult.error) throw new Error(`Failed to count in-stock inventory mirror rows: ${inStockResult.error.message}`)
  if (latestRunResult.error) throw new Error(`Failed to load latest inventory sync run: ${latestRunResult.error.message}`)

  return {
    total_rows: totalResult.count ?? 0,
    in_stock_rows: inStockResult.count ?? 0,
    latest_run: latestRunResult.data ?? null,
  }
}

export async function syncLightspeedInventoryMirrorForUser(args: {
  userId: string
  admin?: SupabaseAdminClient
  syncType?: SyncType
  syncMode?: SyncMode
  since?: string
  maxStockPages?: number
}): Promise<InventoryMirrorSyncResult> {
  const admin = args.admin ?? createServiceRoleClient()
  const startedAt = Date.now()
  const now = new Date().toISOString()
  const syncBatchId = crypto.randomUUID()
  const syncType = args.syncType ?? 'manual'
  const syncMode = args.syncMode ?? (syncType === 'cron' ? 'incremental' : 'full')
  let runId: string | null = null

  const { data: run, error: runError } = await admin
    .from('lightspeed_inventory_sync_runs')
    .insert({
      user_id: args.userId,
      sync_batch_id: syncBatchId,
      sync_type: syncType,
      status: 'running',
      started_at: now,
    })
    .select('id')
    .single()

  if (runError) throw new Error(`Failed to create inventory sync run: ${runError.message}`)
  runId = run.id

  try {
    const client = createLightspeedClient(args.userId)
    const accountId = await client.getAccountId()
    const existingRowCount = await countExistingInventoryRows(admin, args.userId)
    const latestCompletedRun = syncMode === 'incremental'
      ? await fetchLatestCompletedInventoryRun(admin, args.userId)
      : null
    const latestCompletedAt = latestCompletedRun?.completed_at || latestCompletedRun?.started_at || null
    const incrementalSince = syncMode === 'incremental'
      ? args.since ?? (latestCompletedAt ? withIncrementalOverlap(latestCompletedAt) : null)
      : null

    if (syncMode === 'incremental' && (!incrementalSince || existingRowCount === 0)) {
      const durationMs = Date.now() - startedAt
      const result: InventoryMirrorSyncResult = {
        user_id: args.userId,
        sync_batch_id: syncBatchId,
        sync_type: syncType,
        sync_mode: syncMode,
        status: 'completed',
        incremental_since: incrementalSince,
        total_item_shop_rows: 0,
        total_unique_items: 0,
        rows_upserted: 0,
        rows_created: 0,
        rows_changed: 0,
        rows_unchanged: 0,
        rows_marked_out_of_stock: 0,
        stock_changed: 0,
        price_changed: 0,
        pages_fetched: 0,
        hit_page_limit: false,
        item_detail_pages_fetched: 0,
        item_detail_batches: 0,
        duration_ms: durationMs,
      }

      await admin
        .from('lightspeed_inventory_sync_runs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          metadata: {
            sync_mode: syncMode,
            incremental_since: incrementalSince,
            skipped_reason: existingRowCount === 0 ? 'no_existing_inventory_rows' : 'no_previous_completed_sync',
          },
        })
        .eq('id', runId)

      return result
    }

    let stockResult: {
      itemShops: LightspeedItemShop[]
      pagesFetched: number
      hitPageLimit: boolean
      changedItemShopRows?: number
      changedItemRows?: number
    }
    let changedItemsHitPageLimit = false
    let changedItemsPagesFetched = 0

    if (syncMode === 'incremental' && incrementalSince) {
      const [changedStockResult, changedItemResult] = await Promise.all([
        client.getAllItemShopsCursor({
          timeStamp: `>,${incrementalSince}`,
        }, {
          maxPages: args.maxStockPages ?? MAX_INCREMENTAL_STOCK_PAGES,
          limit: 100,
        }),
        client.getAllItemsCursor({
          timeStamp: `>,${incrementalSince}`,
        }, {
          maxPages: MAX_INCREMENTAL_ITEM_PAGES,
          limit: 100,
        }),
      ])

      changedItemsHitPageLimit = changedItemResult.hitPageLimit
      changedItemsPagesFetched = changedItemResult.pagesFetched

      const changedItemIds = Array.from(new Set([
        ...changedStockResult.itemShops.map(row => String(row.itemID)),
        ...changedItemResult.items.map(item => String(item.itemID)),
      ]))

      if (changedItemIds.length === 0) {
        stockResult = {
          itemShops: [],
          pagesFetched: changedStockResult.pagesFetched + changedItemResult.pagesFetched,
          hitPageLimit: changedStockResult.hitPageLimit || changedItemResult.hitPageLimit,
          changedItemShopRows: changedStockResult.itemShops.length,
          changedItemRows: changedItemResult.items.length,
        }
      } else {
        const fullStockForChangedItems = await client.getAllItemShopsForItemIdsCursor(changedItemIds, {
          batchSize: BATCH_SIZE,
          maxPagesPerBatch: MAX_ITEM_DETAIL_PAGES_PER_BATCH,
          limit: 100,
        })

        stockResult = {
          itemShops: fullStockForChangedItems.itemShops,
          pagesFetched: changedStockResult.pagesFetched + changedItemResult.pagesFetched + fullStockForChangedItems.pagesFetched,
          hitPageLimit: changedStockResult.hitPageLimit || changedItemResult.hitPageLimit || fullStockForChangedItems.hitPageLimit,
          changedItemShopRows: changedStockResult.itemShops.length,
          changedItemRows: changedItemResult.items.length,
        }
      }
    } else {
      stockResult = await client.getAllItemShopsCursor(undefined, {
        maxPages: args.maxStockPages ?? MAX_STOCK_PAGES,
        limit: 100,
      })
    }

    const stockByItemId = groupStockRowsByItemId(stockResult.itemShops)
    const itemIds = Array.from(stockByItemId.keys())
    const [itemResult, categories, manufacturers, vendors] = itemIds.length > 0
      ? await Promise.all([
        fetchItemsForIds({
          userId: args.userId,
          itemIds,
        }),
        client.getAllCategories({ archived: 'false' }).catch(() => [] as LightspeedCategory[]),
        client.getAllManufacturers().catch(() => [] as LightspeedManufacturer[]),
        client.getAllVendors().catch(() => [] as LightspeedVendor[]),
      ])
      : [
        { items: [] as LightspeedItem[], pagesFetched: 0, hitPageLimit: false, batchesFetched: 0 },
        [] as LightspeedCategory[],
        [] as LightspeedManufacturer[],
        [] as LightspeedVendor[],
      ] as const
    const itemById = new Map(itemResult.items.map(item => [String(item.itemID), item]))
    const categoryMap = new Map(categories.map(category => [String(category.categoryID), category]))
    const manufacturerMap = new Map(manufacturers.map(manufacturer => [String(manufacturer.manufacturerID), manufacturer]))
    const vendorMap = new Map(vendors.map(vendor => [String(vendor.vendorID), vendor]))

    const rows = itemIds
      .map(itemId => {
        const item = itemById.get(itemId)
        const stockRows = stockByItemId.get(itemId) ?? []
        if (!item || stockRows.length === 0) return null
        return buildInventoryRow({
          userId: args.userId,
          accountId,
          item,
          stockRows,
          categoryMap,
          manufacturerMap,
          vendorMap,
          now,
          syncBatchId,
        })
      })
      .filter((row): row is InventorySyncRow => Boolean(row))

    const existingRows = await fetchExistingInventory(admin, args.userId)
    const existingByItemId = new Map(existingRows.map(row => [row.lightspeed_item_id, row]))
    const syncedItemIds = new Set(rows.map(row => row.lightspeed_item_id))

    let rowsCreated = 0
    let rowsChanged = 0
    let rowsUnchanged = 0
    let stockChanged = 0
    let priceChanged = 0

    for (const row of rows) {
      const existing = existingByItemId.get(row.lightspeed_item_id)
      if (!existing) {
        rowsCreated += 1
        continue
      }

      if (existing.source_hash === row.source_hash) rowsUnchanged += 1
      else rowsChanged += 1

      if (toNum(existing.total_qoh) !== row.total_qoh || toNum(existing.total_sellable) !== row.total_sellable) {
        stockChanged += 1
      }

      if (
        toNum(existing.default_price) !== row.default_price ||
        toNum(existing.online_price) !== (row.online_price ?? 0) ||
        toNum(existing.msrp) !== (row.msrp ?? 0) ||
        toNum(existing.default_cost) !== row.default_cost ||
        toNum(existing.avg_cost) !== row.avg_cost
      ) {
        priceChanged += 1
      }
    }

    await upsertRows(admin, rows)

    const missingItemIds = syncMode === 'full'
      ? existingRows
        .filter(row => row.is_in_stock !== false && !syncedItemIds.has(row.lightspeed_item_id))
        .map(row => row.lightspeed_item_id)
      : []

    for (let index = 0; index < missingItemIds.length; index += UPSERT_BATCH_SIZE) {
      const batch = missingItemIds.slice(index, index + UPSERT_BATCH_SIZE)
      const { error } = await admin
        .from('lightspeed_inventory')
        .update({
          is_in_stock: false,
          total_qoh: 0,
          total_sellable: 0,
          last_synced_at: now,
          sync_batch_id: syncBatchId,
        })
        .eq('user_id', args.userId)
        .in('lightspeed_item_id', batch)

      if (error) throw new Error(`Failed to mark out-of-stock rows: ${error.message}`)
    }

    const durationMs = Date.now() - startedAt
    const result: InventoryMirrorSyncResult = {
      user_id: args.userId,
      sync_batch_id: syncBatchId,
      sync_type: syncType,
      sync_mode: syncMode,
      status: 'completed',
      incremental_since: incrementalSince,
      total_item_shop_rows: stockResult.itemShops.length,
      total_unique_items: itemIds.length,
      rows_upserted: rows.length,
      rows_created: rowsCreated,
      rows_changed: rowsChanged,
      rows_unchanged: rowsUnchanged,
      rows_marked_out_of_stock: missingItemIds.length,
      stock_changed: stockChanged,
      price_changed: priceChanged,
      pages_fetched: stockResult.pagesFetched,
      hit_page_limit: stockResult.hitPageLimit || itemResult.hitPageLimit || changedItemsHitPageLimit,
      item_detail_pages_fetched: itemResult.pagesFetched + changedItemsPagesFetched,
      item_detail_batches: itemResult.batchesFetched,
      duration_ms: durationMs,
    }

    await admin
      .from('lightspeed_inventory_sync_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        total_item_shop_rows: result.total_item_shop_rows,
        total_unique_items: result.total_unique_items,
        rows_upserted: result.rows_upserted,
        rows_created: result.rows_created,
        rows_changed: result.rows_changed,
        rows_unchanged: result.rows_unchanged,
        rows_marked_out_of_stock: result.rows_marked_out_of_stock,
        stock_changed: result.stock_changed,
        price_changed: result.price_changed,
        pages_fetched: result.pages_fetched,
        hit_page_limit: result.hit_page_limit,
        metadata: {
          sync_mode: syncMode,
          incremental_since: incrementalSince,
          item_detail_pages_fetched: result.item_detail_pages_fetched,
          item_detail_batches: result.item_detail_batches,
          changed_item_shop_rows: stockResult.changedItemShopRows ?? null,
          changed_item_rows: stockResult.changedItemRows ?? null,
          category_count: categories.length,
          brand_count: manufacturers.length,
          supplier_count: vendors.length,
        },
      })
      .eq('id', runId)

    // Do NOT advance lightspeed_connections.last_sync_at here.
    // That watermark is used by marketplace stock reconciliation / UI "last sync".
    // The inventory mirror has its own lightspeed_inventory_sync_runs timeline.

    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Inventory mirror sync failed'
    if (runId) {
      await admin
        .from('lightspeed_inventory_sync_runs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          error_message: message,
        })
        .eq('id', runId)
    }
    throw error
  }
}

export async function syncLightspeedInventoryMirrorForConnectedUsers(args?: {
  admin?: SupabaseAdminClient
  maxUsers?: number
  syncMode?: SyncMode
  maxStockPages?: number
}) {
  const admin = args?.admin ?? createServiceRoleClient()
  const maxUsers = Math.min(Math.max(args?.maxUsers ?? 10, 1), 50)

  const { data: connections, error } = await admin
    .from('lightspeed_connections')
    .select('user_id, account_name')
    .eq('status', 'connected')
    .not('access_token_encrypted', 'is', null)
    .limit(maxUsers)

  if (error) throw new Error(`Failed to load connected Lightspeed stores: ${error.message}`)

  const results: Array<{
    user_id: string
    account_name: string | null
    success: boolean
    sync_mode?: SyncMode
    rows_upserted?: number
    rows_created?: number
    rows_changed?: number
    rows_marked_out_of_stock?: number
    stock_changed?: number
    price_changed?: number
    error?: string
  }> = []

  for (const connection of connections ?? []) {
    try {
      const result = await syncLightspeedInventoryMirrorForUser({
        userId: connection.user_id,
        admin,
        syncType: 'cron',
        syncMode: args?.syncMode ?? 'incremental',
        maxStockPages: args?.maxStockPages,
      })

      results.push({
        user_id: connection.user_id,
        account_name: connection.account_name,
        success: true,
        sync_mode: result.sync_mode,
        rows_upserted: result.rows_upserted,
        rows_created: result.rows_created,
        rows_changed: result.rows_changed,
        rows_marked_out_of_stock: result.rows_marked_out_of_stock,
        stock_changed: result.stock_changed,
        price_changed: result.price_changed,
      })
    } catch (error) {
      results.push({
        user_id: connection.user_id,
        account_name: connection.account_name,
        success: false,
        error: error instanceof Error ? error.message : 'Inventory mirror sync failed',
      })
    }
  }

  return {
    stores_checked: connections?.length ?? 0,
    succeeded: results.filter(result => result.success).length,
    failed: results.filter(result => !result.success).length,
    results,
  }
}
