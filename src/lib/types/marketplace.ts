// ============================================================
// Marketplace Types
// ============================================================

// The two distinct "spaces" in the marketplace
export type MarketplaceSpace = 'marketplace' | 'stores';

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
  display_name?: string; // AI-cleaned product name for display
  price: number;
  marketplace_category: string;
  marketplace_subcategory: string;
  marketplace_level_3_category?: string | null; // Third level categorization (e.g., XC, Trail, Enduro)
  primary_image_url: string | null;
  image_variants?: any;
  image_formats?: any;
  all_images?: string[]; // All product images for gallery
  images?: any; // Raw images field (for listings)
  // Cloudinary optimised URLs for instant loading
  card_url?: string | null; // 400px product card image
  thumbnail_url?: string | null; // 100px thumbnail for search
  detail_url?: string | null; // 800px detail page image
  qoh: number;
  model_year: string | null;
  created_at: string;
  user_id: string;
  store_name: string;
  store_logo_url: string | null;
  store_account_type?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  
  // Extended fields for private listings
  listing_type?: 'store_inventory' | 'private_listing';
  listing_source?: 'lightspeed' | 'manual';
  
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

