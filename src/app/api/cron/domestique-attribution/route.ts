// Domestique attribution cron (every 6 hours): refresh attributed revenue for
// touches inside the window and build weekly receipts for completed weeks.

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normaliseConfig } from "@/lib/domestique/config";
import { ensureWeeklyReceipt, refreshAttributionForStore } from "@/lib/domestique/attribution";
import type { DomestiqueConfig } from "@/lib/types/domestique";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization");
  if (expected && provided !== `Bearer ${expected}` && request.headers.get("x-vercel-cron") !== "1") {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  // Any store that has ever enabled the agent keeps attributing inside the window.
  const { data: configs, error } = await supabase.from("domestique_config").select("*");
  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json({ success: true, stores: 0, note: "domestique tables not migrated yet" });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  let refreshedTouches = 0;
  let receiptsCreated = 0;
  let failed = 0;

  for (const row of (configs ?? []) as Array<Partial<DomestiqueConfig> & { user_id: string }>) {
    const config = normaliseConfig(row.user_id, row);
    try {
      const { touchesRefreshed } = await refreshAttributionForStore(supabase, config.user_id, config);
      refreshedTouches += touchesRefreshed;
      const { created } = await ensureWeeklyReceipt(supabase, config.user_id);
      if (created) receiptsCreated += 1;
    } catch (err) {
      failed += 1;
      console.error(`[cron/domestique-attribution] store ${config.user_id} failed:`, err);
    }
  }

  return NextResponse.json({
    success: failed === 0,
    stores: configs?.length ?? 0,
    refreshedTouches,
    receiptsCreated,
    failed,
  });
}
