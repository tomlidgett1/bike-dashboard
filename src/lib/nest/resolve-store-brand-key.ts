import { getNestDefaultBrandKey } from "@/lib/nest/config";

type ProfileRow = {
  nest_brand_key?: string | null;
  business_name?: string | null;
};

/** Nest brand keys that differ from slugified Yellow Jersey business names. */
const KNOWN_BRAND_KEY_ALIASES: Record<string, string> = {
  "ashburton-cycles": "ash",
};

function slugifyBrandKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function resolveStoreNestBrandKey(profile: ProfileRow | null | undefined): string {
  const explicit = profile?.nest_brand_key?.trim().toLowerCase();
  if (explicit) return explicit;

  const fromName = profile?.business_name ? slugifyBrandKey(profile.business_name) : "";
  if (fromName) {
    return KNOWN_BRAND_KEY_ALIASES[fromName] ?? fromName;
  }

  return getNestDefaultBrandKey();
}
