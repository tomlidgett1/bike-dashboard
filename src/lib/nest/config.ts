function sanitiseEnvValue(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Common copy/paste mistake from Supabase dashboard or docs: <eyJ...>
  return trimmed.replace(/^<+/, "").replace(/>+$/, "").trim() || null;
}

export function getNestSupabaseUrl(): string | null {
  return (
    sanitiseEnvValue(process.env.NEST_SUPABASE_URL) ||
    sanitiseEnvValue(process.env.NEST_PUBLIC_SUPABASE_URL)
  );
}

export function getNestSupabaseServiceKey(): string | null {
  return (
    sanitiseEnvValue(process.env.NEST_SUPABASE_SECRET_KEY) ||
    sanitiseEnvValue(process.env.NEST_NEW_SUPABASE_SECRET_KEY) ||
    sanitiseEnvValue(process.env.NEST_SUPABASE_SERVICE_ROLE_KEY) ||
    sanitiseEnvValue(process.env.NEW_SUPABASE_SECRET_KEY) ||
    sanitiseEnvValue(process.env.SUPABASE_SECRET_KEY)
  );
}

export function getNestBrandPortalApiUrl(): string | null {
  const explicit =
    sanitiseEnvValue(process.env.NEST_BRAND_PORTAL_API_URL) ||
    sanitiseEnvValue(process.env.NEST_PUBLIC_SITE_URL) ||
    sanitiseEnvValue(process.env.NEST_WEBSITE_URL);
  if (!explicit) return null;
  return explicit.replace(/\/+$/, "");
}

export function getNestDefaultBrandKey(): string {
  return (sanitiseEnvValue(process.env.NEST_DEFAULT_BRAND_KEY) || "ash").toLowerCase();
}

function useInternalPortal(): boolean {
  return process.env.NEST_PORTAL_INTERNAL === "1" || process.env.NEST_PORTAL_INTERNAL === "true";
}

function getYjSupabaseUrl(): string | null {
  return (
    sanitiseEnvValue(process.env.SUPABASE_URL) ||
    sanitiseEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL)
  );
}

function getYjSupabaseServiceKey(): string | null {
  return (
    sanitiseEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    sanitiseEnvValue(process.env.SUPABASE_SECRET_KEY)
  );
}

export function isNestMessagingConfigured(): boolean {
  // Post-cutover: portal runs in-process against YJ Supabase (see NEST_PORTAL_CUTOVER.md).
  if (useInternalPortal()) {
    return Boolean(getYjSupabaseUrl() && getYjSupabaseServiceKey());
  }
  return Boolean(getNestSupabaseUrl() && getNestSupabaseServiceKey() && getNestBrandPortalApiUrl());
}
