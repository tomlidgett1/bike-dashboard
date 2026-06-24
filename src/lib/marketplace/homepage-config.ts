/**
 * Store homepage (landing page) configuration: defaults + resolver.
 *
 * The raw value persisted in `users.homepage_config` may be `{}` or a
 * partial object. `resolveHomepageConfig` merges it over defaults that are
 * derived from the store's own profile data, so an unconfigured store still
 * renders a polished, on-brand landing page. As the owner customises pieces,
 * those override the derived defaults field-by-field.
 *
 * Pure TypeScript — safe to import from both server routes and client
 * components (no React / browser APIs).
 */

import type {
  StoreProfile,
  StoreHomepageConfig,
  HomeHighlight,
  HomeCollection,
  HomeSectionKey,
  HomeBanner,
} from '@/lib/types/store';

export const BRAND_YELLOW = '#ffde59';

export const DEFAULT_WEEKLY_SPECIALS_BANNER: HomeBanner = {
  id: 'banner-weekly-specials',
  enabled: true,
  kind: 'weekly_specials',
  title: 'Weekly specials',
  subtitle: '',
  footer_text: 'Changes weekly',
  image_url: null,
  href: 'weekly_specials',
};

export const HOME_SECTION_ORDER: HomeSectionKey[] = [
  'highlights',
  'collections',
  'carousel_1',
  'carousel_2',
  'story',
  'services',
  'gallery',
  'visit',
];

export const DEFAULT_HIGHLIGHTS: HomeHighlight[] = [
  {
    id: 'h-service',
    icon: 'wrench',
    title: 'Expert servicing',
    description: 'Factory-trained mechanics keep you rolling all season.',
  },
  {
    id: 'h-brands',
    icon: 'medal',
    title: 'Trusted brands',
    description: 'Hand-picked bikes and gear we ride ourselves.',
  },
  {
    id: 'h-fit',
    icon: 'bike',
    title: 'The right fit',
    description: 'Personal sizing so every ride feels effortless.',
  },
  {
    id: 'h-help',
    icon: 'headset',
    title: 'Always here to help',
    description: 'Friendly, honest advice in store and online.',
  },
];

/** Shorten a free-text address to a city-ish tail for hero copy. */
function shortLocation(address?: string | null): string | null {
  if (!address) return null;
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  // Prefer the second-to-last meaningful part (usually the suburb/city)
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

/**
 * Build category tiles from the store's richest categories. Each tile pulls
 * a representative product image so the collections grid is visual by default.
 */
export function buildAutoCollections(store: StoreProfile, limit = 6): HomeCollection[] {
  const cats = [...(store.categories ?? [])]
    .filter((c) => c.products && c.products.length > 0 && c.name && c.name !== 'Other')
    .sort((a, b) => (b.product_count ?? b.products.length) - (a.product_count ?? a.products.length))
    .slice(0, limit);

  return cats.map((c) => {
    const withImg = c.products.find((p) => p.primary_image_url || p.card_url);
    return {
      id: `col-${c.id}`,
      label: c.name,
      image_url: withImg?.primary_image_url || withImg?.card_url || null,
      href: c.name,
    };
  });
}

/** Default story body used until the owner writes their own. */
function defaultStoryBody(store: StoreProfile): string {
  const where = shortLocation(store.address);
  return (
    `${store.store_name} is more than a bike shop — we're a home for riders. ` +
    `From first pedal strokes to podium chases, our team is here with the bikes, ` +
    `gear and know-how to keep you moving.` +
    (where ? ` Drop in and say hello in ${where}.` : ' Drop in and say hello.')
  );
}

/**
 * Produce a fully-populated config from the (possibly empty/partial) raw value
 * plus the store profile. Never throws on malformed input.
 */
export function resolveHomepageConfig(
  raw: Partial<StoreHomepageConfig> | null | undefined,
  store: StoreProfile,
): StoreHomepageConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<StoreHomepageConfig>;

  const hasServices = (store.services?.length ?? 0) > 0;
  const location = shortLocation(store.address);

  // ── Hero ──────────────────────────────────────────────────────────────
  const rawHero = (r.hero ?? {}) as Partial<StoreHomepageConfig['hero']>;
  const heroImageUrls = sanitizeHeroImages(rawHero.image_urls, rawHero.image_url ?? store.cover_image_url ?? null);
  const hero: StoreHomepageConfig['hero'] = {
    variant: rawHero.variant ?? 'spotlight',
    eyebrow: rawHero.eyebrow ?? (store.store_type || 'Your local bike shop'),
    headline: rawHero.headline ?? store.store_name,
    subheadline:
      rawHero.subheadline ??
      `Bikes, gear and expert servicing${location ? ` in ${location}` : ' for every kind of rider'}.`,
    image_url: heroImageUrls[0] ?? null,
    image_urls: heroImageUrls,
    overlay: typeof rawHero.overlay === 'number' ? clamp(rawHero.overlay, 0, 80) : 40,
    align: rawHero.align ?? 'left',
    primary_cta: rawHero.primary_cta ?? { label: 'Shop the range', href: 'products' },
    secondary_cta:
      rawHero.secondary_cta !== undefined
        ? rawHero.secondary_cta
        : hasServices
          ? { label: 'Book a service', href: 'service' }
          : store.phone
            ? { label: 'Get directions', href: 'directions' }
            : null,
    contact: sanitizeHeroContact(rawHero.contact, store),
  };

  // ── Announcement ──────────────────────────────────────────────────────
  const rawAnn = (r.announcement ?? {}) as Partial<StoreHomepageConfig['announcement']>;
  const announcement: StoreHomepageConfig['announcement'] = {
    enabled: rawAnn.enabled ?? false,
    text: rawAnn.text ?? '',
  };

  // ── Banners ───────────────────────────────────────────────────────────
  const rawBanners = (r.banners ?? {}) as Partial<StoreHomepageConfig['banners']>;
  const banners: StoreHomepageConfig['banners'] = {
    enabled: rawBanners.enabled ?? true,
    items: sanitizeBanners(rawBanners.items),
  };

  // ── Highlights ────────────────────────────────────────────────────────
  const rawHi = (r.highlights ?? {}) as Partial<StoreHomepageConfig['highlights']>;
  const highlights: StoreHomepageConfig['highlights'] = {
    enabled: rawHi.enabled ?? true,
    items: Array.isArray(rawHi.items) ? rawHi.items : DEFAULT_HIGHLIGHTS,
  };

  // ── Collections ───────────────────────────────────────────────────────
  const rawCol = (r.collections ?? {}) as Partial<StoreHomepageConfig['collections']>;
  const auto = rawCol.auto ?? !Array.isArray(rawCol.items);
  const collections: StoreHomepageConfig['collections'] = {
    enabled: rawCol.enabled ?? true,
    title: rawCol.title ?? 'Shop by category',
    subtitle: rawCol.subtitle ?? 'Everything you need for the ride ahead',
    auto,
    items: auto
      ? buildAutoCollections(store)
      : Array.isArray(rawCol.items)
        ? rawCol.items
        : buildAutoCollections(store),
  };

  // ── Story ─────────────────────────────────────────────────────────────
  const rawStory = (r.story ?? {}) as Partial<StoreHomepageConfig['story']>;
  const story: StoreHomepageConfig['story'] = {
    enabled: rawStory.enabled ?? true,
    title: rawStory.title ?? `The ${store.store_name} story`,
    body: rawStory.body ?? defaultStoryBody(store),
    image_url: rawStory.image_url ?? null,
    layout: rawStory.layout ?? 'image-right',
  };

  // ── Gallery ───────────────────────────────────────────────────────────
  const rawGal = (r.gallery ?? {}) as Partial<StoreHomepageConfig['gallery']>;
  const galleryImages = Array.isArray(rawGal.images) ? rawGal.images : [];
  const gallery: StoreHomepageConfig['gallery'] = {
    enabled: rawGal.enabled ?? galleryImages.length > 0,
    title: rawGal.title ?? 'In the shop',
    images: galleryImages,
  };

  // ── Services teaser ───────────────────────────────────────────────────
  const rawSvc = (r.services ?? {}) as Partial<StoreHomepageConfig['services']>;
  const services: StoreHomepageConfig['services'] = {
    enabled: rawSvc.enabled ?? hasServices,
    title: rawSvc.title ?? 'Workshop & services',
    subtitle: rawSvc.subtitle ?? 'Book your bike in with our mechanics',
  };

  // ── Visit ─────────────────────────────────────────────────────────────
  const rawVisit = (r.visit ?? {}) as Partial<StoreHomepageConfig['visit']>;
  const visit: StoreHomepageConfig['visit'] = {
    enabled: rawVisit.enabled ?? true,
    title: rawVisit.title ?? 'Visit us',
  };

  // ── Featured carousels ───────────────────────────────────────────────────
  const rawFC = (r.featured_carousels ?? {}) as Partial<StoreHomepageConfig['featured_carousels']>;
  const featured_carousels: StoreHomepageConfig['featured_carousels'] = {
    enabled: rawFC.enabled ?? false,
    slot1: rawFC.slot1 ?? null,
    slot2: rawFC.slot2 ?? null,
    per_row: rawFC.per_row === 8 ? 8 : 6,
  };

  // ── Badges ────────────────────────────────────────────────────────────
  const rawBadges = (r.badges ?? {}) as Partial<StoreHomepageConfig['badges']>;
  const badges: StoreHomepageConfig['badges'] = {
    show_open_status: rawBadges.show_open_status ?? false,
    show_rating: rawBadges.show_rating ?? false,
    show_hours_on_hero: rawBadges.show_hours_on_hero ?? true,
  };

  // ── Section order ─────────────────────────────────────────────────────
  const section_order = sanitizeSectionOrder(r.section_order);

  return {
    enabled: r.enabled ?? true,
    theme: { accent: r.theme?.accent || BRAND_YELLOW },
    announcement,
    banners,
    hero,
    highlights,
    collections,
    story,
    gallery,
    services,
    visit,
    featured_carousels,
    section_order,
    badges,
  };
}

function sanitizeHeroContact(
  raw: unknown,
  _store: StoreProfile,
): StoreHomepageConfig['hero']['contact'] {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<StoreHomepageConfig['hero']['contact']>;
  return {
    show_address: o.show_address === true,
    address: typeof o.address === 'string' ? o.address : '',
    show_email: o.show_email === true,
    email: typeof o.email === 'string' ? o.email.trim() : '',
  };
}

function sanitizeBanners(raw: unknown): HomeBanner[] {
  const out: HomeBanner[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const banner = sanitizeBannerItem(item);
      if (banner) out.push(banner);
    }
  }
  if (!out.some((b) => b.kind === 'weekly_specials')) {
    out.unshift({ ...DEFAULT_WEEKLY_SPECIALS_BANNER });
  }
  return out.slice(0, 8);
}

function sanitizeBannerItem(raw: unknown): HomeBanner | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<HomeBanner>;
  if (!o.id || typeof o.id !== 'string') return null;

  const kind: HomeBanner['kind'] = o.kind === 'weekly_specials' ? 'weekly_specials' : 'custom';

  return {
    id: o.id,
    enabled: o.enabled !== false,
    kind,
    title:
      typeof o.title === 'string' && o.title.trim()
        ? o.title
        : kind === 'weekly_specials'
          ? 'Weekly specials'
          : 'New banner',
    subtitle: typeof o.subtitle === 'string' ? o.subtitle : '',
    footer_text:
      typeof o.footer_text === 'string'
        ? o.footer_text
        : kind === 'weekly_specials'
          ? 'Changes weekly'
          : '',
    image_url: typeof o.image_url === 'string' && o.image_url.trim() ? o.image_url : null,
    href:
      typeof o.href === 'string' && o.href.trim()
        ? o.href
        : kind === 'weekly_specials'
          ? 'weekly_specials'
          : 'products',
  };
}

/** Ensure the section order contains each known section exactly once. */
function sanitizeSectionOrder(raw: unknown): HomeSectionKey[] {
  const known = new Set<HomeSectionKey>(HOME_SECTION_ORDER);
  const seen = new Set<HomeSectionKey>();
  const out: HomeSectionKey[] = [];

  const push = (key: HomeSectionKey) => {
    if (!known.has(key) || seen.has(key)) return;
    out.push(key);
    seen.add(key);
  };

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (entry === 'carousels') {
        push('carousel_1');
        push('carousel_2');
        continue;
      }
      if (typeof entry === 'string') {
        push(entry as HomeSectionKey);
      }
    }
  }

  for (const key of HOME_SECTION_ORDER) {
    if (!seen.has(key)) out.push(key);
  }

  return out;
}

function sanitizeHeroImages(raw: unknown, fallback: string | null): string[] {
  const urls = Array.isArray(raw) ? raw : [];
  const out: string[] = [];

  for (const value of urls) {
    if (typeof value !== 'string') continue;
    const url = value.trim();
    if (url && !out.includes(url)) out.push(url);
    if (out.length === 3) break;
  }

  if (out.length === 0 && fallback) {
    const url = fallback.trim();
    if (url) out.push(url);
  }

  return out;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * The canonical "blank" config the settings editor starts from when a store
 * has never customised its homepage. Mirrors resolver defaults but without a
 * store context (the editor merges live store data for previews/auto tiles).
 */
export function blankHomepageConfig(): StoreHomepageConfig {
  return {
    enabled: true,
    theme: { accent: BRAND_YELLOW },
    announcement: { enabled: false, text: '' },
    banners: {
      enabled: true,
      items: [{ ...DEFAULT_WEEKLY_SPECIALS_BANNER }],
    },
    hero: {
      variant: 'spotlight',
      eyebrow: '',
      headline: '',
      subheadline: '',
      image_url: null,
      image_urls: [],
      overlay: 40,
      align: 'left',
      primary_cta: { label: 'Shop the range', href: 'products' },
      secondary_cta: { label: 'Book a service', href: 'service' },
      contact: {
        show_address: false,
        address: '',
        show_email: false,
        email: '',
      },
    },
    highlights: { enabled: true, items: DEFAULT_HIGHLIGHTS },
    collections: {
      enabled: true,
      title: 'Shop by category',
      subtitle: 'Everything you need for the ride ahead',
      auto: true,
      items: [],
    },
    story: {
      enabled: true,
      title: '',
      body: '',
      image_url: null,
      layout: 'image-right',
    },
    gallery: { enabled: false, title: 'In the shop', images: [] },
    services: {
      enabled: true,
      title: 'Workshop & services',
      subtitle: 'Book your bike in with our mechanics',
    },
    visit: { enabled: true, title: 'Visit us' },
    featured_carousels: { enabled: false, slot1: null, slot2: null, per_row: 6 },
    section_order: [...HOME_SECTION_ORDER],
    badges: { show_open_status: false, show_rating: false, show_hours_on_hero: true },
  };
}
