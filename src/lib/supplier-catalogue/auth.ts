import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin-auth";

type AuthUser = {
  email?: string | null;
};

type SupabaseAuthClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: AuthUser | null };
      error: unknown;
    }>;
  };
};

/**
 * Emails allowed to add/manage the shared supplier catalogue
 * (in addition to ADMIN_EMAILS).
 */
function catalogueManagerEmails(): string[] {
  const defaults = ["shop@ashburtoncycles.com.au"];
  const fromEnv = (process.env.SUPPLIER_CATALOGUE_MANAGER_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...defaults, ...fromEnv])];
}

export function isSupplierCatalogueManagerEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalised = email.toLowerCase();
  return isAdminEmail(normalised) || catalogueManagerEmails().includes(normalised);
}

/**
 * Platform admins + allowlisted store emails (e.g. Ashburton Cycles)
 * can curate the shared supplier catalogue.
 */
export async function requireSupplierCatalogueManager(
  supabase: SupabaseAuthClient,
) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorised" }, { status: 401 }),
    };
  }

  if (!isSupplierCatalogueManagerEmail(user.email)) {
    return {
      authorized: false as const,
      response: NextResponse.json(
        { error: "Forbidden - Supplier catalogue managers only" },
        { status: 403 },
      ),
    };
  }

  return { authorized: true as const, user };
}
