/**
 * SMSbroadcast webhooks
 *
 * POST /api/webhooks/smsbroadcast?userId=<store-user-uuid>
 *
 * Configure in SMSbroadcast: Settings → API Settings → Webhooks
 * - SMS → Opt-out occurred
 * - (optional) SMS → Receive SMS — treats STOP keywords as opt-out
 *
 * Set SMSBROADCAST_WEBHOOK_SECRET in env and add header x-smsbroadcast-secret.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  extractPhoneFromSmsbroadcastPayload,
  isSmsStopMessage,
  recordSmsOptOut,
  removeSmsOptOut,
} from "@/lib/sms/sms-opt-outs";

const START_KEYWORDS = new Set(["start", "unstop", "yes", "subscribe"]);

function parsePayload(request: NextRequest, body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  const params = request.nextUrl.searchParams;
  const fromQuery: Record<string, unknown> = {};
  for (const key of [
    "sourceAddress",
    "destinationAddress",
    "messageContent",
    "replyContent",
    "id",
    "accountId",
  ]) {
    const value = params.get(key);
    if (value) fromQuery[key] = value;
  }
  return fromQuery;
}

function replyContent(payload: Record<string, unknown>): string {
  return String(
    payload.replyContent ?? payload.messageContent ?? payload.moContent ?? payload.text ?? "",
  ).trim();
}

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.SMSBROADCAST_WEBHOOK_SECRET?.trim();
    if (secret) {
      const provided = request.headers.get("x-smsbroadcast-secret");
      if (provided !== secret) {
        return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
      }
    }

    const userId = request.nextUrl.searchParams.get("userId")?.trim();
    if (!userId) {
      return NextResponse.json({ error: "Missing userId query parameter" }, { status: 400 });
    }

    const rawBody = await request.json().catch(() => null);
    const payload = parsePayload(request, rawBody);
    const phone = extractPhoneFromSmsbroadcastPayload(payload);
    if (!phone) {
      return NextResponse.json({ error: "No valid phone in payload" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const message = replyContent(payload);
    const event = String(payload.event ?? payload.action ?? "").toLowerCase();

    if (event.includes("opt-in") || START_KEYWORDS.has(message.toLowerCase())) {
      await removeSmsOptOut({ supabase, userId, phone });
      return NextResponse.json({ ok: true, action: "opted_in", phone });
    }

    const isOptOut =
      event.includes("opt-out") ||
      event.includes("optout") ||
      isSmsStopMessage(message);

    if (!isOptOut) {
      return NextResponse.json({ ok: true, action: "ignored" });
    }

    await recordSmsOptOut({
      supabase,
      userId,
      phone,
      reason: message || "smsbroadcast_opt_out",
      source: "smsbroadcast_webhook",
    });

    return NextResponse.json({ ok: true, action: "opted_out", phone });
  } catch (error) {
    console.error("[smsbroadcast webhook] failed:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
