/**
 * Lightspeed R-Series API Types
 * 
 * Based on Lightspeed Retail POS (R-Series) API V3
 */

// ============================================================
// Connection & OAuth Types
// ============================================================

export type LightspeedConnectionStatus = 'connected' | 'disconnected' | 'error' | 'expired'
export type LightspeedSyncStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export interface LightspeedConnection {
  id: string
  user_id: string
  status: LightspeedConnectionStatus
  account_id: string | null
  account_name: string | null
  access_token_encrypted: string | null
  refresh_token_encrypted: string | null
  token_expires_at: string | null
  scopes: string[]
  oauth_state: string | null
  oauth_state_expires_at: string | null
  connected_at: string | null
  disconnected_at: string | null
  last_sync_at: string | null
  last_token_refresh_at: string | null
  last_error: string | null
  last_error_at: string | null
  error_count: number
  created_at: string
  updated_at: string
}

export interface LightspeedSyncSettings {
  id: string
  user_id: string
  connection_id: string | null
  sync_products: boolean
  sync_orders: boolean
  sync_customers: boolean
  sync_inventory: boolean
  auto_sync_enabled: boolean
  auto_sync_interval_minutes: number
  overwrite_local_changes: boolean
  created_at: string
  updated_at: string
}

export interface LightspeedSyncLog {
  id: string
  user_id: string
  connection_id: string | null
  sync_type: 'manual' | 'auto' | 'initial'
  status: LightspeedSyncStatus
  entities_synced: string[] | null
  records_processed: number
  records_created: number
  records_updated: number
  records_failed: number
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  error_message: string | null
  error_details: Record<string, unknown> | null
  request_id: string | null
  created_at: string
}

// ============================================================
// OAuth Response Types
// ============================================================

export interface LightspeedTokenResponse {
  token_type: 'Bearer'
  expires_in: number // seconds
  access_token: string
  refresh_token: string
}

export interface LightspeedTokenError {
  error: string
  error_description?: string
}

// ============================================================
// API Response Types
// ============================================================

export interface LightspeedApiResponse<T> {
  data: T
}

export interface LightspeedApiError {
  httpCode: string
  httpMessage: string
  message: string
  errorClass: string
}

// ============================================================
// Account Types
// ============================================================

export interface LightspeedAccount {
  accountID: string
  name: string
  link: {
    '@attributes': {
      href: string
    }
  }
}

export interface LightspeedAccountResponse {
  Account: LightspeedAccount
}

// ============================================================
// Product/Item Types
// ============================================================

export interface LightspeedItem {
  itemID: string
  systemSku: string
  defaultCost: string
  avgCost: string
  discountable: string
  tax: string
  archived: string
  itemType: string
  serialized: string
  description: string
  modelYear: string
  upc: string
  ean: string
  customSku: string
  manufacturerSku: string
  createTime: string
  timeStamp: string
  publishToEcom: string
  categoryID: string
  taxClassID: string
  departmentID: string
  itemMatrixID: string
  manufacturerID: string
  seasonID: string
  defaultVendorID: string
  itemECommerceID?: string
  Prices: {
    ItemPrice: LightspeedItemPrice[]
  }
  Images?: {
    Image: LightspeedItemImage[]
  }
}

export interface LightspeedItemPrice {
  amount: string
  useTypeID: string
  useType: string
}

export interface LightspeedItemImage {
  imageID: string
  description: string
  filename: string
  ordering: string
  baseImageURL: string
  publicID: string
}

export interface LightspeedItemsResponse {
  Item: LightspeedItem | LightspeedItem[]
  '@attributes'?: {
    count: string
    offset: string
    limit: string
  }
}

// ============================================================
// Category Types
// ============================================================

export interface LightspeedCategory {
  categoryID: string
  name: string
  nodeDepth: string
  fullPathName: string
  leftNode: string
  rightNode: string
  createTime: string
  timeStamp: string
  parentID?: string
}

export interface LightspeedCategoriesResponse {
  Category: LightspeedCategory | LightspeedCategory[]
  '@attributes'?: {
    count: string
    offset: string
    limit: string
  }
}

// ============================================================
// Sale/Order Types
// ============================================================

export interface LightspeedSale {
  saleID: string
  timeStamp: string
  discountPercent: string
  completed: string
  archived: string
  voided: string
  enablePromotions: string
  isTaxInclusive: string
  createTime: string
  updateTime: string
  completeTime?: string
  referenceNumber?: string
  referenceNumberSource?: string
  tax1Rate?: string
  tax2Rate?: string
  change?: string
  receiptPreference?: string
  displayableSubtotal: string
  ticketNumber?: string
  calcDiscount: string
  calcTotal: string
  calcSubtotal: string
  calcTaxable: string
  calcNonTaxable: string
  calcAvgCost: string
  calcFIFOCost: string
  calcTax1: string
  calcTax2: string
  calcPayments: string
  total: string
  totalDue: string
  displayableTotal: string
  balance: string
  customerID?: string
  discountID?: string
  employeeID: string
  quoteID?: string
  registerID: string
  shipToID?: string
  shopID: string
  taxCategoryID?: string
  tipEmployeeID?: string
  SaleLines?: {
    SaleLine: LightspeedSaleLine | LightspeedSaleLine[]
  }
  SalePayments?: {
    SalePayment: LightspeedSalePayment | LightspeedSalePayment[]
  }
  Customer?: LightspeedCustomer
}

export interface LightspeedSaleLine {
  saleLineID: string
  createTime: string
  timeStamp: string
  unitQuantity: string
  unitPrice: string
  normalUnitPrice: string
  discountAmount: string
  discountPercent: string
  avgCost: string
  fifoCost: string
  tax: string
  tax1Rate: string
  tax2Rate: string
  isLayaway: string
  isWorkorder: string
  isSpecialOrder: string
  displayableSubtotal: string
  displayableUnitPrice: string
  calcLineDiscount: string
  calcSubtotal: string
  calcTax1: string
  calcTax2: string
  calcTotal: string
  taxClassID: string
  employeeID: string
  itemID: string
  noteID?: string
  parentSaleLineID?: string
  shopID: string
  taxCategoryID?: string
  Item?: LightspeedItem
}

export interface LightspeedSalePayment {
  salePaymentID: string
  amount: string
  createTime: string
  timeStamp: string
  paymentTypeID: string
  registerID: string
  employeeID: string
  creditAccountID?: string
  PaymentType?: {
    paymentTypeID: string
    name: string
    code?: string
  }
}

export interface LightspeedSalesResponse {
  Sale: LightspeedSale | LightspeedSale[]
  '@attributes'?: {
    count: string
    offset: string
    limit: string
  }
}

// ============================================================
// Customer Types
// ============================================================

export interface LightspeedCustomer {
  customerID: string
  firstName: string
  lastName: string
  title?: string
  company?: string
  createTime: string
  timeStamp: string
  archived: string
  contactID: string
  creditAccountID?: string
  customerTypeID?: string
  taxCategoryID?: string
  Contact?: {
    contactID: string
    custom?: string
    noEmail: string
    noPhone: string
    noMail: string
    Addresses?: {
      ContactAddress: LightspeedContactAddress | LightspeedContactAddress[]
    }
    Phones?: {
      ContactPhone: LightspeedContactPhone | LightspeedContactPhone[]
    }
    Emails?: {
      ContactEmail: LightspeedContactEmail | LightspeedContactEmail[]
    }
    Websites?: {
      ContactWebsite: LightspeedContactWebsite | LightspeedContactWebsite[]
    }
  }
}

export interface LightspeedContactAddress {
  address1: string
  address2?: string
  city: string
  state: string
  zip: string
  country: string
  countryCode: string
  stateCode?: string
}

export interface LightspeedContactPhone {
  number: string
  useType: string
}

export interface LightspeedContactEmail {
  address: string
  useType: string
}

export interface LightspeedContactWebsite {
  url: string
  useType?: string
}

export interface LightspeedCustomersResponse {
  Customer: LightspeedCustomer | LightspeedCustomer[]
  '@attributes'?: {
    count: string
    offset: string
    limit: string
  }
}

// ============================================================
// Inventory Types
// ============================================================

export interface LightspeedItemShop {
  itemShopID: string
  qoh: string // Quantity on hand
  backorder: string
  componentQoh: string
  reorderPoint: string
  reorderLevel: string
  sellable: string
  timeStamp: string
  itemID: string
  shopID: string
}

export interface LightspeedItemShopsResponse {
  ItemShop: LightspeedItemShop | LightspeedItemShop[]
  '@attributes'?: {
    count: string
    offset: string
    limit: string
  }
}

// ============================================================
// Shop/Location Types
// ============================================================

export interface LightspeedShop {
  shopID: string
  name: string
  serviceRate: string
  timeZone: string
  taxLabor: string
  labelTitle: string
  labelMsgLine1: string
  labelMsgLine2: string
  hqShop: string
  archived: string
  timeStamp: string
  companyRegistrationNumber?: string
  vendorID?: string
  taxCategoryID?: string
  receiptSetupID?: string
  Contact?: {
    contactID: string
    Addresses?: {
      ContactAddress: LightspeedContactAddress
    }
    Phones?: {
      ContactPhone: LightspeedContactPhone | LightspeedContactPhone[]
    }
    Emails?: {
      ContactEmail: LightspeedContactEmail
    }
  }
}

export interface LightspeedShopsResponse {
  Shop: LightspeedShop | LightspeedShop[]
  '@attributes'?: {
    count: string
    offset: string
    limit: string
  }
}

// ============================================================
// Register Types
// ============================================================

export interface LightspeedRegister {
  registerID: string
  name: string
  open: string
  openTime?: string
  closeTime?: string
  timeStamp: string
  shopID: string
}

export interface LightspeedRegistersResponse {
  Register: LightspeedRegister | LightspeedRegister[]
  '@attributes'?: {
    count: string
    offset: string
    limit: string
  }
}

// ============================================================
// Employee Types
// ============================================================

export interface LightspeedEmployee {
  employeeID: string
  firstName: string
  lastName: string
  lockOut: string
  archived: string
  contactID: string
  employeeRoleID: string
  limitToShopID?: string
  lastShopID?: string
  lastRegisterID?: string
  timeStamp: string
}

export interface LightspeedEmployeesResponse {
  Employee: LightspeedEmployee | LightspeedEmployee[]
  '@attributes'?: {
    count: string
    offset: string
    limit: string
  }
}

// ============================================================
// Utility Types
// ============================================================

export interface LightspeedPaginationParams {
  offset?: number
  limit?: number // Max 100
}

export interface LightspeedDateFilterParams {
  timeStamp?: string // Filter by timestamp, e.g., ">,2024-01-01"
  createTime?: string
}

// Combined query params
export interface LightspeedQueryParams extends LightspeedPaginationParams, LightspeedDateFilterParams {
  // Common filter operators: =, !=, <, <=, >, >=, ~, !~, |
  // Example: { archived: '=,false' }
  [key: string]: string | number | undefined
}

// ============================================================
// Frontend Types (for UI components)
// ============================================================

export interface LightspeedConnectionState {
  isConnected: boolean
  isLoading: boolean
  isConnecting: boolean
  isSyncing: boolean
  connection: LightspeedConnection | null
  syncSettings: LightspeedSyncSettings | null
  error: string | null
  lastSync: Date | null
  accountInfo: {
    id: string
    name: string
  } | null
}

export interface SyncOption {
  id: 'products' | 'orders' | 'customers' | 'inventory'
  title: string
  description: string
  enabled: boolean
}







