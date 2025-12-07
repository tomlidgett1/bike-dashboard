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

export interface StoreCategory {
  id: string;
  user_id: string;
  name: string;
  display_order: number;
  source: 'lightspeed' | 'custom';
  lightspeed_category_id?: string;
  product_ids: string[];
  is_active: boolean;
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

export interface StoreProfile {
  id: string;
  store_name: string;
  logo_url: string | null;
  store_type: string;
  address: string;
  phone: string;
  opening_hours: OpeningHours;
  categories: StoreCategoryWithProducts[];
  services: StoreService[];
}

export interface StoreCategoryWithProducts {
  id: string;
  name: string;
  display_order: number;
  products: MarketplaceProduct[];
  product_count: number;
}

export interface LightspeedCategoryOption {
  id: string;
  name: string;
  product_count: number;
}

export interface CreateCategoryRequest {
  name: string;
  source: 'lightspeed' | 'custom';
  lightspeed_category_id?: string;
  product_ids?: string[];
  display_order?: number;
}

export interface UpdateCategoryRequest {
  id: string;
  name?: string;
  product_ids?: string[];
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




