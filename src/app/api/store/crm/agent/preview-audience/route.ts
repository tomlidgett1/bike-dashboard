/**
 * Preview audience for rules without running full agent.
 *
 * POST /api/store/crm/agent/preview-audience
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAudience } from "@/lib/crm/agent/resolve-audience";
import type { AudienceRule } from "@/lib/crm/agent/types";

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
      rules?: AudienceRule[];
      maxRecipients?: number | null;
    };
    const rules = Array.isArray(body.rules) ? body.rules : [];

    const audience = await resolveAudience(supabase, user.id, rules, body.maxRecipients);
    return NextResponse.json({ audience });
  } catch (error) {
    console.error("[crm] preview-audience failed:", error);
    return NextResponse.json({ error: "Failed to preview audience" }, { status: 500 });
  }
}
