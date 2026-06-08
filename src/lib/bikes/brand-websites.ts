const BRAND_WEBSITE_BY_KEY: Record<string, string> = {
  specialized: "https://www.specialized.com",
  trek: "https://www.trekbikes.com",
  giant: "https://www.giant-bicycles.com",
  cannondale: "https://www.cannondale.com",
  scott: "https://www.scott-sports.com",
  "santa cruz": "https://www.santacruzbicycles.com",
  cervelo: "https://www.cervelo.com",
  pinarello: "https://www.pinarello.com",
  bmc: "https://www.bmc-switzerland.com",
  canyon: "https://www.canyon.com",
  focus: "https://www.focus-bikes.com",
  merida: "https://www.merida-bikes.com",
  bianchi: "https://www.bianchi.com",
  colnago: "https://www.colnago.com",
  ridley: "https://www.ridley-bikes.com",
  wilier: "https://www.wilier.com",
  look: "https://www.lookcycle.com",
  pivot: "https://www.pivotcycles.com",
  yeti: "https://yeticycles.com",
  orbea: "https://www.orbea.com",
  cube: "https://www.cube.eu",
  felt: "https://www.feltbicycles.com",
  fuji: "https://www.fujibikes.com",
  gt: "https://gtbicycles.com",
  kona: "https://konaworld.com",
  norco: "https://www.norco.com",
  polygon: "https://www.polygonbikes.com",
  marin: "https://www.marinbikes.com",
  salsa: "https://salsacycles.com",
  surly: "https://surlybikes.com",
  ribble: "https://www.ribblecycles.co.uk",
  rose: "https://www.rosebikes.com",
  lynskey: "https://www.lynskeyperformance.com",
  moots: "https://moots.com",
  shimano: "https://bike.shimano.com",
  sram: "https://www.sram.com",
};

function normaliseBrandKey(brand: string): string {
  return brand
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveBrandWebsite(brand: string | null | undefined): string | null {
  if (!brand) return null;

  const key = normaliseBrandKey(brand);
  if (BRAND_WEBSITE_BY_KEY[key]) return BRAND_WEBSITE_BY_KEY[key];

  for (const [brandKey, url] of Object.entries(BRAND_WEBSITE_BY_KEY)) {
    if (key.includes(brandKey) || brandKey.includes(key)) {
      return url;
    }
  }

  return null;
}

export function brandWebsiteDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isOfficialBrandUrl(url: string, brand: string | null | undefined): boolean {
  const official = resolveBrandWebsite(brand);
  if (!official) return false;

  const officialDomain = brandWebsiteDomain(official);
  const urlDomain = brandWebsiteDomain(url);
  if (!officialDomain || !urlDomain) return false;

  return urlDomain === officialDomain || urlDomain.endsWith(`.${officialDomain}`);
}
