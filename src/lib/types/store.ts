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
export type StoreCarouselPage = 'products' | 'bikes';
export type StoreCategorySource = 'lightspeed' | 'custom' | 'brand' | 'uber' | 'specials' | 'display_override';
/** Sources a store owner can create directly. `specials` is managed by the specials engine; `display_override` is internal. */
export type EditableStoreCategorySource = Exclude<StoreCategorySource, 'display_override' | 'specials'>;

export interface StoreCategory {
  id: string;
  user_id: string;
  name: string;
  display_order: number;
  source: StoreCategorySource;
  lightspeed_category_id?: string;
  /** Original Lightspeed category label when the carousel display name is customised. */
  lightspeed_category_name?: string | null;
  brand_name?: string;
  product_ids: string[];
  /** Live product count (dynamic sources may differ from stored product_ids length). */
  resolved_product_count?: number;
  is_active: boolean;
  carousel_size?: CarouselSize;
  logo_url?: string | null;
  hide_title?: boolean;
  /** Optional tagline shown under the carousel title on the storefront. */
  subtitle?: string | null;
  section_id?: string | null;
  store_page?: StoreCarouselPage;
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
  /** Bullet points of what the service includes — shown as a checklist on the cards. */
  includes?: string[];
  display_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface StoreRental {
  id: string;
  user_id?: string;
  product_id: string;
  name: string;
  description?: string | null;
  price_per_hour?: number | null;
  price_per_day?: number | null;
  image_url?: string | null;
  is_available: boolean;
  category?: string | null;
  display_order?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface StoreBrand {
  id: string;
  user_id: string;
  name: string;
  logo_url: string | null;
  lightspeed_manufacturer_id?: string | null;
  lightspeed_manufacturer_name?: string | null;
  display_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LightspeedManufacturerOption {
  id: string;
  name: string;
}

export interface StoreProfile {
  id: string;
  /** URL slug derived from the store name, for SEO-friendly storefront URLs. Null until backfilled. */
  slug?: string | null;
  store_name: string;
  logo_url: string | null;
  store_type: string;
  address: string;
  phone: string;
  opening_hours: OpeningHours;
  categories: StoreCategoryWithProducts[];
  sections: StoreSectionWithCategories[];
  services: StoreService[];
  rentals: StoreRental[];
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
  /** False when the public homepage payload intentionally carries a trimmed product feed. */
  product_feed_complete?: boolean;
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

/** Promotional row card on the home tab — weekly specials or a custom link. */
export type HomeBannerKind = 'weekly_specials' | 'custom';

export interface HomeBanner {
  id: string;
  enabled: boolean;
  kind: HomeBannerKind;
  title: string;
  /** Empty subtitle on weekly specials banners auto-fills from live deal counts. */
  subtitle: string;
  footer_text: string;
  image_url: string | null;
  /** Tab key, `weekly_specials`, `call`, `directions`, or an absolute URL. */
  href: string;
}

export type HomeSectionKey =
  | 'highlights'
  | 'collections'
  | 'carousel_1'
  | 'carousel_2'
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
  banners: {
    enabled: boolean;
    items: HomeBanner[];
  };
  hero: {
    variant: HeroVariant;
    eyebrow: string;
    headline: string;
    subheadline: string;
    image_url: string | null;
    /** Up to three rotating hero/header images. `image_url` mirrors the first item for older configs. */
    image_urls: string[];
    /** Dark overlay strength over the hero image, 0–80. */
    overlay: number;
    align: 'left' | 'center';
    primary_cta: HomeCta;
    secondary_cta: HomeCta | null;
    contact: {
      show_address: boolean;
      /** When empty, falls back to the store profile address. */
      address: string;
      show_email: boolean;
      email: string;
    };
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
  /** Ordered page layout for the Products tab — interleaves sections and standalone carousels. */
  products_page_layout?: Array<{ type: 'section' | 'carousel'; id: string }>;
  /** Ordered carousel layout for the Bikes tab. */
  bikes_page_layout?: Array<{ type: 'carousel'; id: string }>;
  badges: {
    /** Show the live Open/Closed pill next to opening hours (Visit section + About tab). */
    show_open_status: boolean;
    /** Show the star rating in the sticky store header. */
    show_rating: boolean;
    /** Show today's opening hours overlaid on the hero image. */
    show_hours_on_hero: boolean;
  };
}

export interface StoreCategoryWithProducts {
  id: string;
  name: string;
  display_order: number;
  source?: StoreCategorySource;
  products: MarketplaceProduct[];
  product_count: number;
  carousel_size?: CarouselSize;
  section_id?: string | null;
  logo_url?: string | null;
  hide_title?: boolean;
  subtitle?: string | null;
  store_page?: StoreCarouselPage;
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
  source: EditableStoreCategorySource;
  lightspeed_category_id?: string;
  lightspeed_category_name?: string;
  brand_name?: string;
  product_ids?: string[];
  display_order?: number;
  store_page?: StoreCarouselPage;
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
  hide_title?: boolean;
  store_page?: StoreCarouselPage;
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
  includes?: string[];
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
  includes?: string[];
  display_order?: number;
  is_active?: boolean;
}

export interface CreateRentalRequest {
  product_id: string;
  description?: string | null;
  price_per_hour?: number | null;
  price_per_day?: number | null;
  is_available?: boolean;
  display_order?: number;
}

export interface UpdateRentalRequest {
  id: string;
  description?: string | null;
  price_per_hour?: number | null;
  price_per_day?: number | null;
  is_available?: boolean;
  display_order?: number;
  is_active?: boolean;
}

export type RentalBookingStatus = 'pending' | 'confirmed' | 'cancelled';

export interface StoreRentalBooking {
  id: string;
  user_id: string;
  rental_id: string;
  start_date: string;
  end_date: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  status: RentalBookingStatus;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RentalAvailabilityResponse {
  booked_dates: string[];
  bookings: Array<{
    id: string;
    start_date: string;
    end_date: string;
    status: RentalBookingStatus;
  }>;
}

export interface CreateRentalBookingRequest {
  rental_id: string;
  start_date: string;
  end_date: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  status?: RentalBookingStatus;
  notes?: string | null;
}

export interface UpdateRentalBookingRequest {
  id: string;
  start_date?: string;
  end_date?: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  status?: RentalBookingStatus;
  notes?: string | null;
}

export interface CreateBrandRequest {
  name: string;
  logo_url?: string;
  lightspeed_manufacturer_id?: string | null;
  lightspeed_manufacturer_name?: string | null;
  display_order?: number;
}

export interface UpdateBrandRequest {
  id: string;
  name?: string;
  logo_url?: string;
  lightspeed_manufacturer_id?: string | null;
  lightspeed_manufacturer_name?: string | null;
  display_order?: number;
  is_active?: boolean;
}
