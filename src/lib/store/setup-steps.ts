import type { OpeningHours } from "@/components/providers/profile-provider";
import { BRAND_YELLOW } from "@/lib/marketplace/homepage-config";

/** Values must match Settings → Business profile → Store type exactly. */
export const STORE_TYPES = [
  { value: "Bicycle Shop", label: "Bicycle Shop", description: "General retail and advice" },
  { value: "Bike Repair & Service", label: "Bike Repair & Service", description: "Workshop-first store" },
  { value: "Mountain Bike Specialist", label: "Mountain Bike Specialist", description: "Trail and MTB focus" },
  { value: "Road Bike Specialist", label: "Road Bike Specialist", description: "Road and performance" },
  { value: "Electric Bike Dealer", label: "Electric Bike Dealer", description: "Electric bikes and support" },
  { value: "BMX Shop", label: "BMX Shop", description: "BMX and skate park culture" },
  { value: "Cycling Accessories", label: "Cycling Accessories", description: "Parts, apparel and accessories" },
  { value: "Bike Rental", label: "Bike Rental", description: "Hire and experiences" },
  { value: "Online Bike Store", label: "Online Bike Store", description: "Mostly online sales" },
  { value: "Sports & Recreation", label: "Sports & Recreation", description: "Broader sports retail" },
  { value: "Other", label: "Other", description: "Something else" },
] as const;

export type StoreSetupStepId =
  | "welcome"
  | "store-name"
  | "store-type"
  | "address"
  | "phone"
  | "logo"
  | "opening-hours"
  | "header-image"
  | "theme"
  | "bio"
  | "service"
  | "lightspeed"
  | "uber"
  | "complete";

export const STORE_SETUP_STEPS: StoreSetupStepId[] = [
  "welcome",
  "store-name",
  "store-type",
  "address",
  "phone",
  "logo",
  "opening-hours",
  "header-image",
  "theme",
  "bio",
  "service",
  "lightspeed",
  "uber",
  "complete",
];

export const DEFAULT_OPENING_HOURS: OpeningHours = {
  monday: { open: "09:00", close: "17:00", closed: false },
  tuesday: { open: "09:00", close: "17:00", closed: false },
  wednesday: { open: "09:00", close: "17:00", closed: false },
  thursday: { open: "09:00", close: "17:00", closed: false },
  friday: { open: "09:00", close: "17:00", closed: false },
  saturday: { open: "10:00", close: "16:00", closed: false },
  sunday: { open: "10:00", close: "16:00", closed: true },
};

export type StoreSetupProfile = {
  business_name?: string | null;
  store_type?: string | null;
  address?: string | null;
  phone?: string | null;
  logo_url?: string | null;
  opening_hours?: OpeningHours | null;
  bio?: string | null;
  preferences?: {
    store_setup_completed?: boolean;
    store_setup_header_done?: boolean;
    store_setup_theme_done?: boolean;
  } | null;
};

const REQUIRED_SETUP_CHECKS: ((profile: StoreSetupProfile) => boolean)[] = [
  (p) => !!p.business_name?.trim(),
  (p) => !!p.store_type?.trim(),
  (p) => !!p.address?.trim(),
  (p) => !!p.phone?.trim(),
  (p) => !!p.opening_hours,
];

export function isStoreSetupComplete(profile: StoreSetupProfile): boolean {
  if (profile.preferences?.store_setup_completed) return true;
  return REQUIRED_SETUP_CHECKS.every((check) => check(profile));
}

export function storeSetupProgress(profile: StoreSetupProfile): number {
  if (isStoreSetupComplete(profile)) return 100;
  const done = REQUIRED_SETUP_CHECKS.filter((check) => check(profile)).length;
  return Math.round((done / REQUIRED_SETUP_CHECKS.length) * 100);
}

function isStepComplete(stepId: StoreSetupStepId, profile: StoreSetupProfile): boolean {
  switch (stepId) {
    case "welcome":
      return true;
    case "store-name":
      return !!profile.business_name?.trim();
    case "store-type":
      return !!profile.store_type?.trim();
    case "address":
      return !!profile.address?.trim();
    case "phone":
      return !!profile.phone?.trim();
    case "logo":
    case "header-image":
    case "theme":
    case "bio":
    case "uber":
      return true;
    case "opening-hours":
      return !!profile.opening_hours;
    case "service":
    case "lightspeed":
      return !!profile.preferences?.store_setup_completed;
    case "complete":
      return !!profile.preferences?.store_setup_completed;
    default:
      return false;
  }
}

/** Resume onboarding at the first step that still needs attention. */
export function getFirstIncompleteStepIndex(profile: StoreSetupProfile): number {
  if (profile.preferences?.store_setup_completed) {
    return STORE_SETUP_STEPS.indexOf("complete");
  }

  for (let i = 0; i < STORE_SETUP_STEPS.length; i++) {
    const stepId = STORE_SETUP_STEPS[i];
    if (stepId === "welcome" || stepId === "complete") continue;
    if (!isStepComplete(stepId, profile)) return i;
  }

  return STORE_SETUP_STEPS.indexOf("uber");
}

export const DEFAULT_THEME_ACCENT = BRAND_YELLOW;
