/**
 * Send a one-off test of the current campaign draft to any address.
 *
 * POST /api/store/crm/campaigns/test-send
 * Body: { email, subject, templateKey, content }
 *
 * Renders exactly what a recipient would get (merge tags substituted with the
 * owner's first name so personalisation is visible), with a "[Test] " subject
 * prefix. No campaign or recipient rows are created and no stats are touched.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCrmEmailProvider } from "@/lib/crm/email-provider";
import { applyMergeTags } from "@/lib/crm/merge-tags";
import { renderCampaignEmail } from "@/lib/crm/templates";
import { normalizeEmail, type CampaignContent } from "@/lib/crm/types";
import { SITE_URL } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    subject?: string;
    templateKey?: string;
    content?: CampaignContent;
  } | null;

  const email = normalizeEmail(body?.email);
  const subject = String(body?.subject ?? "").trim();
  const content = body?.content;
  if (!email) return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
  if (!subject || !content || typeof content !== "object") {
    return NextResponse.json({ error: "No campaign draft to test — build one first" }, { status: 400 });
  }

  const provider = await getCrmEmailProvider();
  if (!provider) {
    return NextResponse.json({ error: "Email sending is not configured" }, { status: 400 });
  }

  const { data: storeRow } = await supabase
    .from("users")
    .select("business_name, name, logo_url, email")
    .eq("user_id", user.id)
    .maybeSingle();
  const store = {
    name: storeRow?.business_name || storeRow?.name || "Your Bike Store",
    logoUrl: storeRow?.logo_url ?? null,
  };
  const replyTo = normalizeEmail(storeRow?.email) ?? undefined;
  const ownerFirstName = String(storeRow?.name ?? "").trim().split(/\s+/)[0] || null;

  const { html, text } = renderCampaignEmail({
    templateKey: String(body?.templateKey ?? "store_announcement"),
    content,
    store,
    unsubscribeUrl: `${SITE_URL}/unsubscribe?token=test-preview`,
  });

  const [result] = await provider.sendBatch([
    {
      to: email,
      subject: `[Test] ${applyMergeTags(subject, { firstName: ownerFirstName })}`,
      html: applyMergeTags(html, { firstName: ownerFirstName }),
      text: text ? applyMergeTags(text, { firstName: ownerFirstName }) : undefined,
      replyTo,
    },
  ]);

  if (!result?.success) {
    return NextResponse.json({ error: result?.error ?? "Test send failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, to: email });
}
