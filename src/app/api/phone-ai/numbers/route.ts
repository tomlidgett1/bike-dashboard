/**
 * GET /api/phone-ai/numbers — registered phone AI numbers
 * POST /api/phone-ai/numbers — register a Twilio number for AI answering
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isErrorResponse, requireVerifiedStore } from "@/lib/phone-ai/auth";
import {
  configureTwilioNumberWebhooks,
  getPhoneAiBridgeUrl,
} from "@/lib/phone-ai/twilio";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireVerifiedStore();
  if (isErrorResponse(auth)) return auth;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("phone_ai_numbers")
    .select("*")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ numbers: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireVerifiedStore();
  if (isErrorResponse(auth)) return auth;

  const body = (await request.json()) as {
    twilioPhoneNumberSid?: string;
    twilioPhoneNumberE164?: string;
    label?: string;
    openaiModel?: string;
    voice?: string;
    instructions?: string;
  };

  const sid = body.twilioPhoneNumberSid?.trim();
  const e164 = body.twilioPhoneNumberE164?.trim();
  if (!sid || !e164) {
    return NextResponse.json(
      { error: "twilioPhoneNumberSid and twilioPhoneNumberE164 are required" },
      { status: 400 },
    );
  }

  const bridgeUrl = getPhoneAiBridgeUrl();
  if (!bridgeUrl) {
    return NextResponse.json(
      { error: "PHONE_AI_BRIDGE_URL is not configured" },
      { status: 503 },
    );
  }

  const base = bridgeUrl.replace(/\/$/, "");
  const voiceUrl = `${base}/twiml-inbound`;

  try {
    await configureTwilioNumberWebhooks({
      phoneSid: sid,
      phoneE164: e164,
      voiceUrl,
      statusCallbackUrl: `${base}/twilio/status`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "twilio_webhook_failed",
        message: error instanceof Error ? error.message : "Webhook update failed",
      },
      { status: 502 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("phone_ai_numbers")
    .insert({
      user_id: auth.userId,
      twilio_phone_number_sid: sid,
      twilio_phone_number_e164: e164,
      label: body.label?.trim() || e164,
      openai_model: body.openaiModel?.trim() || "gpt-realtime-2",
      voice: body.voice?.trim() || "marin",
      instructions:
        body.instructions?.trim() ||
        "You are Tom, a helpful phone assistant. Keep replies short and conversational — one or two sentences. Use Australian English.",
      enabled: true,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ number: data });
}
