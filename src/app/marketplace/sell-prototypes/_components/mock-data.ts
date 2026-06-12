// ============================================================
// Mock data for the bulk upload mobile prototypes
// Self-contained — no API calls. Used by all three variants.
// ============================================================

export type ItemType = "bike" | "part" | "apparel";

export type ConditionRating =
  | "New"
  | "Like New"
  | "Excellent"
  | "Good"
  | "Fair"
  | "Well Used";

export const CONDITION_RATINGS: ConditionRating[] = [
  "New",
  "Like New",
  "Excellent",
  "Good",
  "Fair",
  "Well Used",
];

export interface MockProduct {
  id: string;
  images: string[];
  title: string;
  price: number;
  rrp?: number;
  condition: ConditionRating;
  brand: string;
  model: string;
  type: ItemType;
  description: string;
  confidence: number; // 0-100 AI confidence
  year?: string;
  frameSize?: string;
  material?: string;
  groupset?: string;
  wheelSize?: string;
  colour?: string;
  shippingAvailable: boolean;
  shippingCost: number;
  pickupAvailable: boolean;
  pickupLocation: string;
}

// Reliable Unsplash CDN photo IDs (bikes / cycling)
const IMG = {
  road: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=800&q=80",
  mtb: "https://images.unsplash.com/photo-1576435728678-68d0fbf94e91?w=800&q=80",
  street: "https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?w=800&q=80",
  wheel: "https://images.unsplash.com/photo-1511994298241-608e28f14fde?w=800&q=80",
  drivetrain: "https://images.unsplash.com/photo-1559348349-86f1f65817fe?w=800&q=80",
  gravel: "https://images.unsplash.com/photo-1502744688674-c619d1586c9e?w=800&q=80",
};

// The pool of photos a seller "took" (mixed angles of several items)
export const MOCK_PHOTOS: string[] = [
  IMG.road,
  IMG.street,
  IMG.mtb,
  IMG.wheel,
  IMG.gravel,
  IMG.drivetrain,
  IMG.road,
  IMG.mtb,
  IMG.street,
  IMG.wheel,
  IMG.gravel,
  IMG.drivetrain,
];

// What the AI "detects" after analysing the photos
export const MOCK_PRODUCTS: MockProduct[] = [
  {
    id: "p1",
    images: [IMG.road, IMG.street, IMG.wheel],
    title: "Specialized Allez Sport",
    price: 1200,
    rrp: 1800,
    condition: "Good",
    brand: "Specialized",
    model: "Allez Sport",
    type: "bike",
    description:
      "Lightweight aluminium road bike with a smooth Shimano 105 groupset. A fast, reliable all-rounder ideal for commuting and weekend rides.",
    confidence: 92,
    year: "2021",
    frameSize: "54cm",
    material: "Aluminium",
    groupset: "Shimano 105",
    wheelSize: "700c",
    colour: "Red / Black",
    shippingAvailable: true,
    shippingCost: 45,
    pickupAvailable: true,
    pickupLocation: "Brunswick, VIC",
  },
  {
    id: "p2",
    images: [IMG.mtb, IMG.gravel],
    title: "Trek Marlin 7",
    price: 850,
    rrp: 1100,
    condition: "Excellent",
    brand: "Trek",
    model: "Marlin 7",
    type: "bike",
    description:
      "Capable hardtail mountain bike with hydraulic disc brakes and a wide-range drivetrain. Barely used, stored indoors.",
    confidence: 88,
    year: "2022",
    frameSize: "M",
    material: "Aluminium",
    groupset: "Shimano Deore",
    wheelSize: '29"',
    colour: "Blue",
    shippingAvailable: false,
    shippingCost: 0,
    pickupAvailable: true,
    pickupLocation: "Brunswick, VIC",
  },
  {
    id: "p3",
    images: [IMG.drivetrain, IMG.wheel],
    title: "Shimano 105 R7000 Groupset",
    price: 320,
    rrp: 650,
    condition: "Like New",
    brand: "Shimano",
    model: "105 R7000",
    type: "part",
    description:
      "Complete 11-speed mechanical groupset. Removed from a build with under 500km. Shifts crisp and clean.",
    confidence: 74,
    colour: "Black",
    shippingAvailable: true,
    shippingCost: 15,
    pickupAvailable: true,
    pickupLocation: "Brunswick, VIC",
  },
  {
    id: "p4",
    images: [IMG.gravel, IMG.road, IMG.drivetrain],
    title: "Giant Defy Advanced 2",
    price: 1650,
    rrp: 2400,
    condition: "Good",
    brand: "Giant",
    model: "Defy Advanced 2",
    type: "bike",
    description:
      "Carbon endurance road bike built for long days in the saddle. Comfortable geometry with reliable Shimano 105 shifting.",
    confidence: 81,
    year: "2020",
    frameSize: "M/L",
    material: "Carbon",
    groupset: "Shimano 105",
    wheelSize: "700c",
    colour: "Charcoal",
    shippingAvailable: true,
    shippingCost: 55,
    pickupAvailable: true,
    pickupLocation: "Brunswick, VIC",
  },
  {
    id: "p5",
    images: [IMG.wheel, IMG.mtb],
    title: "Mavic Ksyrium Wheelset",
    price: 420,
    rrp: 900,
    condition: "Excellent",
    brand: "Mavic",
    model: "Ksyrium Elite",
    type: "part",
    description:
      "Lightweight clincher wheelset, true and round with plenty of life left in the brake tracks. Includes tyres.",
    confidence: 67,
    colour: "Black",
    shippingAvailable: true,
    shippingCost: 25,
    pickupAvailable: true,
    pickupLocation: "Brunswick, VIC",
  },
];

export const PICKUP_DEFAULT = "Brunswick, VIC";

export function formatAUD(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function typeLabel(type: ItemType): string {
  if (type === "bike") return "Bike";
  if (type === "part") return "Part";
  return "Apparel";
}

export function confidenceLabel(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 85) return "high";
  if (confidence >= 70) return "medium";
  return "low";
}
