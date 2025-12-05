// ============================================================
// OFFER SYSTEM TYPES
// ============================================================
// TypeScript interfaces for the product offers system

// ============================================================
// ENUMS AND STATUS TYPES
// ============================================================

export type OfferStatus = 
  | 'pending'      // Awaiting seller response
  | 'accepted'     // Seller accepted the offer
  | 'rejected'     // Seller rejected the offer
  | 'countered'    // Seller made a counter-offer
  | 'expired'      // Offer expired (7 days passed)
  | 'cancelled';   // Buyer cancelled the offer

export type OfferActionType = 
  | 'created' 
  | 'countered' 
  | 'accepted' 
  | 'rejected' 
  | 'cancelled' 
  | 'expired';

export type OfferRole = 'buyer' | 'seller';

// ============================================================
// DATABASE ENTITIES
// ============================================================

export interface Offer {
  id: string;
  product_id: string;
  buyer_id: string;
  seller_id: string;
  original_price: number;
  offer_amount: number;
  offer_percentage: number | null;
  status: OfferStatus;
  message: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface OfferHistory {
  id: string;
  offer_id: string;
  action_type: OfferActionType;
  offered_by_id: string;
  previous_amount: number | null;
  new_amount: number | null;
  message: string | null;
  created_at: string;
}

// ============================================================
// ENRICHED TYPES WITH RELATIONS
// ============================================================

export interface EnrichedOffer extends Offer {
  // Product details
  product?: {
    id: string;
    description: string;
    display_name: string | null;
    primary_image_url: string | null;
    listing_status: string | null;
  };
  
  // Buyer details
  buyer?: {
    user_id: string;
    name: string;
    business_name: string;
    logo_url: string | null;
  };
  
  // Seller details
  seller?: {
    user_id: string;
    name: string;
    business_name: string;
    logo_url: string | null;
  };
  
  // History
  history?: OfferHistory[];
  
  // Computed fields
  is_expired?: boolean;
  time_remaining?: number; // milliseconds
  savings?: number; // amount saved from original price
  savings_percentage?: number; // percentage saved
}

export interface OfferHistoryWithUser extends OfferHistory {
  user?: {
    user_id: string;
    name: string;
    business_name: string;
    logo_url: string | null;
  };
}

// ============================================================
// API REQUEST TYPES
// ============================================================

export interface CreateOfferRequest {
  productId: string;
  offerAmount: number;
  offerPercentage?: number;
  message?: string;
}

export interface CounterOfferRequest {
  newAmount: number;
  message?: string;
}

export interface CancelOfferRequest {
  reason?: string;
}

export interface GetOffersRequest {
  role?: OfferRole; // Filter by buyer or seller
  status?: OfferStatus | OfferStatus[]; // Filter by status
  productId?: string; // Filter by product
  page?: number;
  limit?: number;
}

// ============================================================
// API RESPONSE TYPES
// ============================================================

export interface CreateOfferResponse {
  offer: EnrichedOffer;
  message: string;
}

export interface GetOfferResponse {
  offer: EnrichedOffer;
}

export interface GetOffersResponse {
  offers: EnrichedOffer[];
  total: number;
  page: number;
  limit: number;
  stats?: {
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
    countered: number;
    expired: number;
  };
}

export interface AcceptOfferResponse {
  offer: EnrichedOffer;
  message: string;
}

export interface RejectOfferResponse {
  offer: EnrichedOffer;
  message: string;
}

export interface CounterOfferResponse {
  offer: EnrichedOffer;
  message: string;
}

export interface CancelOfferResponse {
  offer: EnrichedOffer;
  message: string;
}

export interface OfferStatsResponse {
  total_offers: number;
  pending_offers: number;
  accepted_offers: number;
  rejected_offers: number;
  countered_offers: number;
  expired_offers: number;
  acceptance_rate: number; // percentage
  average_offer_amount: number;
  average_discount_percentage: number;
}

// ============================================================
// UI COMPONENT TYPES
// ============================================================

export interface MakeOfferButtonProps {
  productId: string;
  productName: string;
  productPrice: number;
  sellerId: string;
  productImage?: string | null;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  fullWidth?: boolean;
  className?: string;
}

export interface OfferCardProps {
  offer: EnrichedOffer;
  role: OfferRole;
  onAccept?: (offerId: string) => void;
  onReject?: (offerId: string) => void;
  onCounter?: (offerId: string) => void;
  onCancel?: (offerId: string) => void;
  onViewDetails?: (offerId: string) => void;
  compact?: boolean;
}

export interface OfferDetailCardProps {
  offer: EnrichedOffer;
  role: OfferRole;
  onAccept?: () => void;
  onReject?: () => void;
  onCounter?: () => void;
  onCancel?: () => void;
  onMessage?: () => void;
}

export interface CounterOfferModalProps {
  offer: EnrichedOffer;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (amount: number, message?: string) => Promise<void>;
}

export interface OfferStatusBadgeProps {
  status: OfferStatus;
  expiresAt?: string;
  className?: string;
}

export interface OfferHistoryTimelineProps {
  history: OfferHistoryWithUser[];
  currentUserId?: string;
}

// ============================================================
// UTILITY TYPES
// ============================================================

export interface OfferFilter {
  role?: OfferRole;
  status?: OfferStatus | OfferStatus[];
  productId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface OfferPagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface OfferSortOptions {
  field: 'created_at' | 'expires_at' | 'offer_amount' | 'updated_at';
  direction: 'asc' | 'desc';
}

// ============================================================
// VALIDATION TYPES
// ============================================================

export interface OfferValidation {
  isValid: boolean;
  errors: {
    amount?: string;
    percentage?: string;
    product?: string;
    seller?: string;
    general?: string;
  };
}

// ============================================================
// NOTIFICATION TYPES
// ============================================================

export interface OfferNotification {
  id: string;
  type: 'offer_received' | 'offer_accepted' | 'offer_rejected' | 'offer_countered' | 'offer_expired' | 'offer_cancelled';
  offer_id: string;
  user_id: string;
  is_read: boolean;
  created_at: string;
  offer?: EnrichedOffer;
}

// ============================================================
// PRESET OFFER OPTIONS
// ============================================================

export interface OfferPreset {
  label: string;
  percentage: number;
  calculateAmount: (originalPrice: number) => number;
}

export const OFFER_PRESETS: OfferPreset[] = [
  {
    label: '10% off',
    percentage: 10,
    calculateAmount: (price) => Math.round(price * 0.9 * 100) / 100,
  },
  {
    label: '5% off',
    percentage: 5,
    calculateAmount: (price) => Math.round(price * 0.95 * 100) / 100,
  },
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

export function calculateOfferPercentage(originalPrice: number, offerAmount: number): number {
  if (originalPrice <= 0) return 0;
  return Math.round(((originalPrice - offerAmount) / originalPrice) * 100 * 100) / 100;
}

export function calculateSavings(originalPrice: number, offerAmount: number): number {
  return Math.max(0, originalPrice - offerAmount);
}

export function isOfferExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

export function getTimeRemaining(expiresAt: string): number {
  return Math.max(0, new Date(expiresAt).getTime() - Date.now());
}

export function formatTimeRemaining(milliseconds: number): string {
  const days = Math.floor(milliseconds / (1000 * 60 * 60 * 24));
  const hours = Math.floor((milliseconds % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) {
    return `${days}d ${hours}h remaining`;
  } else if (hours > 0) {
    return `${hours}h remaining`;
  } else {
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    return `${minutes}m remaining`;
  }
}

export function getOfferStatusColor(status: OfferStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    case 'accepted':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'rejected':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'countered':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'expired':
      return 'bg-gray-100 text-gray-500 border-gray-200';
    case 'cancelled':
      return 'bg-gray-100 text-gray-500 border-gray-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

export function getOfferStatusLabel(status: OfferStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'accepted':
      return 'Accepted';
    case 'rejected':
      return 'Rejected';
    case 'countered':
      return 'Counter Offer';
    case 'expired':
      return 'Expired';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

export function canCancelOffer(offer: Offer, userId: string): boolean {
  return offer.buyer_id === userId && 
         offer.status === 'pending' && 
         !isOfferExpired(offer.expires_at);
}

export function canAcceptOffer(offer: Offer, userId: string): boolean {
  return offer.seller_id === userId && 
         (offer.status === 'pending' || offer.status === 'countered') && 
         !isOfferExpired(offer.expires_at);
}

export function canRejectOffer(offer: Offer, userId: string): boolean {
  return offer.seller_id === userId && 
         (offer.status === 'pending' || offer.status === 'countered') && 
         !isOfferExpired(offer.expires_at);
}

export function canCounterOffer(offer: Offer, userId: string): boolean {
  return offer.seller_id === userId && 
         (offer.status === 'pending' || offer.status === 'countered') && 
         !isOfferExpired(offer.expires_at);
}

