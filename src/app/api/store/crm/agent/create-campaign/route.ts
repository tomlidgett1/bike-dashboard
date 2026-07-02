/**
 * Create draft campaign from agent result.
 *
 * POST /api/store/crm/agent/create-campaign
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCampaignFromAgent } from "@/lib/crm/agent/create-campaign";
import type { CampaignContent } from "@/lib/crm/types";

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
      subject?: string;
      templateKey?: string;
      content?: CampaignContent;
      contactIds?: string[];
      agentRunId?: string;
    };

    const result = await createCampaignFromAgent(supabase, user.id, {
      subject: String(body.subject ?? ""),
      templateKey: String(body.templateKey ?? "featured_bikes"),
      content: body.content ?? { title: "", body: "" },
      contactIds: Array.isArray(body.contactIds) ? body.contactIds : [],
      agentRunId: body.agentRunId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[crm] agent create-campaign failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create campaign" },
      { status: 400 },
    );
  }
}
