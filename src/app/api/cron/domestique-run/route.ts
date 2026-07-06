// Hourly Domestique cron: run the nightly loop for every enabled store whose
// local hour matches its configured run hour (default 3am store-local).

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normaliseConfig } from "@/lib/domestique/config";
import { runDomestiqueForStore } from "@/lib/domestique/run";
import type { DomestiqueConfig } from "@/lib/types/domestique";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function localHour(timezone: string, now: Date): number {
  try {
    const formatted = new Intl.DateTimeFormat("en-AU", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(now);
    const hour = parseInt(formatted, 10);
    return Number.isFinite(hour) ? hour % 24 : now.getUTCHours();
  } catch {
    return now.getUTCHours();
  }
}

function ranToday(lastRunAt: string | null, timezone: string, now: Date): boolean {
  if (!lastRunAt) return false;
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, dateStyle: "short" });
    return formatter.format(new Date(lastRunAt)) === formatter.format(now);
  } catch {
    return new Date(lastRunAt).toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  }
}

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
  const now = new Date();

  const { data: configs, error } = await supabase
    .from("domestique_config")
    .select("*")
    .eq("is_enabled", true);
  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json({ success: true, stores: 0, note: "domestique tables not migrated yet" });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  let ran = 0;
  let skipped = 0;
  let failed = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const row of (configs ?? []) as Array<Partial<DomestiqueConfig> & { user_id: string }>) {
    const config = normaliseConfig(row.user_id, row);
    const due =
      localHour(config.timezone, now) === config.run_hour &&
      !ranToday(config.last_run_at, config.timezone, now);
    if (!due) {
      skipped += 1;
      continue;
    }
    try {
      const summary = await runDomestiqueForStore(supabase, config.user_id, config, "cron");
      ran += 1;
      results.push({ user_id: config.user_id, ...summary });
    } catch (err) {
      failed += 1;
      console.error(`[cron/domestique-run] store ${config.user_id} failed:`, err);
    }
  }

  return NextResponse.json({ success: failed === 0, stores: configs?.length ?? 0, ran, skipped, failed, results });
}
