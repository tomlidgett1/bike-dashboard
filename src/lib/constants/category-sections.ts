export interface DynamicCategory {
  label: string;
  level1: string;
}

export interface CategoryParentSection {
  id: string;
  label: string;
  icon: string;
  /** Exact marketplace_category values */
  matchers: string[];
  /** Fallback keyword matches (lowercase) */
  keywords: string[];
}

export const CATEGORY_PARENT_SECTIONS: CategoryParentSection[] = [
  {
    id: "bikes",
    label: "Bikes",
    icon: "noun-road-bike-frame-6991314.svg",
    matchers: [
      "Bicycles",
      "BICYCLE",
      "E-Bikes",
      "Frames & Framesets",
      "Marketplace Specials",
    ],
    keywords: ["bike", "bicycle", "e-bike", "frame", "gravel", "mountain", "bmx", "road"],
  },
  {
    id: "components",
    label: "Components",
    icon: "noun-bike-cassette-6991390.svg",
    matchers: [
      "Drivetrain",
      "Brakes",
      "Cockpit",
      "Seat & Seatposts",
      "Saddles & Seatposts",
      "Pedals",
      "Wheels & Tyres",
      "Tyres",
      "Tubes",
      "Components",
      "Parts",
      "Bearings",
      "Forks",
      "Headsets",
    ],
    keywords: [
      "drivetrain",
      "brake",
      "cockpit",
      "pedal",
      "wheel",
      "tyre",
      "tire",
      "chain",
      "cassette",
      "derailleur",
      "saddle",
      "seatpost",
      "handlebar",
      "stem",
      "fork",
      "hub",
      "groupset",
    ],
  },
  {
    id: "gear",
    label: "Gear & Wear",
    icon: "noun-bike-jersey-6991397.svg",
    matchers: [
      "Apparel",
      "Protection",
      "Accessories",
      "Helmets",
      "Lights",
      "Bags",
      "Locks",
      "Pumps",
      "Jerseys",
      "Gloves",
      "Shoes",
      "Bottles & Cages",
      "Mudguards / Fenders",
    ],
    keywords: [
      "apparel",
      "helmet",
      "jersey",
      "glove",
      "short",
      "jacket",
      "gilet",
      "shoe",
      "protection",
      "accessor",
      "light",
      "lock",
      "bag",
      "pump",
      "bottle",
      "rack",
      "mudguard",
      "fender",
    ],
  },
  {
    id: "tech",
    label: "Tech & Fuel",
    icon: "noun-bike-computer-6991376.svg",
    matchers: [
      "Tech & Electronics",
      "Nutrition",
      "Bicycle Computers",
      "Bike Computers",
      "Batteries & Chargers",
      "E-Bike Batteries & Chargers",
      "Electrolytes",
      "Drink Mixes & Electrolytes",
      "Smart Trainers",
    ],
    keywords: [
      "computer",
      "trainer",
      "nutrition",
      "gel",
      "electronic",
      "camera",
      "charger",
      "heart rate",
      "bar",
      "electrolyte",
    ],
  },
  {
    id: "workshop",
    label: "Workshop",
    icon: "noun-chain-tool-6991336.svg",
    matchers: [
      "Maintenance & Workshop",
      "Shop Services",
      "Tools, Cleaning & Lubricants",
      "Tools",
      "Cleaning",
      "Lubricants & Grease",
      "Repair Kits",
    ],
    keywords: [
      "maintenance",
      "workshop",
      "tool",
      "cleaning",
      "lubricant",
      "service",
      "repair",
      "workstand",
      "fitting",
    ],
  },
  {
    id: "other",
    label: "More",
    icon: "noun-bike-bell-6991334.svg",
    matchers: [],
    keywords: [],
  },
];

export interface GroupedCategorySection {
  section: CategoryParentSection;
  items: DynamicCategory[];
}

export function resolveCategorySectionId(categoryName: string): string {
  const normalised = categoryName.toLowerCase();

  for (const section of CATEGORY_PARENT_SECTIONS) {
    if (section.id === "other") continue;
    if (section.matchers.some((matcher) => matcher.toLowerCase() === normalised)) {
      return section.id;
    }
  }

  for (const section of CATEGORY_PARENT_SECTIONS) {
    if (section.id === "other") continue;
    if (section.keywords.some((keyword) => normalised.includes(keyword))) {
      return section.id;
    }
  }

  return "other";
}

export function groupCategoriesBySection(
  categories: DynamicCategory[],
): GroupedCategorySection[] {
  const buckets = new Map<string, DynamicCategory[]>();

  for (const category of categories) {
    const sectionId = resolveCategorySectionId(category.level1);
    const list = buckets.get(sectionId) ?? [];
    list.push(category);
    buckets.set(sectionId, list);
  }

  return CATEGORY_PARENT_SECTIONS.map((section) => ({
    section,
    items: buckets.get(section.id) ?? [],
  })).filter((group) => group.items.length > 0);
}
