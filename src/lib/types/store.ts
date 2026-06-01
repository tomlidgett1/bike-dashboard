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
  price?: number | null;
  price_from?: boolean;
  duration_minutes?: number | null;
  highlight?: boolean;
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
  website?: string | null;
  social_links?: SocialLinks | null;
  /** Raw landing-page configuration (Home tab). Empty/undefined → defaults. */
  homepage_config?: StoreHomepageConfig | null;
}

export interface SocialLinks {
  instagram?: string;
  facebook?: string;
  strava?: string;
  twitter?: string;
  website?: string;
}

// ============================================================
// Store Homepage (Landing Page) configuration
// Persisted as users.homepage_config (JSONB). All fields optional
// on the wire — `resolveHomepageConfig` fills defaults from the
// store profile so an unconfigured store still renders beautifully.
// ============================================================

/**
 * A call-to-action target. `href` is one of:
 *  - a store tab key: 'products' | 'service' | 'rentals' | 'about'
 *  - 'call' (uses the store phone via tel:)
 *  - 'directions' (opens maps for the store address)
 *  - an absolute URL ('https://…') for anything external
 */
export interface HomeCta {
  label: string;
  href: string;
}

export interface HomeHighlight {
  id: string;
  /** Key into the shared icon registry (see homepage-icons.tsx) */
  icon: string;
  title: string;
  description: string;
}

export interface HomeCollection {
  id: string;
  label: string;
  /** Optional override image; when null the renderer pulls a product image */
  image_url: string | null;
  /** Category name to deep-link into the Products tab */
  href: string;
}

export interface HomeGalleryImage {
  id: string;
  url: string;
  caption?: string;
}

export type HomeSectionKey =
  | 'highlights'
  | 'collections'
  | 'carousels'
  | 'story'
  | 'gallery'
  | 'services'
  | 'visit';

export type HeroVariant = 'spotlight' | 'split' | 'minimal';

export interface StoreHomepageConfig {
  /** Master switch for the Home tab. When false the tab is hidden. */
  enabled: boolean;
  theme: {
    /** Accent colour used for CTAs and highlights (hex). */
    accent: string;
  };
  announcement: {
    enabled: boolean;
    text: string;
  };
  hero: {
    variant: HeroVariant;
    eyebrow: string;
    headline: string;
    subheadline: string;
    image_url: string | null;
    /** Dark overlay strength over the hero image, 0–80. */
    overlay: number;
    align: 'left' | 'center';
    primary_cta: HomeCta;
    secondary_cta: HomeCta | null;
  };
  highlights: {
    enabled: boolean;
    items: HomeHighlight[];
  };
  collections: {
    enabled: boolean;
    title: string;
    subtitle: string;
    /** When true, auto-build tiles from the store's top categories. */
    auto: boolean;
    items: HomeCollection[];
  };
  story: {
    enabled: boolean;
    title: string;
    body: string;
    image_url: string | null;
    layout: 'image-left' | 'image-right';
  };
  gallery: {
    enabled: boolean;
    title: string;
    images: HomeGalleryImage[];
  };
  services: {
    enabled: boolean;
    title: string;
    subtitle: string;
  };
  visit: {
    enabled: boolean;
    title: string;
  };
  featured_carousels: {
    enabled: boolean;
    /** category_id of the first featured carousel, or null */
    slot1: string | null;
    /** category_id of the second featured carousel, or null */
    slot2: string | null;
    /** Initial visible product count per carousel (controls density) */
    per_row: 6 | 8;
  };
  /** Order of the sections that render beneath the hero. */
  section_order: HomeSectionKey[];
  badges: {
    /** Show the live Open/Closed pill next to opening hours (Visit section + About tab). */
    show_open_status: boolean;
    /** Show the star rating in the sticky store header. */
    show_rating: boolean;
  };
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
  price?: number | null;
  price_from?: boolean;
  duration_minutes?: number | null;
  highlight?: boolean;
  display_order?: number;
}

export interface UpdateServiceRequest {
  id: string;
  name?: string;
  description?: string;
  price?: number | null;
  price_from?: boolean;
  duration_minutes?: number | null;
  highlight?: boolean;
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











