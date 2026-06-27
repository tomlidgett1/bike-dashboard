/**
 * GET /api/phone-ai/twilio-inventory — list Twilio numbers on account
 */

import { NextResponse } from "next/server";
import { isErrorResponse, requireVerifiedStore } from "@/lib/phone-ai/auth";
import { listTwilioIncomingNumbers } from "@/lib/phone-ai/twilio";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireVerifiedStore();
  if (isErrorResponse(auth)) return auth;

  try {
    const numbers = await listTwilioIncomingNumbers();
    return NextResponse.json({ numbers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list Twilio numbers" },
      { status: 502 },
    );
  }
}
