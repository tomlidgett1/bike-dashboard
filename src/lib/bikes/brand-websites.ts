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
  // Accessories & component brands
  giro: "https://www.giro.com",
  "bell helmets": "https://www.bellhelmets.com",
  poc: "https://www.poc.com",
  "sweet protection": "https://www.sweetprotection.com",
  kask: "https://www.kask.com",
  "met helmets": "https://www.met-helmets.com",
  lazer: "https://www.lazersport.com",
  rapha: "https://www.rapha.cc",
  castelli: "https://www.castelli-cycling.com",
  maap: "https://maap.cc",
  "pearl izumi": "https://www.pearlizumi.com",
  garmin: "https://www.garmin.com",
  wahoo: "https://www.wahoofitness.com",
  hammerhead: "https://www.hammerhead.io",
  quarq: "https://www.sram.com",
  favero: "https://www.favero.com",
  crankbrothers: "https://crankbrothers.com",
  "crank brothers": "https://crankbrothers.com",
  fizik: "https://www.fizik.com",
  "selle italia": "https://www.selleitalia.com",
  "brooks england": "https://www.brooksengland.com",
  vittoria: "https://www.vittoria.com",
  schwalbe: "https://www.schwalbe.com",
  maxxis: "https://www.maxxis.com",
  panaracer: "https://www.panaracer.com",
  zipp: "https://www.zipp.com",
  enve: "https://www.enve.com",
  roval: "https://www.rovalcomponents.com",
  "dt swiss": "https://www.dtswiss.com",
  dtswiss: "https://www.dtswiss.com",
  "hunt bike wheels": "https://www.huntbikewheels.com",
  lezyne: "https://www.lezyne.com",
  knog: "https://www.knog.com",
  cateye: "https://www.cateye.com",
  topeak: "https://www.topeak.com",
  "park tool": "https://www.parktool.com",
  abus: "https://www.abus.com",
  kryptonite: "https://www.kryptonitelock.com",
  hiplok: "https://hiplok.com",
  sidi: "https://www.sidisport.com",
  "lake cycling": "https://www.lakecycling.com",
  oakley: "https://www.oakley.com",
  "smith optics": "https://www.smithoptics.com",
  camelbak: "https://www.camelbak.com",
  fidlock: "https://www.fidlock.com",
  silca: "https://silca.cc",
  "muc-off": "https://muc-off.com",
  mucoff: "https://muc-off.com",
  "finish line": "https://www.finishlineusa.com",
  rockshox: "https://www.sram.com",
  "fox racing shox": "https://www.ridefox.com",
  magura: "https://magura.com",
  "hope technology": "https://www.hopetech.com",
  renthal: "https://www.renthal.com",
  raceface: "https://www.raceface.com",
  "race face": "https://www.raceface.com",
  "chris king": "https://www.chrisking.com",
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
