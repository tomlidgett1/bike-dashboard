// Server-side loaders for the agent's published landing pages. Reads the
// public-readable `seo_pages` rows (RLS exposes status='published' only) and the
// live inventory that backs each page. Used by the /bikes, /bike-shops,
// /bike-service, /brands and /stores routes.
import { cache } from 'react';
import type { Metadata } from 'next';
import {
  createPublicSupabaseClient,
  PUBLIC_MARKETPLACE_CARD_FIELDS,
  transformPublicMarketplaceCard,
  type PublicMarketplaceCardRow,
} from '@/lib/marketplace/public-card-feed';
import { absoluteUrl } from '@/lib/seo/site';
import type { MarketplaceProduct } from '@/lib/types/marketplace';

export interface AgentPageContent {
  intro?: string;
  blocks?: Array<{ heading: string; body: string }>;
  faqs?: Array<{ q: string; a: string }>;
  internal_links?: Array<{ url: string; anchor: string }>;
  schema?: string[];
  generated_by?: string;
}

export interface AgentPage {
  url: string;
  page_type: 'marketplace_category' | 'suburb_category' | 'store_directory' | 'owned_store' | 'guide' | 'brand_city';
  title: string | null;
  meta_description: string | null;
  h1: string | null;
  indexability: 'index' | 'noindex';
  canonical_url: string | null;
  supply_count: number;
  params: Record<string, string>;
  content: AgentPageContent;
}

/** Load a published agent page by its exact site-relative URL. Returns null if
 *  it isn't published (so the route 404s rather than serving a thin draft).
 *  Cached per-request so generateMetadata and the page body share one fetch. */
export const loadAgentPage = cache(async (url: string): Promise<AgentPage | null> => {
  try {
    const supabase = createPublicSupabaseClient();
    const { data, error } = await supabase
      .from('seo_pages')
      .select('url, page_type, title, meta_description, h1, indexability, canonical_url, supply_count, params, content')
      .eq('url', url)
      .eq('status', 'published')
      .maybeSingle();
    if (error || !data) return null;
    return data as AgentPage;
  } catch {
    return null;
  }
});

/** Shared Next metadata for an agent route: canonical + indexability that mirror
 *  the seo_pages row. A missing/unpublished page yields a noindex "not found". */
export async function agentRouteMetadata(url: string): Promise<Metadata> {
  const page = await loadAgentPage(url);
  if (!page) return { title: 'Page not found', robots: { index: false, follow: true } };
  const canonical = page.canonical_url || absoluteUrl(page.url);
  return {
    title: page.title || page.h1 || undefined,
    description: page.meta_description || undefined,
    alternates: { canonical },
    // Mirror the row: indexable pages inherit the site default; others noindex.
    ...(page.indexability === 'index' ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      type: 'website',
      title: page.title || page.h1 || undefined,
      description: page.meta_description || undefined,
      url: canonical,
    },
  };
}

/** Live listings that back a category / brand / owned-store page (max 24).
 *  Store-directory pages don't have a product grid. */
export async function loadListingsForPage(page: AgentPage): Promise<MarketplaceProduct[]> {
  if (page.page_type === 'store_directory') return [];
  try {
    const supabase = createPublicSupabaseClient();
    let q = supabase.from('public_marketplace_cards').select(PUBLIC_MARKETPLACE_CARD_FIELDS);

    if (page.page_type === 'brand_city' && page.params.brand) {
      q = q.ilike('brand', page.params.brand);
    } else if (page.page_type === 'owned_store' && page.params.user_id) {
      q = q.eq('user_id', page.params.user_id);
    } else if (page.params.category) {
      // City hubs filter by Lightspeed category_name; suburb pages by marketplace_category.
      q = q.eq(page.params.categoryField || 'marketplace_category', page.params.category);
      if (page.page_type === 'suburb_category' && page.params.place) {
        q = q.ilike('pickup_location', `%${page.params.place.replace(/-/g, ' ')}%`);
      }
    }

    const { data, error } = await q.order('created_at', { ascending: false }).limit(24);
    if (error || !data) return [];
    return (data as PublicMarketplaceCardRow[]).map(transformPublicMarketplaceCard);
  } catch {
    return [];
  }
}

export interface PageLink {
  url: string;
  title: string | null;
  h1: string | null;
  page_type: AgentPage['page_type'];
  params: Record<string, string>;
  supply_count: number;
}

/** All published + indexable pages of the given types, newest-supply first — for
 *  the hub/index pages and the site-wide internal-link footer that get these
 *  pages discovered + weighted by Google (not just sitemap-listed). */
export async function listPublishedPages(types: AgentPage['page_type'][], limit = 300): Promise<PageLink[]> {
  try {
    const supabase = createPublicSupabaseClient();
    const { data, error } = await supabase
      .from('seo_pages')
      .select('url, title, h1, page_type, params, supply_count')
      .eq('status', 'published')
      .eq('indexability', 'index')
      .in('page_type', types)
      .order('supply_count', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as PageLink[];
  } catch {
    return [];
  }
}
