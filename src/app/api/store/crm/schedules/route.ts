/**
 * CRM scheduled campaigns — automation.
 *
 * GET  /api/store/crm/schedules
 * POST /api/store/crm/schedules
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("crm_scheduled_campaigns")
      .select(
        "id, name, prompt, preset_id, schedule_type, scheduled_at, auto_send, enabled, last_run_at, last_campaign_id, created_at",
      )
      .eq("user_id", user.id)
      .order("scheduled_at", { ascending: true });
    if (error) throw error;

    return NextResponse.json({ schedules: data ?? [] });
  } catch (error) {
    console.error("[crm] schedules list failed:", error);
    return NextResponse.json({ error: "Failed to load schedules" }, { status: 500 });
  }
}

type CreateBody = {
  name?: string;
  prompt?: string;
  presetId?: string;
  scheduleType?: "once" | "weekly" | "monthly";
  scheduledAt?: string;
  autoSend?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const body = (await request.json()) as CreateBody;
    const name = String(body.name ?? "").trim();
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: "Valid scheduled date is required" }, { status: 400 });
    }
    if (!body.prompt?.trim() && !body.presetId) {
      return NextResponse.json({ error: "Prompt or preset is required" }, { status: 400 });
    }

    const scheduleType =
      body.scheduleType === "weekly" || body.scheduleType === "monthly"
        ? body.scheduleType
        : "once";

    const { data, error } = await supabase
      .from("crm_scheduled_campaigns")
      .insert({
        user_id: user.id,
        name,
        prompt: body.prompt?.trim() || null,
        preset_id: body.presetId || null,
        schedule_type: scheduleType,
        scheduled_at: scheduledAt.toISOString(),
        auto_send: Boolean(body.autoSend),
        enabled: true,
      })
      .select(
        "id, name, prompt, preset_id, schedule_type, scheduled_at, auto_send, enabled, last_run_at, last_campaign_id, created_at",
      )
      .single();
    if (error) throw error;

    return NextResponse.json({ schedule: data });
  } catch (error) {
    console.error("[crm] schedule create failed:", error);
    return NextResponse.json({ error: "Failed to create schedule" }, { status: 500 });
  }
}
