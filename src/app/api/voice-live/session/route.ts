/**
 * POST /api/voice-live/session
 *
 * Issues a short-lived Azure Speech STS token and Voice Live WebSocket URL
 * for browser-based speech-to-speech testing (MAI-Transcribe + MAI-Voice-2).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { VOICE_LIVE_API_VERSION, VOICE_LIVE_MODEL } from "@/lib/voice-live/config";

export const dynamic = "force-dynamic";

function resolveSpeechHost(): string | null {
  const endpoint = process.env.AZURE_SPEECH_ENDPOINT?.trim();
  if (endpoint) {
    return endpoint.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }

  const region = process.env.AZURE_SPEECH_REGION?.trim();
  if (region) {
    return `${region}.api.cognitive.microsoft.com`;
  }

  return null;
}

async function issueSpeechToken(host: string, apiKey: string): Promise<string> {
  const response = await fetch(`https://${host}/sts/v1.0/issueToken`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": "0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Azure STS token failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  return response.text();
}

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("account_type, bicycle_store")
      .eq("user_id", user.id)
      .single();

    if (!profile || profile.account_type !== "bicycle_store" || !profile.bicycle_store) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const apiKey = process.env.AZURE_SPEECH_KEY?.trim();
    const host = resolveSpeechHost();

    if (!apiKey || !host) {
      return NextResponse.json(
        {
          error: "server_missing_azure_speech_config",
          message:
            "Set AZURE_SPEECH_KEY and AZURE_SPEECH_ENDPOINT (or AZURE_SPEECH_REGION) in your environment.",
        },
        { status: 503 },
      );
    }

    const token = await issueSpeechToken(host, apiKey);

    const params = new URLSearchParams({
      "api-version": VOICE_LIVE_API_VERSION,
      model: VOICE_LIVE_MODEL,
      authorization: `Bearer ${token}`,
    });

    const websocketUrl = `wss://${host}/voice-live/realtime?${params.toString()}`;

    return NextResponse.json({
      websocketUrl,
      apiVersion: VOICE_LIVE_API_VERSION,
      model: VOICE_LIVE_MODEL,
      expiresInSeconds: 600,
    });
  } catch (error) {
    console.error("[voice-live/session]", error);
    return NextResponse.json(
      {
        error: "voice_live_session_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}
