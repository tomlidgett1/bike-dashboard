/**
 * Lightspeed R-Series Integration Module
 * 
 * This module provides OAuth 2.0 authentication, secure token management,
 * and a type-safe API client for Lightspeed Retail POS (R-Series).
 */

// Configuration
export {
  LIGHTSPEED_CONFIG,
  getLightspeedCredentials,
  getEncryptionKey,
  buildAuthUrl,
} from './config'

// Types
export type {
  // Connection types
  LightspeedConnectionStatus,
  LightspeedSyncStatus,
  LightspeedConnection,
  LightspeedSyncSettings,
  LightspeedSyncLog,
  
  // OAuth types
  LightspeedTokenResponse,
  LightspeedTokenError,
  
  // API types
  LightspeedApiResponse,
  LightspeedApiError,
  LightspeedAccount,
  LightspeedAccountResponse,
  
  // Product types
  LightspeedItem,
  LightspeedItemPrice,
  LightspeedItemImage,
  LightspeedItemsResponse,
  
  // Category types
  LightspeedCategory,
  LightspeedCategoriesResponse,
  
  // Sale types
  LightspeedSale,
  LightspeedSaleLine,
  LightspeedSalePayment,
  LightspeedSalesResponse,
  
  // Customer types
  LightspeedCustomer,
  LightspeedContactAddress,
  LightspeedContactPhone,
  LightspeedContactEmail,
  LightspeedCustomersResponse,
  
  // Inventory types
  LightspeedItemShop,
  LightspeedItemShopsResponse,
  
  // Shop types
  LightspeedShop,
  LightspeedShopsResponse,
  
  // Register types
  LightspeedRegister,
  LightspeedRegistersResponse,
  
  // Employee types
  LightspeedEmployee,
  LightspeedEmployeesResponse,
  
  // Query types
  LightspeedPaginationParams,
  LightspeedDateFilterParams,
  LightspeedQueryParams,
  
  // Frontend types
  LightspeedConnectionState,
  SyncOption,
} from './types'

// Token Management
export {
  encryptToken,
  decryptToken,
  storeTokens,
  getDecryptedTokens,
  getConnection,
  tokenNeedsRefresh,
  refreshAccessToken,
  getValidAccessToken,
  updateConnectionStatus,
  updateLastSyncTime,
  disconnectUser,
  generateOAuthState,
  validateOAuthState,
} from './token-manager'

// API Client
export {
  LightspeedClient,
  createLightspeedClient,
} from './lightspeed-client'











