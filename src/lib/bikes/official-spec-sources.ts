import {
  brandWebsiteDomain,
  isOfficialBrandUrl,
  resolveBrandWebsite,
} from "@/lib/bikes/brand-websites";

const COMPONENT_BRAND_WEBSITES: Record<string, string> = {
  shimano: "https://bike.shimano.com",
  sram: "https://www.sram.com",
  campagnolo: "https://www.campagnolo.com",
  fulcrum: "https://www.fulcrumwheels.com",
  mavic: "https://www.mavic.com",
  "dt swiss": "https://www.dt-swiss.com",
  zipp: "https://www.sram.com",
  continental: "https://www.continental-tires.com",
  maxxis: "https://www.maxxis.com",
  schwalbe: "https://www.schwalbe.com",
  brooks: "https://www.brooksengland.com",
  fizik: "https://www.fizik.com",
  "selle italia": "https://www.selleitalia.com",
  bontrager: "https://www.trekbikes.com",
  roval: "https://www.specialized.com",
  hunt: "https://www.huntbikerwheels.com",
  "chris king": "https://chrisking.com",
  enve: "https://enve.com",
  reynolds: "https://reynoldsusa.com",
  vittoria: "https://vittoria.com",
  panaracer: "https://panaracerusa.com",
  fox: "https://www.ridefox.com",
  rockshox: "https://www.sram.com",
  magura: "https://www.magura.com",
  hope: "https://hope-tech.com",
};

const OFFICIAL_CDN_FRAGMENTS = [
  "shimano.com",
  "sram.com",
  "specialized.com",
  "trekbikes.com",
  "giant-bicycles.com",
  "cannondale.com",
  "scott-sports.com",
  "santacruzbicycles.com",
  "cervelo.com",
  "canyon.com",
  "campagnolo.com",
];

const BLOCKED_RETAILER_FRAGMENTS = [
  "amazon.",
  "ebay.",
  "wiggle.",
  "pushys.",
  "rei.com",
  "evanscycles",
  "chainreaction",
  "probikeshop",
  "jensonusa",
  "competitivecyclist",
  "decathlon.",
  "backcountry",
  "bikeexchange",
  "facebook.",
  "instagram.",
  "pinterest.",
  "reddit.",
  "youtube.",
  "google.",
  "bing.",
];

function normaliseSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function urlDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function isBlockedRetailerUrl(url: string): boolean {
  const domain = urlDomain(url);
  if (!domain) return true;
  return BLOCKED_RETAILER_FRAGMENTS.some((fragment) => domain.includes(fragment));
}

function detectComponentBrands(specValue: string): string[] {
  const haystack = normaliseSearchText(specValue);
  const matches: string[] = [];

  for (const key of Object.keys(COMPONENT_BRAND_WEBSITES)) {
    if (haystack.includes(key)) {
      matches.push(key);
    }
  }

  return matches;
}

function domainsMatchOfficial(candidateDomain: string, officialDomain: string): boolean {
  return (
    candidateDomain === officialDomain ||
    candidateDomain.endsWith(`.${officialDomain}`) ||
    officialDomain.endsWith(`.${candidateDomain}`)
  );
}

export function isOfficialSpecSourceUrl(
  url: string,
  options: { bikeBrand?: string | null; specValue?: string }
): boolean {
  if (!url || isBlockedRetailerUrl(url)) return false;

  if (isOfficialBrandUrl(url, options.bikeBrand ?? undefined)) {
    return true;
  }

  for (const componentKey of detectComponentBrands(options.specValue ?? "")) {
    const official = COMPONENT_BRAND_WEBSITES[componentKey];
    if (official && isOfficialBrandUrl(url, componentKey)) {
      return true;
    }
    const officialDomain = brandWebsiteDomain(official);
    const candidateDomain = urlDomain(url);
    if (
      officialDomain &&
      candidateDomain &&
      domainsMatchOfficial(candidateDomain, officialDomain)
    ) {
      return true;
    }
  }

  const candidateDomain = urlDomain(url);
  if (
    candidateDomain &&
    OFFICIAL_CDN_FRAGMENTS.some((fragment) => candidateDomain.includes(fragment))
  ) {
    return true;
  }

  return false;
}

export function isOfficialSpecImageUrl(
  imageUrl: string,
  sourceUrl: string,
  options: { bikeBrand?: string | null; specValue?: string }
): boolean {
  if (!imageUrl.startsWith("https://")) return false;
  if (isBlockedRetailerUrl(imageUrl) || isBlockedRetailerUrl(sourceUrl)) return false;
  if (!isOfficialSpecSourceUrl(sourceUrl, options)) return false;

  return isOfficialSpecSourceUrl(imageUrl, options);
}

export function getOfficialSearchDomains(options: {
  bikeBrand?: string | null;
  specValue?: string;
}): string[] {
  const domains = new Set<string>();

  const bikeWebsite = resolveBrandWebsite(options.bikeBrand ?? undefined);
  const bikeDomain = bikeWebsite ? brandWebsiteDomain(bikeWebsite) : null;
  if (bikeDomain) domains.add(bikeDomain);

  for (const componentKey of detectComponentBrands(options.specValue ?? "")) {
    const website = COMPONENT_BRAND_WEBSITES[componentKey];
    const domain = website ? brandWebsiteDomain(website) : null;
    if (domain) domains.add(domain);
  }

  return Array.from(domains);
}

export async function fetchOfficialOgImage(pageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(pageUrl, {
      headers: {
        "User-Agent": "YellowJersey/1.0 (+https://yellowjersey.com.au)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });

    if (!response.ok) return null;

    const html = await response.text();
    const patterns = [
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      const candidate = match?.[1]?.trim();
      if (candidate?.startsWith("https://")) {
        return candidate;
      }
    }

    return null;
  } catch {
    return null;
  }
}
