/**
 * POST /twiml-inbound
 * Proxies Twilio voice webhooks to the local OpenAI Realtime bridge.
 * Use when ngrok tunnels to Next.js (:3000) instead of the bridge (:8080).
 * Media stream WebSocket must still be reachable at PHONE_AI_BRIDGE_URL/media.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BRIDGE_BASE = process.env.PHONE_AI_BRIDGE_INTERNAL_URL ?? "http://127.0.0.1:8080";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const headers = new Headers();
  const signature = request.headers.get("x-twilio-signature");
  if (signature) headers.set("x-twilio-signature", signature);
  headers.set("content-type", request.headers.get("content-type") ?? "application/x-www-form-urlencoded");

  try {
    const response = await fetch(`${BRIDGE_BASE}/twiml-inbound`, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
    });
    const twiml = await response.text();
    return new NextResponse(twiml, {
      status: response.status,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("[twiml-inbound proxy]", error);
    return new NextResponse("Bridge unreachable", { status: 502 });
  }
}
