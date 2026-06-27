// Brand classification for the page factory. The catalog's marketplace_category
// is mostly null, so we can't infer "is this a bike brand" from it reliably.
// A curated allowlist of real bicycle manufacturers (plus a live "Bicycles"
// category signal, checked by the caller) decides whether a brand page may say
// "Bikes". Everything else gets neutral wording ("{Brand} in Melbourne").

const BIKE_BRANDS = new Set([
  '3t', 'apollo', 'argon 18', 'avanti', 'basso', 'bianchi', 'bmc', 'bombtrack', 'brompton',
  'canyon', 'cannondale', 'cervelo', 'cervélo', 'cinelli', 'colnago', 'cube', 'de rosa', 'devinci',
  'diamondback', 'eddy merckx', 'electra', 'factor', 'felt', 'focus', 'fuji', 'ghost', 'giant',
  'gocycle', 'gt', 'haibike', 'kona', 'ktm', 'lapierre', 'liv', 'look', 'malvern star', 'marin',
  'merida', 'mondraker', 'mongoose', 'norco', 'orbea', 'pinarello', 'pivot', 'polygon', 'propel',
  'raleigh', 'reid', 'ribble', 'ridley', 'rocky mountain', 'salsa', 'santa cruz', 'schwinn', 'scott',
  'specialized', 'surly', 'tern', 'trek', 'vanmoof', 'vitus', 'whyte', 'wilier', 'yeti', 'yt',
]);

// Mis-tagged / meaningless "brands" — no page should be built for these.
const JUNK_BRANDS = new Set([
  'generic', 'unknown', 'n/a', 'na', 'none', 'misc', 'miscellaneous', 'other', 'assorted',
  'no brand', 'nobrand', 'mercedes-benz', 'mercedes benz', '-', '',
]);

const norm = (b: string) => b.trim().toLowerCase();

/** A brand we'll happily call "Bikes". Pass hasBicyclesListing=true when the
 *  brand actually has a product in the "Bicycles" category (catches bike brands
 *  not in the allowlist). */
export function isBikeBrand(brand: string, hasBicyclesListing = false): boolean {
  return hasBicyclesListing || BIKE_BRANDS.has(norm(brand));
}

/** Junk/placeholder brand — skip building a page entirely. */
export function isJunkBrand(brand: string): boolean {
  return JUNK_BRANDS.has(norm(brand));
}
