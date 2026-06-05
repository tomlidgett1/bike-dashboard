// ============================================================
// Marketplace Types
// ============================================================

// The two distinct "spaces" in the marketplace
export type MarketplaceSpace = 'marketplace' | 'stores' | 'uber';

export type MarketplaceCategory = 'Bicycles' | 'Parts' | 'Apparel' | 'Nutrition';

export interface MarketplaceSubcategories {
  Bicycles: string[];
  Parts: string[];
  Apparel: string[];
  Nutrition: string[];
}

export const MARKETPLACE_CATEGORIES: MarketplaceCategory[] = [
  'Bicycles',
  'Parts',
  'Apparel',
  'Nutrition',
];

export const MARKETPLACE_SUBCATEGORIES: MarketplaceSubcategories = {
  Bicycles: ['Road', 'Mountain', 'Hybrid', 'Electric', 'Kids', 'BMX', 'Cruiser', 'Other'],
  Parts: ['Frames', 'Wheels', 'Drivetrain', 'Brakes', 'Handlebars', 'Saddles', 'Pedals', 'Other'],
  Apparel: ['Jerseys', 'Shorts', 'Jackets', 'Gloves', 'Shoes', 'Helmets', 'Other'],
  Nutrition: ['Energy Bars', 'Gels', 'Drinks', 'Supplements', 'Other'],
};

export interface MarketplaceProduct {
  id: string;
  canonical_product_id?: string | null; // Link to canonical product for image discovery
  description: string;
  product_description?: string | null; // AI-generated product description from web search enrichment
  product_specs?: string | null; // AI-generated comprehensive spec sheet
  display_name?: string; // AI-cleaned product name for display
  price: number;
  // Discount pricing (store-managed, percentage-based, optional expiry).
  // sale_price is a DB-computed column (discounted price, or null when no %).
  // Whether the discount is *currently live* is a render-time decision —
  // see resolveLivePrice(): discount_active && (!discount_ends_at || ends_at > now).
  discount_percent?: number | null;
  discount_active?: boolean | null;
  discount_ends_at?: string | null;
  sale_price?: number | null;
  marketplace_category: string;
  marketplace_subcategory: string;
  marketplace_level_3_category?: string | null;
  category_name?: string | null; // Lightspeed category name (store inventory only)
  primary_image_url: string | null;
  image_variants?: {
    original?: string | null;
    [key: string]: string | null | undefined;
  } | null;
  image_formats?: Record<string, unknown> | null;
  all_images?: string[]; // All product images for gallery
  images?: Array<Record<string, unknown>>; // Raw images field (for listings)
  // Cloudinary: public_id is the single source of truth — responsive URLs are
  // computed from it at render time (see cloudinaryCardLoader). The *_url fields
  // are fallbacks for legacy/external images that have no public_id.
  cloudinary_public_id?: string | null;
  card_url?: string | null; // 400px product card image
  mobile_card_url?: string | null; // 320px product card image (mobile)
  thumbnail_url?: string | null; // 100px thumbnail for search
  detail_url?: string | null; // 800px detail page image
  qoh: number;
  model_year: string | null;
  created_at: string;
  user_id: string;
  store_name: string;
  store_logo_url: string | null;
  store_account_type?: string | null;
  store_bicycle_store?: boolean | null;
  first_name?: string | null;
  last_name?: string | null;

  // Brand — from Lightspeed manufacturer_name or manually entered during upload
  brand?: string | null;

  // Extended fields for private listings
  listing_type?: 'store_inventory' | 'private_listing';
  listing_source?: 'lightspeed' | 'manual' | 'online_catalog';

  // Per-product opt-in to the full-bleed Immersive product page layout.
  immersive_page?: boolean | null;

  // Per-product opt-in to Uber Express delivery. Only effective for verified
  // bicycle stores; checkout revalidates the full cart server-side.
  uber_delivery_enabled?: boolean | null;

  // Bike-specific fields
  frame_size?: string;
  frame_material?: string;
  bike_type?: string;
  groupset?: string;
  wheel_size?: string;
  suspension_type?: string;
  bike_weight?: string;
  color_primary?: string;
  color_secondary?: string;

  // Part-specific fields
  part_type_detail?: string;
  compatibility_notes?: string;
  material?: string;
  weight?: string;

  // Apparel-specific fields
  size?: string;
  gender_fit?: string;
  apparel_material?: string;

  // Condition & history
  condition_rating?: 'New' | 'Like New' | 'Excellent' | 'Good' | 'Fair' | 'Well Used';
  condition_details?: string;
  seller_notes?: string; // Seller's personal notes about condition, wear, why selling
  wear_notes?: string;
  usage_estimate?: string;
  purchase_location?: string;
  purchase_date?: string;
  service_history?: Array<{
    date: string;
    shop: string;
    work_done: string;
  }>;
  upgrades_modifications?: string;
  
  // Selling details
  reason_for_selling?: string;
  is_negotiable?: boolean;
  shipping_available?: boolean;
  shipping_cost?: number;
  pickup_location?: string;
  pickup_only?: boolean;
  included_accessories?: string;
  
  // Contact
  seller_contact_preference?: 'message' | 'phone' | 'email';
  seller_phone?: string;
  seller_email?: string;
  
  // Status
  listing_status?: 'draft' | 'active' | 'sold' | 'expired' | 'removed';
  published_at?: string;
  expires_at?: string;
}

export interface MarketplaceProductsResponse {
  products: MarketplaceProduct[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
    nextCursor?: {
      createdAt: string;
      id: string;
    } | null;
  };
}

export interface CategoryStats {
  category: MarketplaceCategory;
  subcategories: SubcategoryStats[];
  totalProducts: number;
}

export interface SubcategoryStats {
  name: string;
  count: number;
}

export interface MarketplaceCategoriesResponse {
  categories: CategoryStats[];
  totalProducts: number;
}

export interface MarketplaceFilters {
  category?: MarketplaceCategory; // Legacy support
  subcategory?: string; // Legacy support
  level1?: string; // New 3-level taxonomy
  level2?: string;
  level3?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'oldest';
  page?: number;
  pageSize?: number;
  createdAfter?: string | null; // ISO date string to filter products created after this date
  listingType?: 'store_inventory' | 'private_listing'; // Filter by listing type
  excludeBicycleStores?: boolean; // Exclude products from users with account_type = 'bicycle_store'
}
