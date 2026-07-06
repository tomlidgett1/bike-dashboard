export interface BrandLogoSearchResult {
  url: string;
  thumbnailUrl: string | null;
  title: string | null;
  domain: string | null;
  sourceUrl: string | null;
}

interface SerperImageHit {
  title?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  link?: string;
  domain?: string;
}

const MAX_RESULTS = 20;
const SERPER_NUM = 24;

function isBlockedDomain(url: string): boolean {
  try {
    const domain = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    const blocked = [
      'facebook.',
      'instagram.',
      'pinterest.',
      'reddit.',
      'youtube.',
      'tiktok.',
      'twitter.',
      'x.com',
      'google.',
      'bing.',
    ];
    return blocked.some((fragment) => domain.includes(fragment));
  } catch {
    return true;
  }
}

function isUsableLogoHit(hit: SerperImageHit): boolean {
  const url = hit.imageUrl?.trim();
  if (!url?.startsWith('https://')) return false;
  if (isBlockedDomain(url)) return false;
  if (hit.link && isBlockedDomain(hit.link)) return false;
  return true;
}

function mapHit(hit: SerperImageHit): BrandLogoSearchResult | null {
  if (!isUsableLogoHit(hit)) return null;
  const url = hit.imageUrl!.trim();
  const thumbnail =
    typeof hit.thumbnailUrl === 'string' && hit.thumbnailUrl.startsWith('https://')
      ? hit.thumbnailUrl
      : null;
  return {
    url,
    thumbnailUrl: thumbnail,
    title: hit.title?.trim() || null,
    domain: hit.domain?.trim() || null,
    sourceUrl:
      typeof hit.link === 'string' && hit.link.startsWith('https://') ? hit.link : null,
  };
}

async function searchSerperDirect(
  query: string,
  apiKey: string,
  page = 1,
): Promise<SerperImageHit[]> {
  const response = await fetch('https://google.serper.dev/images', {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      num: SERPER_NUM,
      page,
      gl: 'au',
    }),
  });

  if (!response.ok) return [];

  const data = (await response.json()) as { images?: SerperImageHit[] };
  return data.images ?? [];
}

async function searchSerperViaEdge(
  query: string,
  accessToken?: string | null,
): Promise<SerperImageHit[]> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const token =
    accessToken?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !token) return [];

  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/search-product-images`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ searchQuery: query }),
    },
  );

  if (!response.ok) return [];

  const data = (await response.json()) as {
    success?: boolean;
    results?: Array<{ url?: string; thumbnailUrl?: string; title?: string; domain?: string }>;
  };

  if (!data.success || !Array.isArray(data.results)) return [];

  return data.results.map((result) => ({
    imageUrl: result.url,
    thumbnailUrl: result.thumbnailUrl,
    title: result.title,
    link: result.url,
    domain: result.domain,
  }));
}

async function runSerperQuery(
  query: string,
  accessToken?: string | null,
  page = 1,
): Promise<SerperImageHit[]> {
  // Match product optimise image lookup: use the Supabase edge function first
  // so we always hit the SERPER_API_KEY configured in Supabase secrets, not a
  // stale local/Vercel SERPER_API_KEY that may still be set in Next.js env.
  if (page <= 1) {
    const viaEdge = await searchSerperViaEdge(query, accessToken);
    if (viaEdge.length > 0) return viaEdge;
  }

  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) return [];
  return searchSerperDirect(query, apiKey, page);
}

export function buildBrandLogoSearchQuery(options: {
  query?: string | null;
  brandName?: string | null;
}): string {
  const custom = options.query?.trim();
  if (custom) return custom;
  const name = options.brandName?.trim();
  if (name) return `${name} logo`;
  return '';
}

export function buildCarouselLogoSearchQuery(options: {
  query?: string | null;
  carouselName?: string | null;
}): string {
  return buildBrandLogoSearchQuery({
    query: options.query,
    brandName: options.carouselName,
  });
}

export async function searchBrandLogoImages(options: {
  query?: string | null;
  brandName?: string | null;
  accessToken?: string | null;
  page?: number;
  excludeUrls?: string[];
}): Promise<{ query: string; results: BrandLogoSearchResult[] }> {
  const query = buildBrandLogoSearchQuery(options);
  if (!query) {
    return { query: '', results: [] };
  }

  const page = Math.max(1, options.page ?? 1);
  const exclude = new Set((options.excludeUrls ?? []).map((url) => url.trim()).filter(Boolean));
  const hits = await runSerperQuery(query, options.accessToken, page);
  const seen = new Set<string>();
  const results: BrandLogoSearchResult[] = [];

  for (const hit of hits) {
    const mapped = mapHit(hit);
    if (!mapped || seen.has(mapped.url) || exclude.has(mapped.url)) continue;
    seen.add(mapped.url);
    results.push(mapped);
    if (results.length >= MAX_RESULTS) break;
  }

  return { query, results };
}
