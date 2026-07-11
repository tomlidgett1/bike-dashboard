/**
 * Lifecycle CRM machine — overview + settings.
 *
 * GET   /api/store/crm/lifecycle — full overview for the Lifecycle tab
 * PATCH /api/store/crm/lifecycle — update engine settings (enable, caps…)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadLifecycleOverview } from "@/lib/crm/lifecycle/overview";
import {
  upsertLifecycleSettings,
  type LifecycleSettingsUpdate,
} from "@/lib/crm/lifecycle/settings";

export const dynamic = "force-dynamic";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { supabase, userId: null as string | null };
  return { supabase, userId: user.id };
}

export async function GET() {
  try {
    const { supabase, userId } = await requireUser();
    if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const overview = await loadLifecycleOverview(supabase, userId);
    return NextResponse.json({ overview });
  } catch (error) {
    console.error("[crm/lifecycle] GET failed:", error);
    return NextResponse.json({ error: "Failed to load lifecycle overview" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, userId } = await requireUser();
    if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const update: LifecycleSettingsUpdate = {};
    if (typeof body.is_enabled === "boolean") update.is_enabled = body.is_enabled;
    if (typeof body.timezone === "string" && body.timezone) update.timezone = body.timezone;
    if (Number.isFinite(Number(body.frequency_cap_days))) {
      update.frequency_cap_days = Math.min(60, Math.max(1, Math.round(Number(body.frequency_cap_days))));
    }
    if (Number.isFinite(Number(body.holdout_percent))) {
      update.holdout_percent = Math.min(50, Math.max(0, Math.round(Number(body.holdout_percent))));
    }
    if (Number.isFinite(Number(body.attribution_window_days))) {
      update.attribution_window_days = Math.min(
        90,
        Math.max(1, Math.round(Number(body.attribution_window_days))),
      );
    }

    const settings = await upsertLifecycleSettings(supabase, userId, update);
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[crm/lifecycle] PATCH failed:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
