/**
 * GET /api/phone-ai/health — bridge health proxy
 */

import { NextResponse } from "next/server";
import { isErrorResponse, requireVerifiedStore } from "@/lib/phone-ai/auth";
import { getPhoneAiBridgeUrl } from "@/lib/phone-ai/twilio";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireVerifiedStore();
  if (isErrorResponse(auth)) return auth;

  const bridgeUrl = getPhoneAiBridgeUrl();
  if (!bridgeUrl) {
    return NextResponse.json({
      ok: false,
      bridgeConfigured: false,
      message: "PHONE_AI_BRIDGE_URL is not configured",
    });
  }

  try {
    const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/health`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as Record<string, unknown>;
    return NextResponse.json({
      ok: response.ok,
      bridgeConfigured: true,
      bridgeUrl,
      bridge: payload,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      bridgeConfigured: true,
      bridgeUrl,
      message: error instanceof Error ? error.message : "Bridge unreachable",
    });
  }
}
