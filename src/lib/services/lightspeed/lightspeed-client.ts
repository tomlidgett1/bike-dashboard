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
  LightspeedSerialized,
  LightspeedSerializedResponse,
  LightspeedCustomerBike,
  LightspeedManufacturer,
  LightspeedManufacturersResponse,
  LightspeedVendor,
  LightspeedVendorsResponse,
  LightspeedOrder,
  LightspeedOrderLine,
  LightspeedItemAttributes,
  LightspeedItemAttributeSet,
  LightspeedItemAttributeSetsResponse,
  LightspeedItemMatrix,
  LightspeedItemMatrixResponse,
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

function cleanSerializedText(value: unknown): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text || null
}

export function mapLightspeedSerializedBike(record: LightspeedSerialized): LightspeedCustomerBike {
  const itemId = cleanSerializedText(record.itemID)
  return {
    serializedId: String(record.serializedID ?? '').trim(),
    label: cleanSerializedText(record.description) ?? cleanSerializedText(record.serial),
    serial: cleanSerializedText(record.serial),
    itemId: itemId && itemId !== '0' ? itemId : null,
    saleLineId: cleanSerializedText(record.saleLineID),
    customerId: cleanSerializedText(record.customerID),
    colorName: cleanSerializedText(record.colorName),
    sizeName: cleanSerializedText(record.sizeName),
    updatedAt: cleanSerializedText(record.timeStamp),
  }
}

// ============================================================
// Rate Limiter / Error Helpers
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)))
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null
  const seconds = Number.parseFloat(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const dateMs = Date.parse(value)
  return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - Date.now())
}

function parseLimitFraction(value: string | null): { level: number; limit: number } | null {
  const match = value?.match(/^\s*([\d.]+)\s*\/\s*([\d.]+)\s*$/)
  if (!match) return null
  const level = Number.parseFloat(match[1])
  const limit = Number.parseFloat(match[2])
  if (!Number.isFinite(level) || !Number.isFinite(limit) || limit <= 0) return null
  return { level, limit }
}

export class LightspeedApiError extends Error {
  readonly status: number
  readonly body: string
  readonly retryable: boolean
  readonly rateLimitType: string | null
  readonly cfRay: string | null

  constructor(message: string, args: {
    status: number
    body: string
    retryable?: boolean
    rateLimitType?: string | null
    cfRay?: string | null
  }) {
    super(message)
    this.name = 'LightspeedApiError'
    this.status = args.status
    this.body = args.body
    this.retryable = Boolean(args.retryable)
    this.rateLimitType = args.rateLimitType ?? null
    this.cfRay = args.cfRay ?? null
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'))
}

function isLightspeedApiError(error: unknown, status?: number): error is LightspeedApiError {
  return error instanceof LightspeedApiError && (status == null || error.status === status)
}

class SharedLightspeedRateLimiter {
  private queue: Promise<void> = Promise.resolve()
  private bucketLevel = 0
  private bucketSize = 90
  private dripRate = 1
  private burstTimestamps: number[] = []
  private burstLimit: number = LIGHTSPEED_CONFIG.RATE_LIMIT_REQUESTS_PER_SECOND
  private backoffUntil = 0
  private lastBucketUpdate = Date.now()

  async waitForRequest(estimatedCost = 1): Promise<void> {
    const previous = this.queue
    let release!: () => void
    this.queue = new Promise(resolve => {
      release = resolve
    })

    await previous
    try {
      while (true) {
        const waitMs = this.nextWaitMs(Math.max(estimatedCost, 1))
        if (waitMs <= 0) break
        await sleep(waitMs)
      }
      this.reserve(Math.max(estimatedCost, 1))
    } finally {
      release()
    }
  }

  updateFromResponse(response: Response): void {
    const bucket = parseLimitFraction(response.headers.get('X-LS-Api-Bucket-Level'))
      ?? parseLimitFraction(response.headers.get('X-LS-API-Bucket-Level'))
    if (bucket) {
      this.bucketLevel = bucket.level
      this.bucketSize = bucket.limit
      this.lastBucketUpdate = Date.now()
    }

    const burst = parseLimitFraction(response.headers.get('X-LS-Api-Burst-Level'))
      ?? parseLimitFraction(response.headers.get('X-LS-API-Burst-Level'))
    if (burst) {
      this.burstLimit = Math.max(1, Math.floor(burst.limit))
      const now = Date.now()
      this.burstTimestamps = this.burstTimestamps
        .filter(timestamp => now - timestamp < 1000)
        .slice(-this.burstLimit)
    }

    const dripRate = Number.parseFloat(response.headers.get('X-LS-Api-Drip-Rate') ?? '')
    if (Number.isFinite(dripRate) && dripRate > 0) this.dripRate = dripRate
  }

  applyRateLimit(response: Response, fallbackMs: number): number {
    this.updateFromResponse(response)
    const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After')) ?? fallbackMs
    const waitMs = Math.max(retryAfterMs, 1000)
    this.backoffUntil = Math.max(this.backoffUntil, Date.now() + waitMs)
    return waitMs
  }

  private nextWaitMs(cost: number): number {
    const now = Date.now()
    if (now < this.backoffUntil) return this.backoffUntil - now

    this.drainBucket(now)
    if (this.bucketLevel + cost > this.bucketSize) {
      return Math.ceil(((this.bucketLevel + cost - this.bucketSize) / this.dripRate) * 1000)
    }

    this.burstTimestamps = this.burstTimestamps.filter(timestamp => now - timestamp < 1000)
    if (this.burstTimestamps.length >= this.burstLimit) {
      return 1000 - (now - this.burstTimestamps[0])
    }

    return 0
  }

  private reserve(cost: number): void {
    const now = Date.now()
    this.drainBucket(now)
    this.bucketLevel += cost
    this.burstTimestamps.push(now)
  }

  private drainBucket(now: number): void {
    const elapsedSeconds = Math.max(0, (now - this.lastBucketUpdate) / 1000)
    if (elapsedSeconds > 0) {
      this.bucketLevel = Math.max(0, this.bucketLevel - elapsedSeconds * this.dripRate)
      this.lastBucketUpdate = now
    }
  }

  isInBackoff(): boolean {
    return Date.now() < this.backoffUntil
  }
}

const sharedRateLimiters = new Map<string, SharedLightspeedRateLimiter>()

function lightspeedRateLimiterFor(key: string): SharedLightspeedRateLimiter {
  const existing = sharedRateLimiters.get(key)
  if (existing) return existing
  const limiter = new SharedLightspeedRateLimiter()
  sharedRateLimiters.set(key, limiter)
  return limiter
}

/** True when a recent 429 set shared backoff — callers should skip optional LS enrichment. */
export function isLightspeedInBackoff(userId: string): boolean {
  return lightspeedRateLimiterFor(userId).isInBackoff()
}

// ============================================================
// Lightspeed API Client
// ============================================================

export class LightspeedClient {
  private userId: string
  private rateLimiter: SharedLightspeedRateLimiter
  private accessToken: string | null = null
  private accessTokenPromise: Promise<string | null> | null = null
  private accountId: string | null = null
  private accountIdPromise: Promise<string> | null = null

  constructor(userId: string) {
    this.userId = userId
    this.rateLimiter = lightspeedRateLimiterFor(userId)
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
    const refreshed = await refreshAccessToken(this.userId, { source: 'lightspeed_client_401' })
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
      await this.rateLimiter.waitForRequest()

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), LIGHTSPEED_CONFIG.REQUEST_TIMEOUT_MS)
        let response: Response
        try {
          response = await fetch(url, {
            ...options,
            signal: options.signal
              ? AbortSignal.any([options.signal, controller.signal])
              : controller.signal,
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              ...options.headers,
            },
          })
        } finally {
          clearTimeout(timeout)
        }
        this.rateLimiter.updateFromResponse(response)

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
          const waitTime = this.rateLimiter.applyRateLimit(
            response,
            LIGHTSPEED_CONFIG.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
          )
          console.log('[Lightspeed] Rate limited, shared backoff before retry', {
            waitTime,
            rateLimitType: response.headers.get('X-LS-API-RateLimit-Type'),
            bucket: response.headers.get('X-LS-Api-Bucket-Level') ?? response.headers.get('X-LS-API-Bucket-Level'),
            burst: response.headers.get('X-LS-Api-Burst-Level') ?? response.headers.get('X-LS-API-Burst-Level'),
            requestCost: response.headers.get('X-LS-Api-Request-Cost'),
            cfRay: response.headers.get('Cf-Ray'),
          })
          await sleep(waitTime)
          continue
        }

        // Handle server errors (5xx)
        if (response.status >= 500) {
          const waitTime = LIGHTSPEED_CONFIG.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt)
          console.log(`Server error ${response.status}, waiting ${waitTime}ms before retry`)
          await sleep(waitTime)
          continue
        }

        if (!response.ok) {
          const errorBody = await response.text()
          throw new LightspeedApiError(`Lightspeed API error: ${response.status}`, {
            status: response.status,
            body: errorBody,
            retryable: false,
            rateLimitType: response.headers.get('X-LS-API-RateLimit-Type'),
            cfRay: response.headers.get('Cf-Ray'),
          })
        }

        return await response.json()
      } catch (error) {
        lastError = isAbortError(error)
          ? new Error(`Lightspeed API request timed out after ${LIGHTSPEED_CONFIG.REQUEST_TIMEOUT_MS}ms`)
          : error as Error

        // Don't retry on non-retryable errors
        if (
          lastError instanceof LightspeedApiError ||
          lastError.message.includes('No valid access token') ||
          lastError.message.includes('Session expired')
        ) {
          throw lastError
        }

        // Exponential backoff for network errors
        if (attempt < LIGHTSPEED_CONFIG.MAX_RETRIES - 1) {
          const waitTime = LIGHTSPEED_CONFIG.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt)
          console.log(`Request failed, waiting ${waitTime}ms before retry:`, lastError.message)
          await sleep(waitTime)
        }
      }
    }

    throw lastError || new Error('Request failed after maximum retries')
  }

  /**
   * Authenticated request that returns raw text (e.g. DisplayTemplate HTML).
   */
  private async requestText(
    endpoint: string,
    options: RequestInit & { accept?: string } = {},
  ): Promise<string> {
    const { accept = 'text/html', ...fetchOptions } = options
    let accessToken = await this.getCachedAccessToken()

    if (!accessToken) {
      throw new Error('No valid access token available. Please reconnect your Lightspeed account.')
    }

    const url = endpoint.startsWith('http')
      ? endpoint
      : `${LIGHTSPEED_CONFIG.API_BASE_URL}${endpoint}`

    let lastError: Error | null = null
    let tokenRefreshed = false

    for (let attempt = 0; attempt < LIGHTSPEED_CONFIG.MAX_RETRIES; attempt++) {
      await this.rateLimiter.waitForRequest()

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), LIGHTSPEED_CONFIG.REQUEST_TIMEOUT_MS)
        let response: Response
        try {
          response = await fetch(url, {
            ...fetchOptions,
            signal: fetchOptions.signal
              ? AbortSignal.any([fetchOptions.signal, controller.signal])
              : controller.signal,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: accept,
              ...fetchOptions.headers,
            },
          })
        } finally {
          clearTimeout(timeout)
        }
        this.rateLimiter.updateFromResponse(response)

        if (response.status === 401 && !tokenRefreshed) {
          tokenRefreshed = true
          const refreshedAccessToken = await this.refreshCachedAccessToken()
          if (refreshedAccessToken) {
            accessToken = refreshedAccessToken
            attempt--
            continue
          }
          throw new Error('Session expired. Please reconnect your Lightspeed account.')
        }

        if (response.status === 429) {
          const waitTime = this.rateLimiter.applyRateLimit(
            response,
            LIGHTSPEED_CONFIG.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
          )
          await sleep(waitTime)
          continue
        }

        if (response.status >= 500) {
          const waitTime = LIGHTSPEED_CONFIG.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt)
          await sleep(waitTime)
          continue
        }

        if (!response.ok) {
          const errorBody = await response.text()
          throw new LightspeedApiError(`Lightspeed API error: ${response.status}`, {
            status: response.status,
            body: errorBody,
            retryable: false,
            rateLimitType: response.headers.get('X-LS-API-RateLimit-Type'),
            cfRay: response.headers.get('Cf-Ray'),
          })
        }

        return await response.text()
      } catch (error) {
        lastError = isAbortError(error)
          ? new Error(`Lightspeed API request timed out after ${LIGHTSPEED_CONFIG.REQUEST_TIMEOUT_MS}ms`)
          : error as Error

        if (
          lastError instanceof LightspeedApiError ||
          lastError.message.includes('No valid access token') ||
          lastError.message.includes('Session expired')
        ) {
          throw lastError
        }

        if (attempt < LIGHTSPEED_CONFIG.MAX_RETRIES - 1) {
          const waitTime = LIGHTSPEED_CONFIG.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt)
          await sleep(waitTime)
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
    >> & {
      /** Re-parent an existing item into a matrix (variant products). */
      itemMatrixID?: string
      ItemAttributes?: LightspeedItemAttributes
    }
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

  // ============================================================
  // Item Matrix / Attribute Set Methods (variant products)
  // ============================================================

  /**
   * Get all item attribute sets (matrix dimensions) for the account.
   * System sets include "Color/Size", "Size", "Color", "3 Attributes".
   */
  async getItemAttributeSets(): Promise<LightspeedItemAttributeSet[]> {
    const accountId = await this.getAccountId()
    const response = await this.request<LightspeedItemAttributeSetsResponse>(
      `/Account/${accountId}/ItemAttributeSet.json`
    )
    return this.ensureArray(response.ItemAttributeSet)
  }

  /**
   * Create a new item attribute set. `name` + `attributeName1` are required;
   * attributeName2/3 are optional (for two/three-dimension matrices).
   */
  async createItemAttributeSet(payload: {
    name: string
    attributeName1: string
    attributeName2?: string
    attributeName3?: string
  }): Promise<LightspeedItemAttributeSet> {
    const accountId = await this.getAccountId()
    const body: Record<string, string> = {
      name: payload.name,
      attributeName1: payload.attributeName1,
    }
    if (payload.attributeName2) body.attributeName2 = payload.attributeName2
    if (payload.attributeName3) body.attributeName3 = payload.attributeName3
    const response = await this.request<{ ItemAttributeSet: LightspeedItemAttributeSet }>(
      `/Account/${accountId}/ItemAttributeSet.json`,
      { method: 'POST', body: JSON.stringify(body) }
    )
    return response.ItemAttributeSet
  }

  /**
   * Create an item matrix (parent). Only `description` + `itemAttributeSetID`
   * are required; carry over manufacturer/category/tax from a child item where
   * available so the matrix matches its products.
   */
  async createItemMatrix(payload: {
    description: string
    itemAttributeSetID: string
    manufacturerID?: string
    categoryID?: string
    taxClassID?: string
  }): Promise<LightspeedItemMatrix> {
    const accountId = await this.getAccountId()
    const body: Record<string, string> = {
      description: payload.description.trim().slice(0, 255),
      itemAttributeSetID: String(payload.itemAttributeSetID),
    }
    if (payload.manufacturerID && payload.manufacturerID !== '0') body.manufacturerID = String(payload.manufacturerID)
    if (payload.categoryID && payload.categoryID !== '0') body.categoryID = String(payload.categoryID)
    if (payload.taxClassID && payload.taxClassID !== '0') body.taxClassID = String(payload.taxClassID)
    const response = await this.request<LightspeedItemMatrixResponse>(
      `/Account/${accountId}/ItemMatrix.json`,
      { method: 'POST', body: JSON.stringify(body) }
    )
    return response.ItemMatrix
  }

  /**
   * Get all items with V3 cursor pagination.
   */
  async getAllItems(additionalParams?: Omit<LightspeedQueryParams, 'offset' | 'limit'>): Promise<LightspeedItem[]> {
    const result = await this.getAllItemsCursor(additionalParams, { limit: 100, maxPages: 50 })
    return result.items
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

  /**
   * Create a new vendor (supplier) in Lightspeed.
   */
  async createVendor(payload: { name: string; accountNumber?: string }): Promise<LightspeedVendor> {
    const accountId = await this.getAccountId()
    const response = await this.request<{ Vendor: LightspeedVendor }>(
      `/Account/${accountId}/Vendor.json`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: payload.name.trim(),
          ...(payload.accountNumber ? { accountNumber: payload.accountNumber } : {}),
        }),
      },
    )
    return response.Vendor
  }

  // ============================================================
  // Purchase Order Methods
  // ============================================================

  /**
   * Create a purchase order (Order) in Lightspeed. Lines are added separately
   * via createPurchaseOrderLine.
   */
  async createPurchaseOrder(payload: {
    vendorID: string
    shopID?: string
    orderedDate?: string
    arrivalDate?: string
    refNum?: string
    shipCost?: number
    otherCost?: number
    discount?: number
    shipInstructions?: string
    stockInstructions?: string
  }): Promise<LightspeedOrder> {
    const accountId = await this.getAccountId()
    const body: Record<string, string> = { vendorID: String(payload.vendorID) }
    if (payload.shopID) body.shopID = String(payload.shopID)
    if (payload.orderedDate) body.orderedDate = payload.orderedDate
    if (payload.arrivalDate) body.arrivalDate = payload.arrivalDate
    if (payload.refNum) body.refNum = payload.refNum
    if (payload.shipCost != null) body.shipCost = String(payload.shipCost)
    if (payload.otherCost != null) body.otherCost = String(payload.otherCost)
    if (payload.discount != null) body.discount = String(payload.discount)
    if (payload.shipInstructions) body.shipInstructions = payload.shipInstructions
    if (payload.stockInstructions) body.stockInstructions = payload.stockInstructions

    const response = await this.request<{ Order: LightspeedOrder }>(
      `/Account/${accountId}/Order.json`,
      { method: 'POST', body: JSON.stringify(body) },
    )
    return response.Order
  }

  /**
   * Add a line to an existing purchase order.
   */
  async createPurchaseOrderLine(payload: {
    orderID: string
    itemID: string
    quantity: number
    price: number
  }): Promise<LightspeedOrderLine> {
    const accountId = await this.getAccountId()
    const response = await this.request<{ OrderLine: LightspeedOrderLine }>(
      `/Account/${accountId}/OrderLine.json`,
      {
        method: 'POST',
        body: JSON.stringify({
          orderID: String(payload.orderID),
          itemID: String(payload.itemID),
          quantity: String(Math.max(1, Math.round(payload.quantity))),
          price: String(payload.price),
          originalPrice: String(payload.price),
          numReceived: '0',
        }),
      },
    )
    return response.OrderLine
  }

  /**
   * Update an existing purchase order (e.g. write shipCost/otherCost after the
   * lines are added — Lightspeed recalculates totals on update).
   */
  async updatePurchaseOrder(
    orderId: string,
    payload: { shipCost?: number; otherCost?: number; refNum?: string; arrivalDate?: string },
  ): Promise<LightspeedOrder> {
    const accountId = await this.getAccountId()
    const body: Record<string, string> = {}
    if (payload.shipCost != null) body.shipCost = String(payload.shipCost)
    if (payload.otherCost != null) body.otherCost = String(payload.otherCost)
    if (payload.refNum) body.refNum = payload.refNum
    if (payload.arrivalDate) body.arrivalDate = payload.arrivalDate
    const response = await this.request<{ Order: LightspeedOrder }>(
      `/Account/${accountId}/Order/${orderId}.json`,
      { method: 'PUT', body: JSON.stringify(body) },
    )
    return response.Order
  }

  /**
   * Create a new inventory item (used when a supplier-invoice line has no
   * matching product). Sets cost + identifiers; retail price stays 0 for the
   * store to set when the stock is received.
   */
  async createItem(payload: {
    description: string
    defaultCost?: number
    upc?: string
    manufacturerSku?: string
    customSku?: string
  }): Promise<LightspeedItem> {
    const accountId = await this.getAccountId()
    const body: Record<string, string> = { description: payload.description.trim().slice(0, 255) }
    if (payload.defaultCost != null) body.defaultCost = String(payload.defaultCost)
    if (payload.upc) body.upc = payload.upc
    if (payload.manufacturerSku) body.manufacturerSku = payload.manufacturerSku.slice(0, 100)
    if (payload.customSku) body.customSku = payload.customSku.slice(0, 100)
    const response = await this.request<{ Item: LightspeedItem }>(
      `/Account/${accountId}/Item.json`,
      { method: 'POST', body: JSON.stringify(body) },
    )
    return response.Item
  }

  /**
   * Fetch a purchase order (with lines/vendor) by ID.
   */
  async getPurchaseOrder(orderId: string): Promise<LightspeedOrder | null> {
    const accountId = await this.getAccountId()
    try {
      const response = await this.request<{ Order: LightspeedOrder }>(
        `/Account/${accountId}/Order/${orderId}.json?load_relations=${encodeURIComponent('["OrderLines","Vendor"]')}`,
      )
      return response.Order ?? null
    } catch (error) {
      if (isLightspeedApiError(error, 404)) return null
      throw error
    }
  }

  /**
   * Returns true for a typed Lightspeed 404 response.
   */
  isNotFoundError(error: unknown): boolean {
    return isLightspeedApiError(error, 404)
  }

  /**
   * Returns true for a typed Lightspeed rate-limit response.
   */
  isRateLimitError(error: unknown): boolean {
    return isLightspeedApiError(error, 429)
  }

  /**
   * Returns true for a retryable transport/server failure.
   */
  isRetryableError(error: unknown): boolean {
    return error instanceof LightspeedApiError ? error.retryable : false
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
   * Render a sale receipt as HTML via DisplayTemplate (not structured JSON).
   */
  async renderSaleReceiptHtml(
    saleId: string,
    options?: {
      template?: string
      print?: boolean
      pageWidth?: string
      pageHeight?: string
    },
  ): Promise<string> {
    const accountId = await this.getAccountId()
    const params = new URLSearchParams({
      template: options?.template?.trim() || 'SaleReceipt',
    })

    if (options?.print) {
      params.set('print', '1')
    }
    if (options?.pageWidth?.trim()) {
      params.set('page_width', options.pageWidth.trim())
    }
    if (options?.pageHeight?.trim()) {
      params.set('page_height', options.pageHeight.trim())
    }

    return this.requestText(
      `/Account/${accountId}/DisplayTemplate/Sale/${encodeURIComponent(saleId)}.html?${params.toString()}`,
    )
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
    } catch (error) {
      if (isLightspeedApiError(error, 404)) return null
      throw error
    }
  }

  /**
   * Update a workorder.
   *
   * Like Item, the Workorder endpoint uses PUT for partial updates: omitted
   * fields retain their existing values, so sending just `note` is safe.
   */
  async updateWorkorder(
    workorderId: string,
    payload: { note?: string; internalNote?: string },
  ): Promise<LightspeedWorkorder> {
    const accountId = await this.getAccountId()
    const response = await this.request<{ Workorder: LightspeedWorkorder }>(
      `/Account/${accountId}/Workorder/${workorderId}.json`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    )
    return response.Workorder
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
   * List Serialized rows owned by a customer. Bike shops often store the
   * customer's bike as a free-text Serialized.description with itemID "0".
   */
  async getCustomerSerialized(
    customerId: string,
    params?: Omit<LightspeedQueryParams, 'customerID'>,
  ): Promise<LightspeedSerialized[]> {
    const accountId = await this.getAccountId()
    const queryString = this.buildQueryString({
      limit: 50,
      ...params,
      customerID: customerId,
    })
    const response = await this.request<LightspeedSerializedResponse>(
      `/Account/${accountId}/Serialized.json${queryString}`,
    )
    return this.ensureArray(response.Serialized)
  }

  /**
   * Fetch a single Serialized row, usually from a Workorder.serializedID link.
   */
  async getSerialized(serializedId: string): Promise<LightspeedSerialized | null> {
    const accountId = await this.getAccountId()
    try {
      const response = await this.request<LightspeedSerializedResponse>(
        `/Account/${accountId}/Serialized/${serializedId}.json`,
      )
      return this.ensureArray(response.Serialized)[0] ?? null
    } catch (error) {
      if (isLightspeedApiError(error, 404)) return null
      throw error
    }
  }

  async getCustomerBikes(customerId: string): Promise<LightspeedCustomerBike[]> {
    const serialized = await this.getCustomerSerialized(customerId)
    return serialized
      .map(mapLightspeedSerializedBike)
      .filter(bike => Boolean(bike.serializedId))
  }

  async getSerializedBike(serializedId: string): Promise<LightspeedCustomerBike | null> {
    const serialized = await this.getSerialized(serializedId)
    if (!serialized) return null
    const bike = mapLightspeedSerializedBike(serialized)
    return bike.serializedId ? bike : null
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

/**
 * Deep link to view a purchase order in the Lightspeed Retail (R-Series) web UI.
 * Example: https://aus.merchantos.com/?name=purchase.views.purchase&form_name=view&id=4272&tab=main
 */
export function lightspeedPurchaseOrderUrl(orderId: string): string {
  const base = process.env.LIGHTSPEED_WEB_BASE_URL?.replace(/\/$/, '') || 'https://aus.merchantos.com'
  return `${base}/?name=purchase.views.purchase&form_name=view&id=${encodeURIComponent(orderId)}&tab=main`
}
