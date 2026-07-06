// GET/PUT the store's Domestique configuration.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedStoreUserId } from "@/lib/domestique/api-helpers";
import { loadDomestiqueConfig, upsertDomestiqueConfig } from "@/lib/domestique/config";
import type { DomestiqueConfigUpdate } from "@/lib/types/domestique";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { userId, error } = await getVerifiedStoreUserId(supabase);
    if (error) return NextResponse.json({ error: error.message }, { status: error.status });

    const config = await loadDomestiqueConfig(supabase, userId!);
    return NextResponse.json({ config });
  } catch (err) {
    console.error("[domestique/config] GET failed:", err);
    return NextResponse.json({ error: "Failed to load configuration" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { userId, error } = await getVerifiedStoreUserId(supabase);
    if (error) return NextResponse.json({ error: error.message }, { status: error.status });

    const body = (await request.json().catch(() => ({}))) as DomestiqueConfigUpdate;
    const config = await upsertDomestiqueConfig(supabase, userId!, body);
    return NextResponse.json({ config });
  } catch (err) {
    console.error("[domestique/config] PUT failed:", err);
    return NextResponse.json({ error: "Failed to save configuration" }, { status: 500 });
  }
}
