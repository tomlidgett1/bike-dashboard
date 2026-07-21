import {
  listCanonicalLevel1,
  listCanonicalLevel2,
  resolveCanonicalPath,
  type CanonicalCategoryPath,
} from "@/lib/marketplace/canonical-taxonomy";

export interface SupplierCategoryAssignment {
  category: string;
  subcategory: string;
}

/** Per-product category overrides keyed by scraped productId. */
export type SupplierCategoryOverrides = Record<string, SupplierCategoryAssignment>;

export interface ResolvedMarketplaceCategory extends SupplierCategoryAssignment {
  /** True when the raw supplier text mapped directly onto the YJ vocabulary. */
  confident: boolean;
  level3?: string | null;
}

const KEYWORD_RULES: Array<{ pattern: RegExp; path: CanonicalCategoryPath }> = [
  { pattern: /\bhelmet/i, path: { level1: "Accessories", level2: "Helmets", level3: null } },
  { pattern: /\bjersey/i, path: { level1: "Apparel", level2: "Jerseys", level3: null } },
  { pattern: /\b(bib|short)/i, path: { level1: "Apparel", level2: "Shorts & Bibs", level3: null } },
  { pattern: /\b(jacket|gilet|vest)/i, path: { level1: "Apparel", level2: "Jackets & Gilets", level3: null } },
  { pattern: /\bglove/i, path: { level1: "Apparel", level2: "Gloves", level3: null } },
  { pattern: /\b(shoe|cleat)/i, path: { level1: "Apparel", level2: "Shoes", level3: "Road" } },
  { pattern: /\b(frameset|frame)\b/i, path: { level1: "Frames & Framesets", level2: "Other Frames", level3: null } },
  { pattern: /\b(wheelset|wheel)/i, path: { level1: "Wheels & Tyres", level2: "Road Wheelsets", level3: null } },
  { pattern: /\b(tyre|tire)/i, path: { level1: "Wheels & Tyres", level2: "Tyres", level3: "Road" } },
  { pattern: /\b(cassette|derailleur|crank|chain|groupset)/i, path: { level1: "Drivetrain", level2: "Groupsets", level3: null } },
  { pattern: /\bbrake/i, path: { level1: "Brakes", level2: "Brake Pads", level3: null } },
  { pattern: /\b(handlebar|stem|headset|grip|bar tape)/i, path: { level1: "Cockpit", level2: "Handlebars", level3: "Road" } },
  { pattern: /\b(saddle|seatpost|dropper)/i, path: { level1: "Seat & Seatposts", level2: "Saddles", level3: null } },
  { pattern: /\bpedal/i, path: { level1: "Pedals", level2: "Clipless Pedals", level3: null } },
  { pattern: /\b(e-?bike|electric)/i, path: { level1: "E-Bikes", level2: "E-Hybrid", level3: null } },
  { pattern: /\b(gravel)/i, path: { level1: "Bicycles", level2: "Gravel", level3: null } },
  { pattern: /\b(mtb|mountain)/i, path: { level1: "Bicycles", level2: "Mountain", level3: null } },
  { pattern: /\broad\b/i, path: { level1: "Bicycles", level2: "Road", level3: null } },
  { pattern: /\b(gel|chew)/i, path: { level1: "Nutrition", level2: "Energy Gels & Chews", level3: null } },
  { pattern: /\b(bar|nutrition|electrolyte)/i, path: { level1: "Nutrition", level2: "Bars", level3: null } },
];

function toAssignment(path: CanonicalCategoryPath, confident: boolean): ResolvedMarketplaceCategory {
  return {
    category: path.level1,
    subcategory: path.level2,
    level3: path.level3,
    confident,
  };
}

export function isValidAssignment(value: unknown): value is SupplierCategoryAssignment {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.category !== "string" || typeof candidate.subcategory !== "string") {
    return false;
  }
  return Boolean(resolveCanonicalPath(candidate.category, candidate.subcategory, null));
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

export function resolveMarketplaceCategory(input: {
  rawCategory?: string | null;
  rawSubcategory?: string | null;
  name?: string | null;
  description?: string | null;
}): ResolvedMarketplaceCategory;
export function resolveMarketplaceCategory(
  rawCategory?: string | null,
  rawSubcategory?: string | null,
  productName?: string | null,
): ResolvedMarketplaceCategory;
export function resolveMarketplaceCategory(
  rawCategoryOrInput?:
    | string
    | null
    | {
        rawCategory?: string | null;
        rawSubcategory?: string | null;
        name?: string | null;
        description?: string | null;
      },
  rawSubcategory?: string | null,
  productName?: string | null,
): ResolvedMarketplaceCategory {
  const input =
    rawCategoryOrInput && typeof rawCategoryOrInput === "object"
      ? rawCategoryOrInput
      : {
          rawCategory: rawCategoryOrInput,
          rawSubcategory,
          name: productName,
          description: null,
        };

  const direct = resolveCanonicalPath(input.rawCategory, input.rawSubcategory, null);
  if (direct) return toAssignment(direct, true);

  // Try treating provider L1 as a detailed L1 with first available L2.
  if (input.rawCategory?.trim()) {
    const level1Match = listCanonicalLevel1().find(
      (name) => name.toLocaleLowerCase() === input.rawCategory!.trim().toLocaleLowerCase(),
    );
    if (level1Match) {
      const level2 = listCanonicalLevel2(level1Match)[0];
      if (level2) {
        return toAssignment(
          { level1: level1Match, level2, level3: null },
          Boolean(input.rawSubcategory?.trim()),
        );
      }
    }
  }

  const haystack = [input.rawCategory, input.rawSubcategory, input.name, input.description]
    .filter(Boolean)
    .join(" ");
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(haystack)) {
      return toAssignment(rule.path, false);
    }
  }

  // Safe pending-friendly fallback: Accessories / Locks is valid but marked unconfident.
  return {
    category: "Accessories",
    subcategory: "Locks",
    level3: null,
    confident: false,
  };
}
