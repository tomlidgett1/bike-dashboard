/**
 * Schema.org JSON-LD builders.
 *
 * These produce plain objects that get serialised into <script type="application/ld+json">
 * via the <JsonLd> component. Rich structured data is what turns a plain blue link
 * into a result with price + availability (Product) or a store panel with hours and
 * a map pin (BikeStore) — the difference that wins local and shopping searches.
 */
import type { DayHours, OpeningHours, SocialLinks, StoreProfile } from '@/lib/types/store';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl } from '@/lib/seo/site';

type Json = Record<string, unknown>;

/** Minimal product shape we read — kept loose so it accepts the wide product-page row. */
export interface ProductLike {
  id: string;
  display_name?: string | null;
  description?: string | null;
  product_description?: string | null;
  price?: string | number | null;
  sale_price?: string | number | null;
  discount_active?: boolean | null;
  discount_ends_at?: string | null;
  brand?: string | null;
  manufacturer_name?: string | null;
  model?: string | null;
  model_year?: number | string | null;
  marketplace_category?: string | null;
  condition_rating?: string | null;
  qoh?: number | string | null;
  sold_at?: string | null;
  listing_status?: string | null;
  store_name?: string | null;
  primary_image_url?: string | null;
  all_images?: string[] | null;
}

const AU_STATE = /\b(VIC|NSW|QLD|WA|SA|TAS|ACT|NT)\b/i;
const DAY_NAME: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

function dedupe(arr: Array<string | null | undefined>): string[] {
  return Array.from(new Set(arr.filter((v): v is string => !!v)));
}

function toPrice(v: string | number | null | undefined): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
}

/** Best-effort suburb/locality from a free-text AU address — used in titles and JSON-LD. */
export function extractLocality(address?: string | null): string | null {
  if (!address) return null;
  // Drop a trailing postcode so it isn't mistaken for the suburb.
  const s = address.replace(/\s*\b\d{4}\b\s*$/, '').trim();
  if (!s) return null;
  // With a state token, the suburb is the text immediately before it
  // ("277 High Street, Ashburton VIC" → "Ashburton").
  const m = s.match(AU_STATE);
  if (m && m.index != null) {
    const before = s.slice(0, m.index).replace(/[,\s]+$/, '').trim();
    const seg = before.split(',').pop()?.trim();
    if (seg) return seg;
  }
  // No state token: the suburb is the LAST comma-separated segment
  // ("277 High Street, Ashburton" → "Ashburton"). A single segment with no
  // comma ("277 High Street") has no reliable locality, so we omit it.
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1];
  return null;
}

/** Parse a free-text AU address into a schema.org PostalAddress. */
export function parseAddress(address?: string | null): Json | null {
  const raw = address?.trim();
  if (!raw) return null;
  const out: Json = { '@type': 'PostalAddress', addressCountry: 'AU' };
  const state = raw.match(AU_STATE);
  const postcode = raw.match(/\b(\d{4})\b/);
  const locality = extractLocality(raw);
  if (state) out.addressRegion = state[1].toUpperCase();
  if (postcode) out.postalCode = postcode[1];
  if (locality) out.addressLocality = locality;
  if (locality && raw.includes(locality)) {
    const street = raw.slice(0, raw.indexOf(locality)).replace(/,\s*$/, '').trim();
    out.streetAddress = street || raw;
  } else {
    out.streetAddress = raw;
  }
  return out;
}

export function openingHoursSpecification(hours?: OpeningHours | null): Json[] | undefined {
  if (!hours) return undefined;
  const spec: Json[] = [];
  for (const key of Object.keys(DAY_NAME)) {
    const d = (hours as unknown as Record<string, DayHours | undefined>)[key];
    if (d && !d.closed && d.open && d.close) {
      spec.push({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${DAY_NAME[key]}`,
        opens: d.open,
        closes: d.close,
      });
    }
  }
  return spec.length ? spec : undefined;
}

function socialSameAs(links?: SocialLinks | null): string[] {
  if (!links) return [];
  return [links.instagram, links.facebook, links.strava, links.twitter, links.website].filter(
    (v): v is string => !!v && /^https?:\/\//i.test(v),
  );
}

function productAvailability(p: ProductLike): string {
  const sold = !!p.sold_at || p.listing_status === 'sold';
  if (sold) return 'https://schema.org/SoldOut';
  const qoh = typeof p.qoh === 'number' ? p.qoh : Number(p.qoh ?? 0);
  return qoh > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
}

function productCondition(p: ProductLike): string {
  const r = (p.condition_rating ?? '').toString().trim().toLowerCase();
  if (!r || r === 'new' || r === 'brand new') return 'https://schema.org/NewCondition';
  return 'https://schema.org/UsedCondition';
}

export function organizationSchema(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl('/yjlogo.png'),
    description: SITE_DESCRIPTION,
    // Link the website entity to the Yellow Jersey Google Business Profile so
    // Google associates the two (strengthens the brand/knowledge-graph link).
    sameAs: ['https://share.google/rfp7zGekhvfjkC6hE'],
  };
}

export function websiteSchema(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    publisher: { '@id': `${SITE_URL}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/marketplace?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function bikeStoreSchema(store: StoreProfile, url: string): Json {
  const address = parseAddress(store.address);
  const sameAs = dedupe([store.website, ...socialSameAs(store.social_links)]);
  const image = store.cover_image_url || store.logo_url || undefined;
  const brands = (store.brands ?? []).map((b) => b.name).filter(Boolean);
  const hours = openingHoursSpecification(store.opening_hours);

  const schema: Json = {
    '@context': 'https://schema.org',
    '@type': 'BikeStore',
    '@id': `${url}#store`,
    name: store.store_name,
    url,
  };
  if (store.description) schema.description = store.description.slice(0, 500);
  if (store.logo_url) schema.logo = store.logo_url;
  if (image) schema.image = image;
  if (store.phone) schema.telephone = store.phone;
  if (address) schema.address = address;
  if (hours) schema.openingHoursSpecification = hours;
  if (sameAs.length) schema.sameAs = sameAs;
  if (brands.length) schema.brand = brands.map((name) => ({ '@type': 'Brand', name }));

  // Bike servicing is a core search intent ("bike service near me") — surface the
  // real workshop menu so Google understands this store repairs bikes, not just
  // sells them. Prices come straight from the store's live service list.
  const services = (store.services ?? []).filter((s) => s.is_active && s.name?.trim());
  if (services.length) {
    schema.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: 'Bike servicing & repairs',
      itemListElement: services.map((s) => {
        const offer: Json = {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: s.name,
            serviceType: 'Bicycle repair and maintenance',
            ...(s.includes?.length ? { description: s.includes.join(', ') } : {}),
          },
        };
        if (typeof s.price === 'number' && s.price > 0) {
          offer.priceCurrency = 'AUD';
          offer.price = s.price;
          // "from $X" tiers are minimums, not fixed quotes.
          if (s.price_from) {
            offer.priceSpecification = {
              '@type': 'PriceSpecification',
              minPrice: s.price,
              priceCurrency: 'AUD',
            };
          }
        }
        return offer;
      }),
    };
    const prices = services
      .map((s) => s.price)
      .filter((p): p is number => typeof p === 'number' && p > 0);
    if (prices.length) {
      schema.priceRange = `$${Math.min(...prices)}-$${Math.max(...prices)}`;
    }
  }
  return schema;
}

/**
 * Index policy: only products that are genuinely "live on the marketplace" should
 * be indexable — a real (http) photo AND a real title, and not sold. Everything
 * else (placeholder-only or untitled rows) renders a thin page, so we noindex it
 * until it earns an image. This mirrors exactly what the sitemap
 * (`public_marketplace_cards`, gated on `resolved_image_id IS NOT NULL`) already
 * includes, so page-level indexability and sitemap membership stay consistent.
 * It is self-healing: the page flips back to indexable the moment an approved
 * image lands, with no redeploy.
 */
export function isProductIndexable(p: ProductLike): boolean {
  const isHttp = (u?: string | null): u is string => !!u && /^https?:\/\//i.test(u);
  const hasImage = isHttp(p.primary_image_url) || (p.all_images?.some(isHttp) ?? false);
  const hasTitle = !!(p.display_name?.trim() || p.description?.trim());
  const sold = !!p.sold_at || p.listing_status === 'sold';
  return hasImage && hasTitle && !sold;
}

export function productSchema(p: ProductLike, url: string): Json {
  const name = p.display_name || p.description || 'Bicycle';
  const images = dedupe(p.all_images && p.all_images.length ? p.all_images : [p.primary_image_url]).filter(
    (img) => /^https?:\/\//i.test(img),
  );
  const brandName = p.brand || p.manufacturer_name || null;
  const price = toPrice(p.discount_active && p.sale_price != null ? p.sale_price : p.price);

  const offer: Json = {
    '@type': 'Offer',
    url,
    priceCurrency: 'AUD',
    availability: productAvailability(p),
    itemCondition: productCondition(p),
  };
  if (price != null) offer.price = price;
  if (p.discount_active && p.discount_ends_at) offer.priceValidUntil = p.discount_ends_at;
  if (p.store_name) offer.seller = { '@type': 'Organization', name: p.store_name };

  const schema: Json = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name,
    url,
    offers: offer,
  };
  schema.sku = p.id;
  if (images.length) schema.image = images;
  const desc = p.product_description || p.description;
  if (desc) schema.description = desc.slice(0, 500);
  if (brandName) schema.brand = { '@type': 'Brand', name: brandName };
  if (p.model) schema.model = p.model;
  if (p.marketplace_category) schema.category = p.marketplace_category;
  return schema;
}

export function breadcrumbSchema(items: Array<{ name: string; url: string }>): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

export function articleSchema(args: {
  title: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified?: string;
  image?: string;
}): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: args.title,
    description: args.description,
    url: args.url,
    datePublished: args.datePublished,
    dateModified: args.dateModified ?? args.datePublished,
    author: { '@type': 'Organization', name: 'Yellow Jersey' },
    publisher: {
      '@type': 'Organization',
      name: 'Yellow Jersey',
      logo: {
        '@type': 'ImageObject',
        url: absoluteUrl('/yjlogo.svg'),
      },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': args.url },
    isPartOf: { '@type': 'Blog', name: 'Yellow Jersey Blog', url: absoluteUrl('/blog') },
    ...(args.image ? { image: args.image } : {}),
  };
}

/** ItemList for collection/landing pages (category, suburb, brand, directory). */
export function itemListSchema(items: Array<{ url: string; name: string }>): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: it.url,
      name: it.name,
    })),
  };
}

export function faqSchema(items: Array<{ q: string; a: string }>): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}
