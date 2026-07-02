/**
 * Resend webhook for CRM campaign analytics (opens, clicks, delivery, bounces).
 *
 * POST /api/crm/resend-webhook
 *
 * Configure in Resend dashboard → Webhooks with events:
 * email.delivered, email.opened, email.clicked, email.bounced
 *
 * Set RESEND_WEBHOOK_SECRET in Vercel env (signing secret from Resend).
 */

import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { processResendWebhookEvent, type ResendWebhookEvent } from "@/lib/crm/analytics";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = (process.env.RESEND_WEBHOOK_SECRET || "").trim();
  const payload = await request.text();

  let event: ResendWebhookEvent;
  try {
    if (secret) {
      const wh = new Webhook(secret);
      event = wh.verify(payload, {
        "svix-id": request.headers.get("svix-id") ?? "",
        "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
        "svix-signature": request.headers.get("svix-signature") ?? "",
      }) as ResendWebhookEvent;
    } else {
      // Allow unverified processing in dev when secret isn't configured.
      event = JSON.parse(payload) as ResendWebhookEvent;
    }
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const result = await processResendWebhookEvent(supabase, event);

  return NextResponse.json({ ok: true, ...result });
}
