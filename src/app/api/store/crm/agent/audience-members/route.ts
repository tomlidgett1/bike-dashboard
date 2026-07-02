/**
 * Paginated audience members with inclusion reasons.
 *
 * POST /api/store/crm/agent/audience-members
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAudienceMembersPage } from "@/lib/crm/agent/audience-members";
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
      offset?: number;
      limit?: number;
    };

    const rules = Array.isArray(body.rules) ? body.rules : [];
    const { total, members } = await fetchAudienceMembersPage(supabase, user.id, rules, {
      maxRecipients: body.maxRecipients ?? null,
      offset: body.offset,
      limit: body.limit,
    });

    return NextResponse.json({ total, members, offset: body.offset ?? 0, limit: body.limit ?? 50 });
  } catch (error) {
    console.error("[crm] audience-members failed:", error);
    return NextResponse.json({ error: "Failed to load audience members" }, { status: 500 });
  }
}
