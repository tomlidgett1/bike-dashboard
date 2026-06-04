// ─────────────────────────────────────────────────────────────────────────────
// Mock data for the settings/products redesign mockup.
// Pure static data — no Supabase, no auth. Safe to render anywhere.
// ─────────────────────────────────────────────────────────────────────────────

export type MarketplaceState = "live" | "draft" | "needs_images" | "hidden";

export interface MockProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  brand: string;
  price: number;
  cost: number;
  stock: number;
  reorderPoint: number;
  state: MarketplaceState;
  /** hue (0-360) used to tint the placeholder thumbnail so the grid feels alive */
  hue: number;
  hasImage: boolean;
}

export const STORE = {
  name: "Yellow Jersey Cycles",
  plan: "Pro store",
  initials: "YJ",
  owner: "Tom Lidgett",
  email: "tom@lidgett.net",
};

export const OTHER_STORES = [
  { name: "Peloton Pit Stop", plan: "Starter", initials: "PP" },
  { name: "Alpine Gear Co.", plan: "Pro store", initials: "AG" },
];

export const PRODUCTS: MockProduct[] = [
  { id: "p1", name: "Trek Domane SL 6 Disc", sku: "TRK-DOM-SL6", category: "Road Bikes", brand: "Trek", price: 4299, cost: 3010, stock: 4, reorderPoint: 2, state: "live", hue: 47, hasImage: true },
  { id: "p2", name: "Specialized Stumpjumper EVO Comp", sku: "SPC-STJ-EVO", category: "Mountain Bikes", brand: "Specialized", price: 5200, cost: 3640, stock: 2, reorderPoint: 2, state: "live", hue: 8, hasImage: true },
  { id: "p3", name: "Cannondale Topstone Carbon 4", sku: "CDL-TPS-C4", category: "Gravel Bikes", brand: "Cannondale", price: 3199, cost: 2240, stock: 0, reorderPoint: 1, state: "hidden", hue: 150, hasImage: true },
  { id: "p4", name: "Shimano Ultegra R8170 Groupset", sku: "SHI-ULT-8170", category: "Components", brand: "Shimano", price: 1899, cost: 1330, stock: 7, reorderPoint: 3, state: "live", hue: 205, hasImage: true },
  { id: "p5", name: "Giant Trance X Advanced Pro 29", sku: "GNT-TRX-29", category: "Mountain Bikes", brand: "Giant", price: 6499, cost: 4549, stock: 1, reorderPoint: 2, state: "needs_images", hue: 270, hasImage: false },
  { id: "p6", name: "Castelli Gabba RoS Jersey", sku: "CST-GAB-ROS", category: "Apparel", brand: "Castelli", price: 189, cost: 95, stock: 24, reorderPoint: 6, state: "live", hue: 330, hasImage: true },
  { id: "p7", name: "Garmin Edge 1040 Solar", sku: "GRM-EDG-1040", category: "Accessories", brand: "Garmin", price: 749, cost: 524, stock: 11, reorderPoint: 4, state: "draft", hue: 95, hasImage: true },
  { id: "p8", name: "ENVE SES 4.5 Wheelset", sku: "ENV-SES-45", category: "Wheels", brand: "ENVE", price: 2850, cost: 1995, stock: 3, reorderPoint: 1, state: "live", hue: 25, hasImage: true },
  { id: "p9", name: "Cervélo Soloist Rival eTap AXS", sku: "CVL-SOL-RIV", category: "Road Bikes", brand: "Cervélo", price: 4599, cost: 3220, stock: 0, reorderPoint: 1, state: "needs_images", hue: 185, hasImage: false },
  { id: "p10", name: "Fox 36 Factory GRIP2 Fork", sku: "FOX-36-FAC", category: "Components", brand: "Fox", price: 1199, cost: 839, stock: 5, reorderPoint: 2, state: "live", hue: 60, hasImage: true },
  { id: "p11", name: "Rapha Pro Team Bib Shorts", sku: "RPH-PRO-BIB", category: "Apparel", brand: "Rapha", price: 265, cost: 132, stock: 18, reorderPoint: 5, state: "live", hue: 350, hasImage: true },
  { id: "p12", name: "Wahoo KICKR Move Smart Trainer", sku: "WAH-KCK-MOV", category: "Accessories", brand: "Wahoo", price: 1599, cost: 1119, stock: 6, reorderPoint: 2, state: "draft", hue: 220, hasImage: true },
];

export const PRODUCT_STATS = {
  total: 1284,
  live: 942,
  lowStock: 37,
  needsImages: 84,
};

export const STATE_LABEL: Record<MarketplaceState, string> = {
  live: "Live",
  draft: "Draft",
  needs_images: "Needs images",
  hidden: "Hidden",
};

export const CATEGORIES = [
  "Road Bikes",
  "Mountain Bikes",
  "Gravel Bikes",
  "Components",
  "Wheels",
  "Apparel",
  "Accessories",
];

export const BRANDS = [
  "Trek",
  "Specialized",
  "Cannondale",
  "Giant",
  "Cervélo",
  "Shimano",
  "ENVE",
  "Garmin",
];

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}
