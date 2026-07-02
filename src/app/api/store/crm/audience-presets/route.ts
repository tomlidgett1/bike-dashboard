/**
 * CRM audience presets — save and reuse targeting rules.
 *
 * GET  /api/store/crm/audience-presets
 * POST /api/store/crm/audience-presets
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AudienceRule } from "@/lib/crm/agent/types";

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
      .from("crm_audience_presets")
      .select("id, name, description, prompt, audience_rules, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ presets: data ?? [] });
  } catch (error) {
    console.error("[crm] audience presets list failed:", error);
    return NextResponse.json({ error: "Failed to load presets" }, { status: 500 });
  }
}

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

    const body = (await request.json()) as {
      name?: string;
      description?: string;
      prompt?: string;
      audienceRules?: AudienceRule[];
    };
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("crm_audience_presets")
      .insert({
        user_id: user.id,
        name,
        description: body.description?.trim() || null,
        prompt: body.prompt?.trim() || null,
        audience_rules: Array.isArray(body.audienceRules) ? body.audienceRules : [],
      })
      .select("id, name, description, prompt, audience_rules, created_at, updated_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ preset: data });
  } catch (error) {
    console.error("[crm] audience preset create failed:", error);
    return NextResponse.json({ error: "Failed to save preset" }, { status: 500 });
  }
}
