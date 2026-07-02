/**
 * Accept AI-recommended groups — creates smart groups and materialises their
 * membership from the stored rules.
 *
 * POST /api/store/crm/groups/accept
 * Body: { proposals: [{ name, description, reason, rules }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSmartGroup } from "@/lib/crm/smart-groups";
import type { AudienceRule } from "@/lib/crm/agent/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type AcceptProposal = {
  name?: string;
  description?: string;
  reason?: string;
  rules?: AudienceRule[];
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

    const body = (await request.json().catch(() => null)) as { proposals?: AcceptProposal[] } | null;
    const proposals = (body?.proposals ?? [])
      .filter(
        (proposal) =>
          String(proposal?.name ?? "").trim() &&
          Array.isArray(proposal?.rules) &&
          proposal.rules.length > 0,
      )
      .slice(0, 12);

    if (proposals.length === 0) {
      return NextResponse.json({ error: "No valid proposals to add" }, { status: 400 });
    }

    const created: Array<{ groupId: string; name: string; count: number }> = [];
    for (const proposal of proposals) {
      const result = await createSmartGroup(supabase, user.id, {
        name: String(proposal.name),
        description: String(proposal.description ?? ""),
        reason: String(proposal.reason ?? ""),
        rules: proposal.rules as AudienceRule[],
      });
      created.push({ groupId: result.groupId, name: String(proposal.name), count: result.count });
    }

    return NextResponse.json({ created });
  } catch (error) {
    console.error("[crm] group accept failed:", error);
    return NextResponse.json({ error: "Failed to create groups" }, { status: 500 });
  }
}
