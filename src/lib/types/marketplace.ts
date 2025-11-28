// ============================================================
// Marketplace Types
// ============================================================

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
  description: string;
  price: number;
  marketplace_category: string;
  marketplace_subcategory: string;
  primary_image_url: string | null;
  image_variants?: any;
  image_formats?: any;
  qoh: number;
  model_year: string | null;
  created_at: string;
  user_id: string;
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
  category?: MarketplaceCategory;
  subcategory?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'oldest';
  page?: number;
  pageSize?: number;
  storeId?: string;
}

