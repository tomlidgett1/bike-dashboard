import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type VerifiedStoreUser = {
  userId: string;
};

export async function requireVerifiedStore(): Promise<
  VerifiedStoreUser | NextResponse
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("account_type, bicycle_store")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.account_type !== "bicycle_store" || !profile.bicycle_store) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  return { userId: user.id };
}

export function isErrorResponse(
  value: VerifiedStoreUser | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}
