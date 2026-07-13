import { NextResponse } from "next/server";
import {
  requireStoreUser,
  type StoreAuth,
} from "@/lib/customer-inquiries/auth";
import { isNestMessagingConfigured } from "@/lib/nest/config";
import { resolveExplicitStoreNestBrandKey } from "@/lib/nest/resolve-store-brand-key";

export type StoreNestAccess = StoreAuth & {
  brandKey: string;
};

function error(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Authenticates every store role, then requires an explicit owner-to-brand link.
 * All active staff may edit Nest, but no management request may use a guessed key.
 */
export async function requireStoreNestAccess(): Promise<
  StoreNestAccess | { error: NextResponse }
> {
  const auth = await requireStoreUser();
  if ("error" in auth) return auth;

  if (!isNestMessagingConfigured()) {
    return { error: error("Nest messaging is not configured yet.", 503) };
  }

  const brandKey = resolveExplicitStoreNestBrandKey(auth.profile);
  if (!brandKey) {
    return {
      error: error(
        "This store is not linked to a Nest brand yet. Ask support to finish the connection.",
        409,
      ),
    };
  }

  return { ...auth, brandKey };
}
