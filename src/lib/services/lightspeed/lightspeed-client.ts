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
  LightspeedCategory,
  LightspeedSale,
  LightspeedCustomer,
  LightspeedShop,
  LightspeedEmployee,
  LightspeedWorkorder,
  LightspeedWorkorderStatus,
  LightspeedWorkorderStatusesResponse,
} from './types'

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
  private accountId: string | null = null

  constructor(userId: string) {
    this.userId = userId
    this.rateLimiter = new RateLimiter(LIGHTSPEED_CONFIG.RATE_LIMIT_REQUESTS_PER_SECOND)
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
    let accessToken = await getValidAccessToken(this.userId)

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
          const refreshed = await refreshAccessToken(this.userId)
          if (refreshed) {
            accessToken = refreshed.accessToken
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
    if (!this.accountId) {
      const account = await this.getAccount()
      this.accountId = account.Account.accountID
    }
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
  async getAllManufacturers(): Promise<Array<{ manufacturerID: string; name: string }>> {
    const allManufacturers: Array<{ manufacturerID: string; name: string }> = []
    const accountId = await this.getAccountId()
    const limit = 100
    let nextUrl: string = `/Account/${accountId}/Manufacturer.json?limit=${limit}`

    for (let page = 0; page < 50; page++) {
      const response = await this.request<{
        Manufacturer?: { manufacturerID: string; name: string } | Array<{ manufacturerID: string; name: string }>
        '@attributes'?: { next?: string }
      }>(nextUrl)
      const page_data = this.ensureArray(response.Manufacturer)
      allManufacturers.push(...page_data)
      const next = response['@attributes']?.next
      if (!next || page_data.length < limit) break
      nextUrl = next
    }

    return allManufacturers
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
  async getCustomer(customerId: string): Promise<LightspeedCustomer> {
    const accountId = await this.getAccountId()
    const response = await this.request<{ Customer: LightspeedCustomer }>(
      `/Account/${accountId}/Customer/${customerId}.json`
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










