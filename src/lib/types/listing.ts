// ============================================================
// Listing Types for Sell Your Bike Flow
// ============================================================

export type ListingType = 'store_inventory' | 'private_listing';
export type ListingSource = 'lightspeed' | 'manual' | 'facebook_import';
export type ListingStatus = 'draft' | 'active' | 'sold' | 'expired' | 'removed';

export type ItemType = 'bike' | 'part' | 'apparel';

export type ConditionRating = 'New' | 'Like New' | 'Excellent' | 'Good' | 'Fair' | 'Well Used';

export type FrameMaterial = 'Carbon' | 'Aluminium' | 'Steel' | 'Titanium' | 'Other';

export type SuspensionType = 'Hardtail' | 'Full Suspension' | 'Rigid' | 'N/A';

export type GenderFit = "Men's" | "Women's" | 'Unisex';

export type ContactPreference = 'message' | 'phone' | 'email';

// ============================================================
// Service History Record
// ============================================================
export interface ServiceRecord {
  date: string; // ISO date string
  shop: string;
  work_done: string;
}

// ============================================================
// Image Upload Type
// ============================================================
export interface ListingImage {
  id: string;
  url: string;           // Original/full-size image URL
  thumbnailUrl?: string; // 100px thumbnail for search dropdowns
  mobileCardUrl?: string; // 200px image for mobile product cards
  cardUrl?: string;      // 400px image for desktop product cards
  order: number;
  isPrimary: boolean;
}

// ============================================================
// Complete Listing Form Data
// ============================================================
export interface ListingFormData {
  // Meta
  id?: string;
  itemType: ItemType;
  
  // Basic Info (all types)
  title?: string;
  brand?: string;
  model?: string;
  modelYear?: string;
  description?: string;
  
  // Categories
  marketplace_category?: string;
  marketplace_subcategory?: string;
  
  // Bike-Specific
  frameSize?: string;
  frameMaterial?: FrameMaterial;
  bikeType?: string;
  groupset?: string;
  wheelSize?: string;
  suspensionType?: SuspensionType;
  bikeWeight?: string;
  colorPrimary?: string;
  colorSecondary?: string;
  
  // Part-Specific
  partTypeDetail?: string;
  compatibilityNotes?: string;
  material?: string;
  weight?: string;
  
  // Apparel-Specific
  size?: string;
  genderFit?: GenderFit;
  apparelMaterial?: string;
  
  // Condition & History
  conditionRating?: ConditionRating;
  conditionDetails?: string;
  wearNotes?: string;
  usageEstimate?: string;
  purchaseLocation?: string;
  purchaseDate?: string; // ISO date string
  serviceHistory?: ServiceRecord[];
  upgradesModifications?: string;
  
  // Selling Details
  price?: number;
  originalRrp?: number;
  reasonForSelling?: string;
  isNegotiable?: boolean;
  shippingAvailable?: boolean;
  shippingCost?: number;
  shippingRestrictions?: string;
  pickupLocation?: string;
  includedAccessories?: string;
  
  // Contact
  sellerContactPreference?: ContactPreference;
  sellerPhone?: string;
  sellerEmail?: string;
  
  // Images
  images?: ListingImage[];
  primaryImageUrl?: string;
  
  // Status
  listingStatus?: ListingStatus;
  
  // Source tracking
  facebook_source_url?: string;
  
  // AI Metadata
  structuredMetadata?: any;
  searchUrls?: any[];
  fieldConfidence?: any;
}

// ============================================================
// Step-Specific Form Data Types
// ============================================================

// Step 2A: Bike Details
export interface BikeDetailsFormData {
  title?: string;
  brand?: string;
  model?: string;
  modelYear?: string;
  bikeType?: string;
  frameSize?: string;
  frameMaterial?: FrameMaterial;
  colorPrimary?: string;
  colorSecondary?: string;
  groupset?: string;
  wheelSize?: string;
  suspensionType?: SuspensionType;
  bikeWeight?: string;
  upgradesModifications?: string;
}

// Step 2B: Part Details
export interface PartDetailsFormData {
  title?: string;
  marketplace_subcategory?: string;
  partTypeDetail?: string;
  brand?: string;
  model?: string;
  material?: string;
  colorPrimary?: string;
  weight?: string;
  compatibilityNotes?: string;
  intendedUse?: string;
}

// Step 2C: Apparel Details
export interface ApparelDetailsFormData {
  title?: string;
  marketplace_subcategory?: string;
  brand?: string;
  model?: string;
  size?: string;
  genderFit?: GenderFit;
  fitNotes?: string;
  colorPrimary?: string;
  apparelMaterial?: string;
  features?: string;
}

// Step 3: Condition
export interface ConditionFormData {
  conditionRating?: ConditionRating;
  conditionDetails?: string;
  wearNotes?: string;
  usageEstimate?: string;
  ridingStyle?: string;
}

// Step 4: Photos
export interface PhotosFormData {
  images: ListingImage[];
  primaryImageUrl?: string;
}

// Step 5: History
export interface HistoryFormData {
  purchaseLocation?: string;
  purchaseDate?: string;
  originalRrp?: number;
  serviceHistory?: ServiceRecord[];
  upgradesModifications?: string;
  reasonForSelling?: string;
}

// Step 6: Pricing
export interface PricingFormData {
  price?: number;
  isNegotiable?: boolean;
  reasonForSelling?: string;
  pickupLocation?: string;
  shippingAvailable?: boolean;
  shippingCost?: number;
  shippingRestrictions?: string;
  includedAccessories?: string;
  sellerContactPreference?: ContactPreference;
  sellerPhone?: string;
  sellerEmail?: string;
}

// ============================================================
// Database Product Type Extension
// ============================================================
export interface ListingProduct {
  id: string;
  user_id: string;
  listing_type: ListingType;
  listing_source: ListingSource;
  listing_status: ListingStatus;
  
  // Basic
  description: string;
  price: number;
  marketplace_category: string;
  marketplace_subcategory: string;
  
  // Bike fields
  frame_size?: string;
  frame_material?: string;
  bike_type?: string;
  groupset?: string;
  wheel_size?: string;
  suspension_type?: string;
  bike_weight?: string;
  color_primary?: string;
  color_secondary?: string;
  
  // Part fields
  part_type_detail?: string;
  compatibility_notes?: string;
  material?: string;
  weight?: string;
  
  // Apparel fields
  size?: string;
  gender_fit?: string;
  apparel_material?: string;
  
  // Condition
  condition_rating?: ConditionRating;
  condition_details?: string;
  wear_notes?: string;
  usage_estimate?: string;
  purchase_location?: string;
  purchase_date?: string;
  service_history?: ServiceRecord[];
  upgrades_modifications?: string;
  
  // Selling
  reason_for_selling?: string;
  is_negotiable?: boolean;
  shipping_available?: boolean;
  shipping_cost?: number;
  pickup_location?: string;
  included_accessories?: string;
  
  // Contact
  seller_contact_preference?: ContactPreference;
  seller_phone?: string;
  seller_email?: string;
  
  // Images
  images?: any;
  primary_image_url?: string;
  
  // Dates
  published_at?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
  
  // Inventory
  qoh: number;
  is_active: boolean;
}

// ============================================================
// Constants
// ============================================================

export const BIKE_TYPES = [
  'Road',
  'Mountain',
  'Gravel',
  'Hybrid',
  'Electric',
  'BMX',
  'Cruiser',
  'Kids',
  'Other',
] as const;

export const FRAME_MATERIALS: FrameMaterial[] = [
  'Carbon',
  'Aluminium',
  'Steel',
  'Titanium',
  'Other',
];

export const WHEEL_SIZES = [
  '700c',
  '29"',
  '27.5"',
  '26"',
  '20"',
  '16"',
  'Other',
] as const;

export const SUSPENSION_TYPES: SuspensionType[] = [
  'Hardtail',
  'Full Suspension',
  'Rigid',
  'N/A',
];

export const CONDITION_RATINGS: ConditionRating[] = [
  'New',
  'Like New',
  'Excellent',
  'Good',
  'Fair',
  'Well Used',
];

export const USAGE_ESTIMATES = [
  'Under 100km',
  '100-500km',
  '500-1,000km',
  '1,000-5,000km',
  '5,000+ km',
  'Less than 6 months',
  '6-12 months',
  '1-2 years',
  '2-5 years',
  '5+ years',
] as const;

export const RIDING_STYLES = [
  'Casual/Recreational',
  'Commuting',
  'Road Racing',
  'Mountain Biking',
  'Gravel/Adventure',
  'Touring',
  'Track/Velodrome',
  'BMX/Freestyle',
] as const;

export const REASONS_FOR_SELLING = [
  'Upgrading to new bike',
  'No longer fits',
  'Switching discipline',
  'Reducing collection',
  'Moving/Relocating',
  'Need the funds',
  'Not using enough',
  'Other',
] as const;

export const GENDER_FITS: GenderFit[] = [
  "Men's",
  "Women's",
  'Unisex',
];

export const APPAREL_SIZES = [
  'XXS',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  'XXXL',
] as const;

export const SHOE_SIZES_EU = Array.from({ length: 30 }, (_, i) => (35 + i).toString());
export const SHOE_SIZES_US_MENS = Array.from({ length: 15 }, (_, i) => (6 + i * 0.5).toString());
export const SHOE_SIZES_US_WOMENS = Array.from({ length: 15 }, (_, i) => (5 + i * 0.5).toString());

// Common cycling brands for autocomplete
export const COMMON_BIKE_BRANDS = [
  'Specialized',
  'Trek',
  'Giant',
  'Cannondale',
  'Scott',
  'Santa Cruz',
  'Cervélo',
  'Pinarello',
  'BMC',
  'Canyon',
  'Focus',
  'Merida',
  'Bianchi',
  'Colnago',
  'Ridley',
  'Wilier',
  'De Rosa',
  'Look',
  'Time',
  'Pivot',
  'Yeti',
  'Orbea',
  'Cube',
  'Felt',
  'Fuji',
  'GT',
  'Kona',
  'Norco',
  'Polygon',
  'Marin',
  'Salsa',
  'Surly',
  'All-City',
  'Ribble',
  'Rose',
  'Van Nicholas',
  'Lynskey',
  'Moots',
  'Seven',
  'Independent Fabrication',
  'Custom Build',
  'Other',
];

export const COMMON_COMPONENT_BRANDS = [
  'Shimano',
  'SRAM',
  'Campagnolo',
  'FSA',
  'Rotor',
  'Praxis',
  'Race Face',
  'Hope',
  'Chris King',
  'DT Swiss',
  'Mavic',
  'Zipp',
  'ENVE',
  'Reynolds',
  'Fulcrum',
  'Hunt',
  'Roval',
  'Bontrager',
  'Easton',
  'Continental',
  'Schwalbe',
  'Pirelli',
  'Michelin',
  'Vittoria',
  'Maxxis',
  'WTB',
  'Fox',
  'RockShox',
  'Magura',
  'Formula',
  'Avid',
  'Hayes',
  'Other',
];

