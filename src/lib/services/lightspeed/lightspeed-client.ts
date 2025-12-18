/**
 * Lightspeed R-Series API Client
 * 
 * Type-safe client with rate limiting, exponential backoff retry,
 * and automatic token refresh.
 */

import { LIGHTSPEED_CONFIG } from './config'
import { getValidAccessToken, updateLastSyncTime } from './token-manager'
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
   * Make an authenticated API request with retry logic
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const accessToken = await getValidAccessToken(this.userId)
    
    if (!accessToken) {
      throw new Error('No valid access token available. Please reconnect your Lightspeed account.')
    }

    await this.rateLimiter.waitForSlot()

    const url = `${LIGHTSPEED_CONFIG.API_BASE_URL}${endpoint}`
    
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt < LIGHTSPEED_CONFIG.MAX_RETRIES; attempt++) {
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
        if (lastError.message.includes('No valid access token')) {
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
   * Get all categories
   */
  async getCategories(params?: LightspeedQueryParams): Promise<LightspeedCategory[]> {
    const accountId = await this.getAccountId()
    const queryString = this.buildQueryString(params)
    const response = await this.request<LightspeedCategoriesResponse>(
      `/Account/${accountId}/Category.json${queryString}`
    )
    return this.ensureArray(response.Category)
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















