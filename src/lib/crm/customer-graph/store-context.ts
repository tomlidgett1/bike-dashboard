import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ApiErrorCode } from "./types";

type StoreSupabase = Awaited<ReturnType<typeof createClient>>;

export type StoreRole = "owner" | "manager" | "sales" | "service" | "staff";

export type CrmStoreContext = {
  supabase: StoreSupabase;
  userId: string;
  storeId: string;
  ownerUserId: string;
  storeName: string;
  role: StoreRole;
  crmEnabled: boolean;
  source: "membership" | "owner" | "legacy_owner";
};

export type StoreContextResult =
  | { context: CrmStoreContext }
  | { error: NextResponse };

type StoreRow = {
  id: string;
  owner_user_id: string;
  name: string | null;
  crm_enabled: boolean | null;
};

type MembershipRow = {
  store_id: string;
  role: string;
  status: string;
  stores: StoreRow | StoreRow[] | null;
};

function errorResponse(code: ApiErrorCode, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

function relationIsUnavailable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .* does not exist|schema cache/i.test(error.message ?? "")
  );
}

function normaliseRole(value: string): StoreRole {
  if (["owner", "manager", "sales", "service", "staff"].includes(value)) {
    return value as StoreRole;
  }
  return "staff";
}

function firstStore(value: StoreRow | StoreRow[] | null): StoreRow | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function resolveCrmStoreContext(): Promise<StoreContextResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return {
      error: errorResponse("UNAUTHORISED", "Please sign in to use store CRM.", 401),
    };
  }

  const [membershipResult, ownerResult, profileResult] = await Promise.all([
    supabase
      .from("store_memberships")
      .select("store_id, role, status, stores(id, owner_user_id, name, crm_enabled)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("store_id", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("stores")
      .select("id, owner_user_id, name, crm_enabled")
      .eq("owner_user_id", user.id)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("users")
      .select("account_type, bicycle_store, business_name")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const membershipUnavailable = relationIsUnavailable(membershipResult.error);
  const storesUnavailable = relationIsUnavailable(ownerResult.error);
  if (membershipResult.error && !membershipUnavailable) {
    return {
      error: errorResponse(
        "DATABASE_ERROR",
        "Could not verify this store membership.",
        500,
      ),
    };
  }
  if (ownerResult.error && !storesUnavailable) {
    return {
      error: errorResponse("DATABASE_ERROR", "Could not load this store.", 500),
    };
  }
  if (profileResult.error) {
    return {
      error: errorResponse("DATABASE_ERROR", "Could not load the account profile.", 500),
    };
  }

  const membership = membershipResult.data as MembershipRow | null;
  const membershipStore = membership ? firstStore(membership.stores) : null;
  if (membership && membershipStore) {
    return {
      context: {
        supabase,
        userId: user.id,
        storeId: membershipStore.id,
        ownerUserId: membershipStore.owner_user_id,
        storeName: membershipStore.name ?? "Bike store",
        role: normaliseRole(membership.role),
        crmEnabled: membershipStore.crm_enabled !== false,
        source: "membership",
      },
    };
  }

  const ownedStore = ownerResult.data as StoreRow | null;
  if (ownedStore) {
    return {
      context: {
        supabase,
        userId: user.id,
        storeId: ownedStore.id,
        ownerUserId: ownedStore.owner_user_id,
        storeName: ownedStore.name ?? profileResult.data?.business_name ?? "Bike store",
        role: "owner",
        crmEnabled: ownedStore.crm_enabled !== false,
        source: "owner",
      },
    };
  }

  // Existing verified bike-store accounts pre-date stores/memberships. Treat
  // their auth user id as a temporary owner-scoped store id until backfilled.
  const isVerifiedLegacyOwner =
    profileResult.data?.account_type === "bicycle_store"
    && profileResult.data?.bicycle_store === true;
  if (
    isVerifiedLegacyOwner
    && (
      (membershipUnavailable && storesUnavailable)
      || (!membershipResult.data && !ownerResult.data)
    )
  ) {
    return {
      context: {
        supabase,
        userId: user.id,
        storeId: user.id,
        ownerUserId: user.id,
        storeName: profileResult.data?.business_name ?? "Bike store",
        role: "owner",
        crmEnabled: true,
        source: "legacy_owner",
      },
    };
  }

  return {
    error: errorResponse(
      "STORE_ACCESS_REQUIRED",
      "An active store membership is required.",
      403,
    ),
  };
}
