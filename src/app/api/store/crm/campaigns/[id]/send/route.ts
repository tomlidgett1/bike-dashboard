/**
 * CRM campaign send
 *
 * POST /api/store/crm/campaigns/[id]/send
 *
 * Guardrails enforced here (not just in the UI):
 * - sender must be configured (RESEND_API_KEY + CRM_FROM_EMAIL/FROM_EMAIL)
 * - subject and body content must be non-empty
 * - opted-out and invalid contacts are skipped even if rows exist
 * - the draft→sending transition is atomic, so a campaign can only ever be
 *   sent once — duplicating into a new campaign is the only way to resend
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendCrmCampaign } from "@/lib/crm/send-campaign";
import { getCrmEmailProvider } from "@/lib/crm/email-provider";

export const maxDuration = 300;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const provider = await getCrmEmailProvider();
  if (!provider) {
    return NextResponse.json(
      {
        error:
          "Email sending is not configured. Check the crm-send-campaign-emails edge function and its RESEND_API_KEY / FROM_EMAIL secrets (see docs/CRM_EMAIL.md).",
      },
      { status: 409 },
    );
  }

  try {
    const result = await sendCrmCampaign(supabase, user.id, id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[crm] campaign send failed:", error);
    const message = error instanceof Error ? error.message : "Send failed";
    const status =
      message === "Campaign not found"
        ? 404
        : message === "Campaign already sent"
          ? 409
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
