import {
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_SUBCATEGORIES,
  type MarketplaceCategory,
} from "@/lib/types/marketplace";

export interface SupplierCategoryAssignment {
  category: MarketplaceCategory;
  subcategory: string;
}

/** Per-product category overrides keyed by scraped productId. */
export type SupplierCategoryOverrides = Record<string, SupplierCategoryAssignment>;

export interface ResolvedMarketplaceCategory extends SupplierCategoryAssignment {
  /** True when the raw supplier text mapped directly onto the YJ vocabulary. */
  confident: boolean;
}

const CATEGORY_ALIASES: Record<string, MarketplaceCategory> = {
  bicycle: "Bicycles",
  bicycles: "Bicycles",
  bike: "Bicycles",
  bikes: "Bicycles",
  ebike: "Bicycles",
  ebikes: "Bicycles",
  part: "Parts",
  parts: "Parts",
  component: "Parts",
  components: "Parts",
  spares: "Parts",
  accessories: "Parts",
  apparel: "Apparel",
  clothing: "Apparel",
  clothes: "Apparel",
  wear: "Apparel",
  nutrition: "Nutrition",
  food: "Nutrition",
};

const SUBCATEGORY_ALIASES: Record<string, [MarketplaceCategory, string]> = {
  helmet: ["Apparel", "Helmets"],
  helmets: ["Apparel", "Helmets"],
  jersey: ["Apparel", "Jerseys"],
  jerseys: ["Apparel", "Jerseys"],
  shorts: ["Apparel", "Shorts"],
  bibs: ["Apparel", "Shorts"],
  jacket: ["Apparel", "Jackets"],
  jackets: ["Apparel", "Jackets"],
  glove: ["Apparel", "Gloves"],
  gloves: ["Apparel", "Gloves"],
  shoe: ["Apparel", "Shoes"],
  shoes: ["Apparel", "Shoes"],
  footwear: ["Apparel", "Shoes"],
  frame: ["Parts", "Frames"],
  frames: ["Parts", "Frames"],
  framesets: ["Parts", "Frames"],
  wheel: ["Parts", "Wheels"],
  wheels: ["Parts", "Wheels"],
  wheelsets: ["Parts", "Wheels"],
  drivetrain: ["Parts", "Drivetrain"],
  groupsets: ["Parts", "Drivetrain"],
  brakes: ["Parts", "Brakes"],
  braking: ["Parts", "Brakes"],
  handlebar: ["Parts", "Handlebars"],
  handlebars: ["Parts", "Handlebars"],
  cockpit: ["Parts", "Handlebars"],
  saddle: ["Parts", "Saddles"],
  saddles: ["Parts", "Saddles"],
  pedal: ["Parts", "Pedals"],
  pedals: ["Parts", "Pedals"],
  road: ["Bicycles", "Road"],
  mountain: ["Bicycles", "Mountain"],
  mtb: ["Bicycles", "Mountain"],
  gravel: ["Bicycles", "Road"],
  hybrid: ["Bicycles", "Hybrid"],
  electric: ["Bicycles", "Electric"],
  kids: ["Bicycles", "Kids"],
  bmx: ["Bicycles", "BMX"],
  cruiser: ["Bicycles", "Cruiser"],
  gels: ["Nutrition", "Gels"],
  bars: ["Nutrition", "Energy Bars"],
  drinks: ["Nutrition", "Drinks"],
  hydration: ["Nutrition", "Drinks"],
  supplements: ["Nutrition", "Supplements"],
};

const KEYWORD_RULES: Array<{
  pattern: RegExp;
  category: MarketplaceCategory;
  subcategory: string;
}> = [
  { pattern: /\bhelmet/, category: "Apparel", subcategory: "Helmets" },
  { pattern: /\bjersey/, category: "Apparel", subcategory: "Jerseys" },
  { pattern: /\b(bib|short|knick)/, category: "Apparel", subcategory: "Shorts" },
  { pattern: /\b(jacket|vest|gilet)/, category: "Apparel", subcategory: "Jackets" },
  { pattern: /\b(glove|mitt)/, category: "Apparel", subcategory: "Gloves" },
  { pattern: /\b(shoe|cleat|sock)/, category: "Apparel", subcategory: "Shoes" },
  { pattern: /\b(e-?bike|electric bike)/, category: "Bicycles", subcategory: "Electric" },
  { pattern: /\b(mountain bike|mtb)\b/, category: "Bicycles", subcategory: "Mountain" },
  { pattern: /\broad bike/, category: "Bicycles", subcategory: "Road" },
  { pattern: /\bkids? bike/, category: "Bicycles", subcategory: "Kids" },
  { pattern: /\bbmx\b/, category: "Bicycles", subcategory: "BMX" },
  { pattern: /\b(bike|bicycle|frameset|frame set)\b/, category: "Bicycles", subcategory: "Other" },
  { pattern: /\b(wheelset|wheel|rim)\b/, category: "Parts", subcategory: "Wheels" },
  {
    pattern: /\b(chain|cassette|derailleur|crank|chainring|groupset|shifter|drivetrain)/,
    category: "Parts",
    subcategory: "Drivetrain",
  },
  { pattern: /\b(brake|rotor|calliper|caliper)/, category: "Parts", subcategory: "Brakes" },
  { pattern: /\b(handlebar|stem|grip|bar tape)/, category: "Parts", subcategory: "Handlebars" },
  { pattern: /\b(saddle|seatpost|seat post)/, category: "Parts", subcategory: "Saddles" },
  { pattern: /\bpedal/, category: "Parts", subcategory: "Pedals" },
  { pattern: /\bframe\b/, category: "Parts", subcategory: "Frames" },
  { pattern: /\b(gel)\b/, category: "Nutrition", subcategory: "Gels" },
  { pattern: /\b(energy bar|nutrition bar)\b/, category: "Nutrition", subcategory: "Energy Bars" },
  {
    pattern: /\b(electrolyte|hydration|energy drink)\b/,
    category: "Nutrition",
    subcategory: "Drinks",
  },
];

function normalise(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function matchSubcategory(
  category: MarketplaceCategory,
  raw: string | null | undefined,
): string | null {
  const normalised = normalise(raw);
  if (!normalised) return null;
  for (const subcategory of MARKETPLACE_SUBCATEGORIES[category]) {
    const sub = subcategory.toLowerCase();
    if (normalised === sub || normalised.includes(sub) || sub.includes(normalised)) {
      return subcategory;
    }
  }
  const alias = SUBCATEGORY_ALIASES[normalised];
  if (alias && alias[0] === category) return alias[1];
  return null;
}

function matchVocabulary(raw: string | null | undefined): SupplierCategoryAssignment | null {
  const normalised = normalise(raw);
  if (!normalised) return null;

  for (const category of MARKETPLACE_CATEGORIES) {
    if (normalised === category.toLowerCase()) return { category, subcategory: "Other" };
  }
  const words = normalised.split(" ");
  for (const word of words) {
    const aliasCategory = CATEGORY_ALIASES[word];
    if (aliasCategory) return { category: aliasCategory, subcategory: "Other" };
  }
  for (const word of words) {
    const aliasSub = SUBCATEGORY_ALIASES[word];
    if (aliasSub) return { category: aliasSub[0], subcategory: aliasSub[1] };
  }
  return null;
}

/**
 * Map free-text supplier category data onto Yellow Jersey's fixed marketplace
 * vocabulary. Product pages, storefront filters, and the marketplace all key
 * off marketplace_category/subcategory, so anything outside the vocabulary is
 * invisible in category browsing.
 */
export function resolveMarketplaceCategory(input: {
  rawCategory?: string | null;
  rawSubcategory?: string | null;
  name?: string | null;
  description?: string | null;
}): ResolvedMarketplaceCategory {
  const fromCategory = matchVocabulary(input.rawCategory);
  const fromSubcategory = matchVocabulary(input.rawSubcategory);
  const direct = fromCategory ?? fromSubcategory;

  if (direct) {
    const refinedSub =
      matchSubcategory(direct.category, input.rawSubcategory) ??
      matchSubcategory(direct.category, input.rawCategory) ??
      direct.subcategory;
    return { category: direct.category, subcategory: refinedSub, confident: true };
  }

  const haystack = normalise(
    [input.rawCategory, input.rawSubcategory, input.name, input.description]
      .filter(Boolean)
      .join(" "),
  );
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(haystack)) {
      return { category: rule.category, subcategory: rule.subcategory, confident: false };
    }
  }
  return { category: "Parts", subcategory: "Other", confident: false };
}

export function isValidAssignment(value: unknown): value is SupplierCategoryAssignment {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.category !== "string" || typeof candidate.subcategory !== "string") {
    return false;
  }
  const category = candidate.category as MarketplaceCategory;
  return (
    MARKETPLACE_CATEGORIES.includes(category) &&
    MARKETPLACE_SUBCATEGORIES[category].includes(candidate.subcategory)
  );
}

export function sanitiseCategoryOverrides(value: unknown): SupplierCategoryOverrides {
  if (!value || typeof value !== "object") return {};
  const overrides: SupplierCategoryOverrides = {};
  for (const [productId, assignment] of Object.entries(value as Record<string, unknown>)) {
    if (isValidAssignment(assignment)) {
      overrides[productId] = {
        category: assignment.category,
        subcategory: assignment.subcategory,
      };
    }
  }
  return overrides;
}
