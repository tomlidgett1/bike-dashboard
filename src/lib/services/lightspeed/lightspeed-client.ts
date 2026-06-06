/**
 * Lightspeed R-Series API Client
 * 
 * Type-safe client with rate limiting, exponential backoff retry,
 * and automatic token refresh.
 */

import { LIGHTSPEED_CONFIG } from './config'
import { getValidAccessToken, refreshAccessToken, updateLastSyncTime } from './token-manager'
import {
  assembleYellowJerseyWorkorderItemRequests,
  assembleYellowJerseyWorkorderRequest,
  YELLOW_JERSEY_CUSTOMER,
  YELLOW_JERSEY_WORKORDER_TITLE,
} from './workorder'
import type {
  LightspeedAccountResponse,
  LightspeedItemsResponse,
  LightspeedCategoriesResponse,
  LightspeedSalesResponse,
  LightspeedCustomersResponse,
  LightspeedItemShopsResponse,
  LightspeedShopsResponse,
  LightspeedRegistersResponse,
  LightspeedEmployeesResponse,
  LightspeedQueryParams,
  LightspeedItem,
  LightspeedItemShop,
  LightspeedCategory,
  LightspeedSale,
  LightspeedCustomer,
  LightspeedShop,
  LightspeedEmployee,
  LightspeedWorkorder,
  LightspeedWorkorderStatus,
  LightspeedWorkorderStatusesResponse,
  LightspeedWorkorderItem,
  LightspeedWorkorderItemsResponse,
  LightspeedWorkorderWithRelations,
  LightspeedWorkordersResponse,
  LightspeedManufacturer,
  LightspeedManufacturersResponse,
  LightspeedVendor,
  LightspeedVendorsResponse,
} from './types'

interface CursorPageProgress {
  pagesFetched: number
  pageCount: number
  totalCount: number
  hasNextPage: boolean
  hitPageLimit: boolean
}

interface CursorOptions {
  maxPages?: number
  limit?: number
  onPage?: (progress: CursorPageProgress) => void
}

// ============================================================
// Rate Limiter
// ============================================================

class RateLimiter {
  private timestamps: number[] = []
  private readonly maxRequests: number
  private readonly windowMs: number

  constructor(requestsPerSecond: number) {
    this.maxRequests = requestsPerSecond
    this.windowMs = 1000
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now()
    
    // Remove timestamps outside the window
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs)
    
    if (this.timestamps.length >= this.maxRequests) {
      // Wait until the oldest request expires
      const oldestTimestamp = this.timestamps[0]
      const waitTime = this.windowMs - (now - oldestTimestamp)
      
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
      
      // Recursively check again
      return this.waitForSlot()
    }
    
    this.timestamps.push(now)
  }
}

// ============================================================
// Lightspeed API Client
// ============================================================

export class LightspeedClient {
  private userId: string
  private rateLimiter: RateLimiter
  private accessToken: string | null = null
  private accessTokenPromise: Promise<string | null> | null = null
  private accountId: string | null = null
  private accountIdPromise: Promise<string> | null = null

  constructor(userId: string) {
    this.userId = userId
    this.rateLimiter = new RateLimiter(LIGHTSPEED_CONFIG.RATE_LIMIT_REQUESTS_PER_SECOND)
  }

  private async getCachedAccessToken(): Promise<string | null> {
    if (this.accessToken) return this.accessToken
    if (!this.accessTokenPromise) {
      this.accessTokenPromise = getValidAccessToken(this.userId)
        .then(token => {
          this.accessToken = token
          return token
        })
        .finally(() => {
          this.accessTokenPromise = null
        })
    }
    return this.accessTokenPromise
  }

  private async refreshCachedAccessToken(): Promise<string | null> {
    const refreshed = await refreshAccessToken(this.userId)
    this.accessToken = refreshed?.accessToken ?? null
    return this.accessToken
  }

  /**
   * Make an authenticated API request with retry logic and automatic token refresh on 401.
   *
   * Lightspeed recommendation: wait for a 401, then refresh once.
   * We also proactively refresh via getValidAccessToken before the first attempt.
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    let accessToken = await this.getCachedAccessToken()

    if (!accessToken) {
      throw new Error('No valid access token available. Please reconnect your Lightspeed account.')
    }

    // Support full URLs returned by cursor-based pagination (e.g. @attributes.next)
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${LIGHTSPEED_CONFIG.API_BASE_URL}${endpoint}`

    let lastError: Error | null = null
    let tokenRefreshed = false

    for (let attempt = 0; attempt < LIGHTSPEED_CONFIG.MAX_RETRIES; attempt++) {
      await this.rateLimiter.waitForSlot()

      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...options.headers,
          },
        })

        // Token expired — refresh once and retry without consuming a retry slot
        if (response.status === 401 && !tokenRefreshed) {
          tokenRefreshed = true
          console.log('[Lightspeed] 401 received, refreshing access token...')
          const refreshedAccessToken = await this.refreshCachedAccessToken()
          if (refreshedAccessToken) {
            accessToken = refreshedAccessToken
            attempt-- // don't count this as a retry attempt
            continue
          }
          throw new Error('Session expired. Please reconnect your Lightspeed account.')
        }

        // Handle rate limiting (429)
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After')
          const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 :
            LIGHTSPEED_CONFIG.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt)

          console.log(`Rate limited, waiting ${waitTime}ms before retry`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        }

        // Handle server errors (5xx)
        if (response.status >= 500) {
          const waitTime = LIGHTSPEED_CONFIG.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt)
          console.log(`Server error ${response.status}, waiting ${waitTime}ms before retry`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        }

        if (!response.ok) {
          const errorBody = await response.text()
          throw new Error(`Lightspeed API error: ${response.status} - ${errorBody}`)
        }

        return await response.json()
      } catch (error) {
        lastError = error as Error

        // Don't retry on non-retryable errors
        if (
          lastError.message.includes('No valid access token') ||
          lastError.message.includes('Session expired')
        ) {
          throw lastError
        }

        // Exponential backoff for network errors
        if (attempt < LIGHTSPEED_CONFIG.MAX_RETRIES - 1) {
          const waitTime = LIGHTSPEED_CONFIG.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt)
          console.log(`Request failed, waiting ${waitTime}ms before retry:`, lastError.message)
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }
      }
    }

    throw lastError || new Error('Request failed after maximum retries')
  }

  /**
   * Build query string from params
   */
  private buildQueryString(params?: LightspeedQueryParams): string {
    if (!params) return ''
    
    const searchParams = new URLSearchParams()
    
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value))
      }
    }
    
    const queryString = searchParams.toString()
    return queryString ? `?${queryString}` : ''
  }

  /**
   * Ensure array format for API responses
   */
  private ensureArray<T>(data: T | T[] | undefined): T[] {
    if (!data) return []
    return Array.isArray(data) ? data : [data]
  }

  // ============================================================
  // Account Methods
  // ============================================================

  /**
   * Get account information
   */
  async getAccount(): Promise<LightspeedAccountResponse> {
    const response = await this.request<LightspeedAccountResponse>('/Account.json')
    this.accountId = response.Account.accountID
    return response
  }

  /**
   * Get the account ID (fetches if not cached)
   */
  async getAccountId(): Promise<string> {
    if (this.accountId) return this.accountId
    if (!this.accountIdPromise) {
      this.accountIdPromise = this.getAccount()
        .then(account => account.Account.accountID)
        .finally(() => {
          this.accountIdPromise = null
        })
    }
    this.accountId = await this.accountIdPromise
    return this.accountId
  }

  // ============================================================
  // Product/Item Methods
  // ============================================================

  /**
   * Get all items (products) with pagination
   */
  async getItems(params?: LightspeedQueryParams): Promise<LightspeedItem[]> {
    const accountId = await this.getAccountId()
    const queryString = this.buildQueryString(params)
    const response = await this.request<LightspeedItemsResponse>(
      `/Account/${accountId}/Item.json${queryString}`
    )
    return this.ensureArray(response.Item)
  }

  /**
   * Get a single item by ID
   */
  async getItem(itemId: string): Promise<LightspeedItem> {
    const accountId = await this.getAccountId()
    const response = await this.request<{ Item: LightspeedItem }>(
      `/Account/${accountId}/Item/${itemId}.json`
    )
    return response.Item
  }

  /**
   * Update a single Lightspeed item.
   *
   * Lightspeed's Item endpoint uses PUT for partial updates: omitted fields
   * retain their existing values.
   */
  async updateItem(
    itemId: string,
    payload: Partial<Pick<
      LightspeedItem,
      | 'description'
      | 'modelYear'
      | 'upc'
      | 'categoryID'
      | 'manufacturerID'
      | 'defaultCost'
    >>
  ): Promise<LightspeedItem> {
    const accountId = await this.getAccountId()
    const response = await this.request<{ Item: LightspeedItem }>(
      `/Account/${accountId}/Item/${itemId}.json`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    )
    return response.Item
  }

  /**
   * Get all items with automatic pagination
   */
  async getAllItems(additionalParams?: Omit<LightspeedQueryParams, 'offset' | 'limit'>): Promise<LightspeedItem[]> {
    const allItems: LightspeedItem[] = []
    let offset = 0
    const limit = 100 // Max per request
    
    while (true) {
      const items = await this.getItems({
        ...additionalParams,
        offset,
        limit,
      })
      
      allItems.push(...items)
      
      if (items.length < limit) {
        break
      }
      
      offset += limit
    }
    
    return allItems
  }

  /**
   * Get items with cursor pagination.
   *
   * Newer Lightspeed endpoints reject offset pagination and return a full
   * @attributes.next URL instead. Use this for live agent/search workflows.
   */
  async getAllItemsCursor(
    additionalParams?: Omit<LightspeedQueryParams, 'offset' | 'limit'>,
    options?: CursorOptions
  ): Promise<{ items: LightspeedItem[]; pagesFetched: number; hitPageLimit: boolean }> {
    const allItems: LightspeedItem[] = []
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 100)
    const maxPages = Math.max(options?.maxPages ?? 50, 1)
    const accountId = await this.getAccountId()

    let endpoint: string | null = `/Account/${accountId}/Item.json${this.buildQueryString({
      ...additionalParams,
      limit,
    })}`
    let pagesFetched = 0

    while (endpoint && pagesFetched < maxPages) {
      const response: LightspeedItemsResponse = await this.request<LightspeedItemsResponse>(endpoint)
      const page = this.ensureArray(response.Item)
      allItems.push(...page)
      pagesFetched++

      const next: string | undefined = response['@attributes']?.next
      const hasNextPage = Boolean(next && page.length >= limit)
      const hitPageLimit = hasNextPage && pagesFetched >= maxPages
      options?.onPage?.({
        pagesFetched,
        pageCount: page.length,
        totalCount: allItems.length,
        hasNextPage,
        hitPageLimit,
      })
      if (!next || page.length < limit) {
        endpoint = null
      } else {
        endpoint = next
      }
    }

    return {
      items: allItems,
      pagesFetched,
      hitPageLimit: Boolean(endpoint),
    }
  }

  // ============================================================
  // Category Methods
  // ============================================================

  /**
   * Get a single page of categories
   */
  async getCategories(params?: LightspeedQueryParams): Promise<LightspeedCategory[]> {
    const accountId = await this.getAccountId()
    const queryString = this.buildQueryString(params)
    const response = await this.request<LightspeedCategoriesResponse>(
      `/Account/${accountId}/Category.json${queryString}`
    )
    return this.ensureArray(response.Category)
  }

  /**
   * Get ALL categories across all pages.
   *
   * Lightspeed deprecated offset-based pagination for the Category endpoint.
   * We now follow the @attributes.next cursor URL returned in each response.
   * Falls back to single-page fetch when no next URL is present.
   */
  async getAllCategories(additionalParams?: Omit<LightspeedQueryParams, 'offset' | 'limit'>): Promise<LightspeedCategory[]> {
    const allCategories: LightspeedCategory[] = []
    const limit = 100
    const MAX_PAGES = 50 // safety guard
    let pageCount = 0

    const accountId = await this.getAccountId()

    // First request — use limit only, no offset (offset is no longer accepted)
    const queryString = this.buildQueryString({ ...additionalParams, limit })
    let endpoint: string = `/Account/${accountId}/Category.json${queryString}`

    while (pageCount++ < MAX_PAGES) {
      const response = await this.request<LightspeedCategoriesResponse>(endpoint)
      const page = this.ensureArray(response.Category)
      allCategories.push(...page)

      // Follow the cursor URL for the next page, or stop
      const nextUrl = response['@attributes']?.next
      if (!nextUrl || page.length < limit) break
      endpoint = nextUrl // request() now accepts full URLs
    }

    return allCategories
  }

  /**
   * Get a single category by ID.
   */
  async getCategory(categoryId: string): Promise<LightspeedCategory> {
    const accountId = await this.getAccountId()
    const response = await this.request<{ Category: LightspeedCategory }>(
      `/Account/${accountId}/Category/${categoryId}.json`
    )
    return response.Category
  }

  /**
   * Create a new category in Lightspeed.
   */
  async createCategory(payload: {
    name: string
    fullPathName: string
    parentID?: string
  }): Promise<LightspeedCategory> {
    const accountId = await this.getAccountId()
    const response = await this.request<{ Category: LightspeedCategory }>(
      `/Account/${accountId}/Category.json`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: payload.name,
          fullPathName: payload.fullPathName,
          parentID: payload.parentID ?? '0',
        }),
      }
    )
    return response.Category
  }

  /**
   * Update an existing category in Lightspeed.
   */
  async updateCategory(
    categoryId: string,
    payload: {
      name: string
      fullPathName: string
      parentID?: string
    }
  ): Promise<LightspeedCategory> {
    const accountId = await this.getAccountId()
    const body: Record<string, string> = {
      name: payload.name,
      fullPathName: payload.fullPathName,
    }
    if (payload.parentID !== undefined) {
      body.parentID = payload.parentID
    }

    const response = await this.request<{ Category: LightspeedCategory }>(
      `/Account/${accountId}/Category/${categoryId}.json`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      }
    )
    return response.Category
  }

  /**
   * Permanently delete a category from Lightspeed.
   */
  async deleteCategory(categoryId: string): Promise<LightspeedCategory> {
    const accountId = await this.getAccountId()
    const response = await this.request<{ Category: LightspeedCategory }>(
      `/Account/${accountId}/Category/${categoryId}.json`,
      {
        method: 'DELETE',
      }
    )
    return response.Category
  }

  // ============================================================
  // Manufacturer Methods
  // ============================================================

  /**
   * Get all manufacturers (brands) with pagination
   */
  async getAllManufacturers(additionalParams?: Omit<LightspeedQueryParams, 'offset' | 'limit'>): Promise<LightspeedManufacturer[]> {
    const allManufacturers: LightspeedManufacturer[] = []
    const accountId = await this.getAccountId()
    const limit = 100
    let nextUrl: string = `/Account/${accountId}/Manufacturer.json${this.buildQueryString({
      ...additionalParams,
      limit,
    })}`

    for (let page = 0; page < 50; page++) {
      const response = await this.request<LightspeedManufacturersResponse>(nextUrl)
      const page_data = this.ensureArray(response.Manufacturer)
      allManufacturers.push(...page_data)
      const next = response['@attributes']?.next
      if (!next || page_data.length < limit) break
      nextUrl = next
    }

    return allManufacturers
  }

  /**
   * Create a new manufacturer (brand) in Lightspeed.
   */
  async createManufacturer(name: string): Promise<LightspeedManufacturer> {
    const accountId = await this.getAccountId()
    const response = await this.request<{ Manufacturer: LightspeedManufacturer }>(
      `/Account/${accountId}/Manufacturer.json`,
      {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      },
    )
    return response.Manufacturer
  }

  // ============================================================
  // Vendor / Supplier Methods
  // ============================================================

  /**
   * Get all vendors (suppliers) with cursor pagination.
   */
  async getAllVendors(additionalParams?: Omit<LightspeedQueryParams, 'offset' | 'limit'>): Promise<LightspeedVendor[]> {
    const allVendors: LightspeedVendor[] = []
    const accountId = await this.getAccountId()
    const limit = 100
    let nextUrl: string = `/Account/${accountId}/Vendor.json${this.buildQueryString({
      ...additionalParams,
      limit,
    })}`

    for (let page = 0; page < 50; page++) {
      const response = await this.request<LightspeedVendorsResponse>(nextUrl)
      const pageData = this.ensureArray(response.Vendor)
      allVendors.push(...pageData)
      const next = response['@attributes']?.next
      if (!next || pageData.length < limit) break
      nextUrl = next
    }

    return allVendors
  }

  // ============================================================
  // Sales/Order Methods
  // ============================================================

  /**
   * Get sales (orders)
   */
  async getSales(params?: LightspeedQueryParams): Promise<LightspeedSale[]> {
    const accountId = await this.getAccountId()
    const queryString = this.buildQueryString(params)
    const response = await this.request<LightspeedSalesResponse>(
      `/Account/${accountId}/Sale.json${queryString}`
    )
    return this.ensureArray(response.Sale)
  }

  /**
   * Get a single sale by ID
   */
  async getSale(saleId: string): Promise<LightspeedSale> {
    const accountId = await this.getAccountId()
    const response = await this.request<{ Sale: LightspeedSale }>(
      `/Account/${accountId}/Sale/${saleId}.json`
    )
    return response.Sale
  }

  /**
   * Get sales with cursor pagination.
   */
  async getAllSalesCursor(
    additionalParams?: Omit<LightspeedQueryParams, 'offset' | 'limit'>,
    options?: CursorOptions
  ): Promise<{ sales: LightspeedSale[]; pagesFetched: number; hitPageLimit: boolean }> {
    const allSales: LightspeedSale[] = []
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 100)
    const maxPages = Math.max(options?.maxPages ?? 50, 1)
    const accountId = await this.getAccountId()

    let endpoint: string | null = `/Account/${accountId}/Sale.json${this.buildQueryString({
      ...additionalParams,
      limit,
    })}`
    let pagesFetched = 0

    while (endpoint && pagesFetched < maxPages) {
      const response: LightspeedSalesResponse = await this.request<LightspeedSalesResponse>(endpoint)
      const page = this.ensureArray(response.Sale)
      allSales.push(...page)
      pagesFetched++

      const next: string | undefined = response['@attributes']?.next
      const hasNextPage = Boolean(next && page.length >= limit)
      const hitPageLimit = hasNextPage && pagesFetched >= maxPages
      options?.onPage?.({
        pagesFetched,
        pageCount: page.length,
        totalCount: allSales.length,
        hasNextPage,
        hitPageLimit,
      })
      if (!next || page.length < limit) {
        endpoint = null
      } else {
        endpoint = next
      }
    }

    return {
      sales: allSales,
      pagesFetched,
      hitPageLimit: Boolean(endpoint),
    }
  }

  // ============================================================
  // Workorder Methods
  // ============================================================

  /**
   * Get the workorder statuses configured for the account.
   */
  async getWorkorderStatuses(params?: LightspeedQueryParams): Promise<LightspeedWorkorderStatus[]> {
    const accountId = await this.getAccountId()
    const queryString = this.buildQueryString(params)
    const response = await this.request<LightspeedWorkorderStatusesResponse>(
      `/Account/${accountId}/WorkorderStatus.json${queryString}`
    )
    return this.ensureArray(response.WorkorderStatus)
  }

  /**
   * List workorders for the account (cursor-paginated).
   */
  async getWorkorders(params?: LightspeedQueryParams): Promise<LightspeedWorkorderWithRelations[]> {
    const accountId = await this.getAccountId()
    const queryString = this.buildQueryString(params)
    const response = await this.request<LightspeedWorkordersResponse>(
      `/Account/${accountId}/Workorder.json${queryString}`
    )
    return this.ensureArray(response.Workorder)
  }

  /**
   * Fetch a single workorder by ID (with optional relations).
   */
  async getWorkorder(
    workorderId: string,
    params?: LightspeedQueryParams,
  ): Promise<LightspeedWorkorderWithRelations | null> {
    const accountId = await this.getAccountId()
    const queryString = this.buildQueryString(params)
    try {
      const response = await this.request<{ Workorder: LightspeedWorkorderWithRelations }>(
        `/Account/${accountId}/Workorder/${workorderId}.json${queryString}`,
      )
      return response.Workorder ?? null
    } catch {
      return null
    }
  }

  /**
   * List parts/items attached to a workorder (with Item description when available).
   */
  async getWorkorderItems(workorderId: string): Promise<LightspeedWorkorderItem[]> {
    const accountId = await this.getAccountId()
    const queryString = this.buildQueryString({ load_relations: '["Item"]' })
    const response = await this.request<LightspeedWorkorderItemsResponse>(
      `/Account/${accountId}/Workorder/${workorderId}/WorkorderItem.json${queryString}`,
    )
    return this.ensureArray(response.WorkorderItem)
  }

  /**
   * Fetch recent workorders across cursor pages (stops early once enough rows are collected).
   */
  async getRecentWorkorders(
    additionalParams?: Omit<LightspeedQueryParams, 'offset' | 'limit'>,
    options?: CursorOptions & { targetCount?: number }
  ): Promise<LightspeedWorkorderWithRelations[]> {
    const targetCount = Math.max(options?.targetCount ?? 80, 1)
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 100)
    const maxPages = Math.max(options?.maxPages ?? 5, 1)
    const accountId = await this.getAccountId()
    const collected: LightspeedWorkorderWithRelations[] = []

    let endpoint: string | null = `/Account/${accountId}/Workorder.json${this.buildQueryString({
      ...additionalParams,
      limit,
    })}`
    let pagesFetched = 0

    while (endpoint && pagesFetched < maxPages && collected.length < targetCount) {
      const response: LightspeedWorkordersResponse = await this.request<LightspeedWorkordersResponse>(endpoint)
      const page = this.ensureArray(response.Workorder)
      collected.push(...page)
      pagesFetched++

      const next: string | undefined = response['@attributes']?.next
      if (!next || page.length < limit) {
        endpoint = null
      } else {
        endpoint = next
      }
    }

    return collected.slice(0, targetCount)
  }

  /**
   * Create a "YELLOW JERSEY SALE" workorder for a Lightspeed product that was
   * bought on the Yellow Jersey marketplace.
   *
   * Unlike a completed sale, a workorder does NOT deduct stock-on-hand — it is
   * a task the store reviews and processes themselves. The note highlights all
   * the order details (item, qty, price, buyer, shipping) and instructs staff
   * that payment is already collected and they must adjust stock manually.
   *
   * Resolves the first active shop, employee, workorder status and (optionally)
   * customer for the account, and best-effort fetches the item to enrich the
   * note. Selection + payload assembly is delegated to the pure
   * `assembleYellowJerseyWorkorderRequest` helper.
   *
   * @param params.items           - One entry per product purchased from this seller
   *                                  in the order ({ itemID, unitQuantity, unitPrice })
   * @param params.orderNumber     - Our marketplace order number (cross-reference)
   * @param params.buyerName       - Optional buyer name for the note
   * @param params.shippingAddress - Optional single-line shipping address for the note
   */
  async createYellowJerseySaleWorkorder(params: {
    items: Array<{ itemID: string; unitQuantity: number; unitPrice: number }>
    orderNumber: string
    buyerName?: string | null
    buyerEmail?: string | null
    buyerPhone?: string | null
    deliveryMethod?: string | null
    deliveryDescription?: string | null
    shippingName?: string | null
    shippingPhone?: string | null
    shippingAddress?: string | null
    shippingCost?: number | null
    buyerFee?: number | null
    voucherDiscount?: number | null
    totalAmount?: number | null
  }): Promise<LightspeedWorkorder> {
    const accountId = await this.getAccountId()

    // Resolve required entities -------------------------------------------------
    const shops = await this.getShops({ archived: 'false' })

    const empsResponse = await this.getEmployees({ archived: 'false', lockOut: 'false' })
    const employees: LightspeedEmployee[] = Array.isArray(empsResponse.Employee)
      ? empsResponse.Employee
      : empsResponse.Employee
        ? [empsResponse.Employee]
        : []

    const statuses = await this.getWorkorderStatuses()

    // Attach the dedicated "YELLOW JERSEY" customer so the workorder is clearly
    // a marketplace sale (the API requires customerID; falls back to "0" walk-in).
    let customers: Array<{ customerID: string }> = []
    try {
      const yjCustomerId = await this.findOrCreateYellowJerseyCustomer()
      if (yjCustomerId) customers = [{ customerID: yjCustomerId }]
    } catch (err) {
      console.warn('[Lightspeed] Could not resolve YELLOW JERSEY customer for workorder, using walk-in:', err)
    }

    // Best-effort resolve each item to enrich the note with description + SKU.
    const items = await Promise.all(
      params.items.map(async (line) => {
        let item: { description?: string; systemSku?: string; customSku?: string } | null = null
        try {
          const fetched = await this.getItem(line.itemID)
          item = {
            description: fetched?.description,
            systemSku: fetched?.systemSku,
            customSku: fetched?.customSku,
          }
        } catch (err) {
          console.warn('[Lightspeed] Could not resolve item for workorder note (non-fatal):', err)
        }
        return { unitQuantity: line.unitQuantity, unitPrice: line.unitPrice, item }
      })
    )

    const { endpoint, body } = assembleYellowJerseyWorkorderRequest(
      { accountId, shops, employees, statuses, customers },
      {
        items,
        orderNumber: params.orderNumber,
        buyerName: params.buyerName,
        buyerEmail: params.buyerEmail,
        buyerPhone: params.buyerPhone,
        deliveryMethod: params.deliveryMethod,
        deliveryDescription: params.deliveryDescription,
        shippingName: params.shippingName,
        shippingPhone: params.shippingPhone,
        shippingAddress: params.shippingAddress,
        shippingCost: params.shippingCost,
        buyerFee: params.buyerFee,
        voucherDiscount: params.voucherDiscount,
        totalAmount: params.totalAmount,
      }
    )

    const response = await this.request<{ Workorder: LightspeedWorkorder }>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const workorder = response.Workorder

    const workorderItemRequests = assembleYellowJerseyWorkorderItemRequests(
      accountId,
      workorder.workorderID,
      employees[0].employeeID,
      params.items.map((line, index) => ({
        itemID: line.itemID,
        unitQuantity: line.unitQuantity,
        unitPrice: line.unitPrice,
        note: `${YELLOW_JERSEY_WORKORDER_TITLE} ${params.orderNumber} item ${index + 1}`,
      }))
    )

    console.log('[Lightspeed] Creating YELLOW JERSEY SALE workorder product lines:', {
      workorderID: workorder.workorderID,
      lineCount: workorderItemRequests.length,
      lines: workorderItemRequests.map(({ body }) => ({
        itemID: body.itemID,
        unitQuantity: body.unitQuantity,
        unitPrice: body.unitPrice,
      })),
    })

    for (const [index, itemRequest] of workorderItemRequests.entries()) {
      await this.request(itemRequest.endpoint, {
        method: 'POST',
        body: JSON.stringify(itemRequest.body),
      })
      console.log('[Lightspeed] Added YELLOW JERSEY SALE workorder product line:', {
        workorderID: workorder.workorderID,
        lineNumber: index + 1,
        itemID: itemRequest.body.itemID,
        unitQuantity: itemRequest.body.unitQuantity,
        unitPrice: itemRequest.body.unitPrice,
      })
    }

    return workorder
  }

  /**
   * Get completed sales for a date range
   */
  async getCompletedSales(
    startDate: Date,
    endDate?: Date,
    additionalParams?: Omit<LightspeedQueryParams, 'completed' | 'completeTime'>
  ): Promise<LightspeedSale[]> {
    const start = startDate.toISOString().split('T')[0]
    const end = endDate ? endDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
    
    return this.getSales({
      ...additionalParams,
      completed: 'true',
      completeTime: `><,${start},${end}`,
    })
  }

  // ============================================================
  // Customer Methods
  // ============================================================

  /**
   * Get customers
   */
  async getCustomers(params?: LightspeedQueryParams): Promise<LightspeedCustomer[]> {
    const accountId = await this.getAccountId()
    const queryString = this.buildQueryString(params)
    const response = await this.request<LightspeedCustomersResponse>(
      `/Account/${accountId}/Customer.json${queryString}`
    )
    return this.ensureArray(response.Customer)
  }

  /**
   * Get customers with cursor pagination.
   */
  async getAllCustomersCursor(
    additionalParams?: Omit<LightspeedQueryParams, 'offset' | 'limit'>,
    options?: CursorOptions
  ): Promise<{ customers: LightspeedCustomer[]; pagesFetched: number; hitPageLimit: boolean }> {
    const allCustomers: LightspeedCustomer[] = []
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 100)
    const maxPages = Math.max(options?.maxPages ?? 50, 1)
    const accountId = await this.getAccountId()

    let endpoint: string | null = `/Account/${accountId}/Customer.json${this.buildQueryString({
      ...additionalParams,
      limit,
    })}`
    let pagesFetched = 0

    while (endpoint && pagesFetched < maxPages) {
      const response: LightspeedCustomersResponse = await this.request<LightspeedCustomersResponse>(endpoint)
      const page = this.ensureArray(response.Customer)
      allCustomers.push(...page)
      pagesFetched++

      const next: string | undefined = response['@attributes']?.next
      const hasNextPage = Boolean(next && page.length >= limit)
      const hitPageLimit = hasNextPage && pagesFetched >= maxPages
      options?.onPage?.({
        pagesFetched,
        pageCount: page.length,
        totalCount: allCustomers.length,
        hasNextPage,
        hitPageLimit,
      })
      if (!next || page.length < limit) {
        endpoint = null
      } else {
        endpoint = next
      }
    }

    return {
      customers: allCustomers,
      pagesFetched,
      hitPageLimit: Boolean(endpoint),
    }
  }

  /**
   * Find (or create) the dedicated "YELLOW JERSEY" customer that every
   * marketplace-sale workorder is attached to. This makes the workorder's
   * Customer read "YELLOW JERSEY" so the store immediately knows the sale came
   * from the online marketplace, instead of attaching an unrelated walk-in.
   * Returns the customerID, or null if it could not be resolved/created.
   */
  async findOrCreateYellowJerseyCustomer(): Promise<string | null> {
    const accountId = await this.getAccountId()

    // Look for an existing one by company name first (idempotent across sales).
    try {
      const res = await this.request<LightspeedCustomersResponse>(
        `/Account/${accountId}/Customer.json?company=${encodeURIComponent(YELLOW_JERSEY_CUSTOMER.company)}&limit=1`
      )
      const existing = this.ensureArray(res.Customer)[0]
      if (existing?.customerID) return existing.customerID
    } catch (err) {
      console.warn('[Lightspeed] YELLOW JERSEY customer lookup failed (will try to create):', err)
    }

    const created = await this.request<{ Customer: LightspeedCustomer }>(
      `/Account/${accountId}/Customer.json`,
      { method: 'POST', body: JSON.stringify(YELLOW_JERSEY_CUSTOMER) }
    )
    return created.Customer?.customerID ?? null
  }

  /**
   * Get a single customer by ID
   */
  async getCustomer(customerId: string, params?: LightspeedQueryParams): Promise<LightspeedCustomer> {
    const accountId = await this.getAccountId()
    const queryString = this.buildQueryString(params)
    const response = await this.request<{ Customer: LightspeedCustomer }>(
      `/Account/${accountId}/Customer/${customerId}.json${queryString}`
    )
    return response.Customer
  }

  // ============================================================
  // Inventory Methods
  // ============================================================

  /**
   * Get item inventory across shops
   */
  async getItemShops(params?: LightspeedQueryParams): Promise<LightspeedItemShopsResponse> {
    const accountId = await this.getAccountId()
    const queryString = this.buildQueryString(params)
    return this.request<LightspeedItemShopsResponse>(
      `/Account/${accountId}/ItemShop.json${queryString}`
    )
  }

  /**
   * Get ItemShop rows with cursor pagination.
   */
  async getAllItemShopsCursor(
    additionalParams?: Omit<LightspeedQueryParams, 'offset' | 'limit'>,
    options?: CursorOptions
  ): Promise<{ itemShops: LightspeedItemShop[]; pagesFetched: number; hitPageLimit: boolean }> {
    const allItemShops: LightspeedItemShop[] = []
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 100)
    const maxPages = Math.max(options?.maxPages ?? 20, 1)
    const accountId = await this.getAccountId()

    let endpoint: string | null = `/Account/${accountId}/ItemShop.json${this.buildQueryString({
      ...additionalParams,
      limit,
    })}`
    let pagesFetched = 0

    while (endpoint && pagesFetched < maxPages) {
      const response: LightspeedItemShopsResponse = await this.request<LightspeedItemShopsResponse>(endpoint)
      const page = this.ensureArray(response.ItemShop)
      allItemShops.push(...page)
      pagesFetched++

      const next: string | undefined = response['@attributes']?.next
      const hasNextPage = Boolean(next && page.length >= limit)
      const hitPageLimit = hasNextPage && pagesFetched >= maxPages
      options?.onPage?.({
        pagesFetched,
        pageCount: page.length,
        totalCount: allItemShops.length,
        hasNextPage,
        hitPageLimit,
      })
      if (!next || page.length < limit) {
        endpoint = null
      } else {
        endpoint = next
      }
    }

    return {
      itemShops: allItemShops,
      pagesFetched,
      hitPageLimit: Boolean(endpoint),
    }
  }

  /**
   * Get ItemShop rows for many items using Lightspeed's IN query operator.
   * This avoids one ItemShop request per inventory candidate in agent lookups.
   */
  async getAllItemShopsForItemIdsCursor(
    itemIds: string[],
    options?: {
      batchSize?: number
      maxPagesPerBatch?: number
      limit?: number
      onPage?: (progress: CursorPageProgress & { batchIndex: number; batchCount: number }) => void
    }
  ): Promise<{ itemShops: LightspeedItemShop[]; pagesFetched: number; hitPageLimit: boolean; batchesFetched: number }> {
    const uniqueItemIds = Array.from(new Set(itemIds.map(id => String(id).trim()).filter(Boolean)))
    const batchSize = Math.min(Math.max(options?.batchSize ?? 50, 1), 100)
    const allItemShops: LightspeedItemShop[] = []
    let pagesFetched = 0
    let hitPageLimit = false
    let batchesFetched = 0
    const batchCount = Math.ceil(uniqueItemIds.length / batchSize)

    for (let index = 0; index < uniqueItemIds.length; index += batchSize) {
      const batch = uniqueItemIds.slice(index, index + batchSize)
      if (batch.length === 0) continue
      const batchIndex = Math.floor(index / batchSize) + 1

      const result = await this.getAllItemShopsCursor({
        itemID: `IN,[${batch.join(',')}]`,
      }, {
        maxPages: options?.maxPagesPerBatch ?? 5,
        limit: options?.limit ?? 100,
        onPage: progress => options?.onPage?.({
          ...progress,
          totalCount: allItemShops.length + progress.totalCount,
          batchIndex,
          batchCount,
        }),
      })

      allItemShops.push(...result.itemShops)
      pagesFetched += result.pagesFetched
      hitPageLimit ||= result.hitPageLimit
      batchesFetched++
    }

    return {
      itemShops: allItemShops,
      pagesFetched,
      hitPageLimit,
      batchesFetched,
    }
  }

  // ============================================================
  // Shop/Location Methods
  // ============================================================

  /**
   * Get shops (locations)
   */
  async getShops(params?: LightspeedQueryParams): Promise<LightspeedShop[]> {
    const accountId = await this.getAccountId()
    const queryString = this.buildQueryString(params)
    const response = await this.request<LightspeedShopsResponse>(
      `/Account/${accountId}/Shop.json${queryString}`
    )
    return this.ensureArray(response.Shop)
  }

  // ============================================================
  // Register Methods
  // ============================================================

  /**
   * Get registers
   */
  async getRegisters(params?: LightspeedQueryParams): Promise<LightspeedRegistersResponse> {
    const accountId = await this.getAccountId()
    const queryString = this.buildQueryString(params)
    return this.request<LightspeedRegistersResponse>(
      `/Account/${accountId}/Register.json${queryString}`
    )
  }

  // ============================================================
  // Employee Methods
  // ============================================================

  /**
   * Get employees
   */
  async getEmployees(params?: LightspeedQueryParams): Promise<LightspeedEmployeesResponse> {
    const accountId = await this.getAccountId()
    const queryString = this.buildQueryString(params)
    return this.request<LightspeedEmployeesResponse>(
      `/Account/${accountId}/Employee.json${queryString}`
    )
  }

  // ============================================================
  // Sync Helper Methods
  // ============================================================

  /**
   * Perform a full sync and update timestamp
   */
  async performSync(options: {
    products?: boolean
    orders?: boolean
    customers?: boolean
    inventory?: boolean
  }): Promise<{
    products?: LightspeedItem[]
    sales?: LightspeedSale[]
    customers?: LightspeedCustomer[]
    shops?: LightspeedShop[]
  }> {
    const results: {
      products?: LightspeedItem[]
      sales?: LightspeedSale[]
      customers?: LightspeedCustomer[]
      shops?: LightspeedShop[]
    } = {}

    // Get shops first if needed for inventory context
    if (options.products || options.inventory) {
      results.shops = await this.getShops({ archived: 'false' })
    }

    if (options.products) {
      results.products = await this.getAllItems({ archived: 'false' })
    }

    if (options.orders) {
      // Get last 30 days of completed sales
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      results.sales = await this.getCompletedSales(thirtyDaysAgo)
    }

    if (options.customers) {
      results.customers = await this.getCustomers({ archived: 'false', limit: 100 })
    }

    // Update last sync timestamp
    await updateLastSyncTime(this.userId)

    return results
  }

  /**
   * Test connection by fetching account info
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getAccount()
      return true
    } catch {
      return false
    }
  }
}

/**
 * Create a Lightspeed client for a user
 */
export function createLightspeedClient(userId: string): LightspeedClient {
  return new LightspeedClient(userId)
}
