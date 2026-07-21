/**
 * Canonical Yellow Jersey marketplace taxonomy helpers.
 * Source of truth is the marketplace_categories table; CATEGORY_TAXONOMY
 * is the static fallback used when the table is unavailable.
 */

import {
  CATEGORY_TAXONOMY,
  getLevel1Categories,
  getLevel2Categories,
  getLevel3Categories,
  type CategoryNode,
} from "@/lib/constants/categories";

export type CanonicalCategoryPath = {
  level1: string;
  level2: string;
  level3: string | null;
  categoryId?: string;
};

export type CanonicalCategoryHierarchy = {
  level1: string;
  level2Categories: {
    name: string;
    count: number;
    level3Categories: {
      name: string;
      count: number;
    }[];
  }[];
  totalProducts: number;
};

/** Legacy simplified UI values → detailed taxonomy paths. */
const LEGACY_PATH_ALIASES: Record<string, CanonicalCategoryPath> = {
  "bicycles|road": { level1: "Bicycles", level2: "Road", level3: null },
  "bicycles|mountain": { level1: "Bicycles", level2: "Mountain", level3: null },
  "bicycles|hybrid": { level1: "Bicycles", level2: "Hybrid / Fitness", level3: null },
  "bicycles|electric": { level1: "E-Bikes", level2: "E-Hybrid", level3: null },
  "bicycles|kids": { level1: "Bicycles", level2: "Kids", level3: null },
  "bicycles|bmx": { level1: "Bicycles", level2: "BMX", level3: null },
  "bicycles|cruiser": { level1: "Bicycles", level2: "Commuter / City", level3: null },
  "bicycles|other": { level1: "Bicycles", level2: "Hybrid / Fitness", level3: null },
  "parts|frames": { level1: "Frames & Framesets", level2: "Other Frames", level3: null },
  "parts|wheels": { level1: "Wheels & Tyres", level2: "Road Wheelsets", level3: null },
  "parts|drivetrain": { level1: "Drivetrain", level2: "Groupsets", level3: null },
  "parts|brakes": { level1: "Brakes", level2: "Brake Pads", level3: null },
  "parts|handlebars": { level1: "Cockpit", level2: "Handlebars", level3: "Road" },
  "parts|saddles": { level1: "Seat & Seatposts", level2: "Saddles", level3: null },
  "parts|pedals": { level1: "Pedals", level2: "Clipless Pedals", level3: null },
  "parts|other": { level1: "Accessories", level2: "Locks", level3: null },
  "apparel|jerseys": { level1: "Apparel", level2: "Jerseys", level3: null },
  "apparel|shorts": { level1: "Apparel", level2: "Shorts & Bibs", level3: null },
  "apparel|jackets": { level1: "Apparel", level2: "Jackets & Gilets", level3: null },
  "apparel|gloves": { level1: "Apparel", level2: "Gloves", level3: null },
  "apparel|shoes": { level1: "Apparel", level2: "Shoes", level3: "Road" },
  "apparel|helmets": { level1: "Accessories", level2: "Helmets", level3: null },
  "apparel|other": { level1: "Apparel", level2: "Casual Clothing", level3: null },
  "nutrition|energy bars": { level1: "Nutrition", level2: "Bars", level3: null },
  "nutrition|gels": { level1: "Nutrition", level2: "Energy Gels & Chews", level3: null },
  "nutrition|drinks": { level1: "Nutrition", level2: "Drink Mixes & Electrolytes", level3: null },
  "nutrition|supplements": { level1: "Nutrition", level2: "Drink Mixes & Electrolytes", level3: null },
  "nutrition|other": { level1: "Nutrition", level2: "Bars", level3: null },
};

const BIKE_TYPE_TO_PATH: Record<string, CanonicalCategoryPath> = {
  road: { level1: "Bicycles", level2: "Road", level3: null },
  gravel: { level1: "Bicycles", level2: "Gravel", level3: null },
  mountain: { level1: "Bicycles", level2: "Mountain", level3: null },
  mtb: { level1: "Bicycles", level2: "Mountain", level3: null },
  hybrid: { level1: "Bicycles", level2: "Hybrid / Fitness", level3: null },
  fitness: { level1: "Bicycles", level2: "Hybrid / Fitness", level3: null },
  electric: { level1: "E-Bikes", level2: "E-Hybrid", level3: null },
  "e-bike": { level1: "E-Bikes", level2: "E-Hybrid", level3: null },
  ebike: { level1: "E-Bikes", level2: "E-Hybrid", level3: null },
  kids: { level1: "Bicycles", level2: "Kids", level3: null },
  bmx: { level1: "Bicycles", level2: "BMX", level3: null },
  cruiser: { level1: "Bicycles", level2: "Commuter / City", level3: null },
  commuter: { level1: "Bicycles", level2: "Commuter / City", level3: null },
  city: { level1: "Bicycles", level2: "Commuter / City", level3: null },
  touring: { level1: "Bicycles", level2: "Touring", level3: null },
  folding: { level1: "Bicycles", level2: "Folding", level3: null },
  cargo: { level1: "Bicycles", level2: "Cargo", level3: null },
  cyclocross: { level1: "Bicycles", level2: "Cyclocross", level3: null },
};

function normaliseKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function pathKey(level1: string, level2: string, level3: string | null): string {
  return [level1, level2, level3 ?? ""]
    .map((value) => normaliseKey(value))
    .join("\u0000");
}

const TAXONOMY_PATHS = new Map(
  CATEGORY_TAXONOMY.map((node) => [
    pathKey(node.level1, node.level2, node.level3),
    node,
  ]),
);

export function listCanonicalLevel1(): string[] {
  return getLevel1Categories();
}

export function listCanonicalLevel2(level1: string): string[] {
  return getLevel2Categories(level1);
}

export function listCanonicalLevel3(level1: string, level2: string): string[] {
  return getLevel3Categories(level1, level2);
}

export function isValidCanonicalPath(
  level1: string | null | undefined,
  level2: string | null | undefined,
  level3: string | null | undefined = null,
): boolean {
  if (!level1?.trim() || !level2?.trim()) return false;
  const exact = TAXONOMY_PATHS.get(pathKey(level1, level2, level3 ?? null));
  if (exact) return true;
  // Allow L2 assignment even when L3 options exist (L3 optional).
  if (level3) return false;
  return CATEGORY_TAXONOMY.some(
    (node) =>
      normaliseKey(node.level1) === normaliseKey(level1) &&
      normaliseKey(node.level2) === normaliseKey(level2),
  );
}

export function resolveCanonicalPath(
  level1: string | null | undefined,
  level2: string | null | undefined,
  level3: string | null | undefined = null,
): CanonicalCategoryPath | null {
  if (!level1?.trim() || !level2?.trim()) return null;

  const alias =
    LEGACY_PATH_ALIASES[`${normaliseKey(level1)}|${normaliseKey(level2)}`];
  if (alias && isValidCanonicalPath(alias.level1, alias.level2, alias.level3)) {
    return alias;
  }

  if (!isValidCanonicalPath(level1, level2, level3)) {
    // Prefer exact L2 match without invalid L3.
    if (level3 && isValidCanonicalPath(level1, level2, null)) {
      return {
        level1: level1.trim(),
        level2: level2.trim(),
        level3: null,
      };
    }
    return null;
  }

  return {
    level1: level1.trim(),
    level2: level2.trim(),
    level3: level3?.trim() || null,
  };
}

export function resolveBikeTypeToCanonicalPath(
  bikeType: string | null | undefined,
): CanonicalCategoryPath | null {
  if (!bikeType?.trim()) return null;
  const direct = BIKE_TYPE_TO_PATH[normaliseKey(bikeType)];
  if (direct) return direct;

  // Fuzzy contains match against L2 bicycle names.
  const needle = normaliseKey(bikeType);
  const bikeMatch = CATEGORY_TAXONOMY.find(
    (node) =>
      (node.level1 === "Bicycles" || node.level1 === "E-Bikes") &&
      (normaliseKey(node.level2).includes(needle) ||
        needle.includes(normaliseKey(node.level2))),
  );
  if (!bikeMatch) return null;
  return {
    level1: bikeMatch.level1,
    level2: bikeMatch.level2,
    level3: bikeMatch.level3,
  };
}

export function buildStaticCategoryHierarchy(
  counts: Array<{
    marketplace_category: string | null;
    marketplace_subcategory: string | null;
    marketplace_level_3_category: string | null;
  }> = [],
): CanonicalCategoryHierarchy[] {
  const countMap = new Map<string, number>();
  for (const row of counts) {
    if (!row.marketplace_category) continue;
    const l1 = row.marketplace_category;
    const l2 = row.marketplace_subcategory || "";
    const l3 = row.marketplace_level_3_category || "";
    countMap.set(`l1:${l1}`, (countMap.get(`l1:${l1}`) || 0) + 1);
    if (l2) countMap.set(`l2:${l1}|${l2}`, (countMap.get(`l2:${l1}|${l2}`) || 0) + 1);
    if (l2 && l3) {
      countMap.set(`l3:${l1}|${l2}|${l3}`, (countMap.get(`l3:${l1}|${l2}|${l3}`) || 0) + 1);
    }
  }

  return listCanonicalLevel1().map((level1) => {
    const level2Names = listCanonicalLevel2(level1);
    return {
      level1,
      totalProducts: countMap.get(`l1:${level1}`) || 0,
      level2Categories: level2Names.map((level2) => {
        const level3Names = listCanonicalLevel3(level1, level2);
        return {
          name: level2,
          count: countMap.get(`l2:${level1}|${level2}`) || 0,
          level3Categories: level3Names.map((level3) => ({
            name: level3,
            count: countMap.get(`l3:${level1}|${level2}|${level3}`) || 0,
          })),
        };
      }),
    };
  });
}

export function searchCanonicalCategories(
  query: string,
  limit = 8,
): Array<{ level1: string; level2: string; level3: string | null; label: string }> {
  const needle = normaliseKey(query);
  if (!needle) return [];

  const matches: Array<{
    level1: string;
    level2: string;
    level3: string | null;
    label: string;
    score: number;
  }> = [];

  for (const node of CATEGORY_TAXONOMY as CategoryNode[]) {
    const label = [node.level1, node.level2, node.level3].filter(Boolean).join(" / ");
    const haystack = normaliseKey(label);
    if (!haystack.includes(needle) && !needle.split(/\s+/).every((part) => haystack.includes(part))) {
      continue;
    }
    const score =
      (normaliseKey(node.level1) === needle ? 100 : 0) +
      (normaliseKey(node.level2) === needle ? 80 : 0) +
      (node.level3 && normaliseKey(node.level3) === needle ? 60 : 0) +
      (haystack.startsWith(needle) ? 20 : 0) +
      (haystack.includes(needle) ? 10 : 0);
    matches.push({
      level1: node.level1,
      level2: node.level2,
      level3: node.level3,
      label,
      score,
    });
  }

  return matches
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(({ level1, level2, level3, label }) => ({ level1, level2, level3, label }));
}

export function formatCanonicalCategoryLabel(
  level1?: string | null,
  level2?: string | null,
  level3?: string | null,
): string {
  return [level1, level2, level3].filter(Boolean).join(" / ");
}
