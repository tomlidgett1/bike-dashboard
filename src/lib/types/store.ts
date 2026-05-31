/**
 * Store-related type definitions
 * For merchant store profiles, categories, and services
 */

import type { MarketplaceProduct } from './marketplace';

export interface OpeningHours {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
}

export interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

export type CarouselSize = 'featured' | 'normal' | 'compact';

export interface StoreCategory {
  id: string;
  user_id: string;
  name: string;
  display_order: number;
  source: 'lightspeed' | 'custom' | 'brand';
  lightspeed_category_id?: string;
  brand_name?: string;
  product_ids: string[];
  is_active: boolean;
  carousel_size?: CarouselSize;
  logo_url?: string | null;
  hide_title?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface StoreService {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  display_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface StoreBrand {
  id: string;
  user_id: string;
  name: string;
  logo_url: string | null;
  display_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface StoreProfile {
  id: string;
  store_name: string;
  logo_url: string | null;
  store_type: string;
  address: string;
  phone: string;
  opening_hours: OpeningHours;
  categories: StoreCategoryWithProducts[];
  sections: StoreSectionWithCategories[];
  services: StoreService[];
  brands: StoreBrand[];
  /** Optional storefront enrichments — rendered only when present */
  cover_image_url?: string | null;
  description?: string | null;
  rating?: number | null;
  review_count?: number | null;
}

export interface StoreCategoryWithProducts {
  id: string;
  name: string;
  display_order: number;
  products: MarketplaceProduct[];
  product_count: number;
  carousel_size?: CarouselSize;
  section_id?: string | null;
  logo_url?: string | null;
  hide_title?: boolean;
}

export interface StoreSection {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  display_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface StoreSectionWithCategories {
  id: string;
  name: string;
  description?: string | null;
  display_order: number;
  categories: StoreCategoryWithProducts[];
}

export interface LightspeedCategoryOption {
  id: string;
  name: string;
  product_count: number;
}

export interface CreateCategoryRequest {
  name: string;
  source: 'lightspeed' | 'custom' | 'brand';
  lightspeed_category_id?: string;
  brand_name?: string;
  product_ids?: string[];
  display_order?: number;
}

export interface UpdateCategoryRequest {
  id: string;
  name?: string;
  brand_name?: string;
  product_ids?: string[];
  display_order?: number;
  is_active?: boolean;
  carousel_size?: CarouselSize;
  section_id?: string | null;
  logo_url?: string | null;
}

export interface CreateSectionRequest {
  name: string;
  description?: string;
  display_order?: number;
}

export interface UpdateSectionRequest {
  id: string;
  name?: string;
  description?: string;
  display_order?: number;
  is_active?: boolean;
}

export interface CreateServiceRequest {
  name: string;
  description?: string;
  display_order?: number;
}

export interface UpdateServiceRequest {
  id: string;
  name?: string;
  description?: string;
  display_order?: number;
  is_active?: boolean;
}

export interface CreateBrandRequest {
  name: string;
  logo_url?: string;
  display_order?: number;
}

export interface UpdateBrandRequest {
  id: string;
  name?: string;
  logo_url?: string;
  display_order?: number;
  is_active?: boolean;
}











