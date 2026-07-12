import { NextRequest, NextResponse } from "next/server";
import { updateMyGarageConsent, type MyGarageConsent } from "@/lib/crm/my-garage";

const CHANNELS = new Set<MyGarageConsent["channel"]>(["email", "sms", "voice", "push"]);
const PURPOSES = new Set<MyGarageConsent["purpose"]>(["marketing", "service", "transactional", "community"]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as {
      token?: unknown;
      channel?: unknown;
      purpose?: unknown;
      granted?: unknown;
    } | null;
    const token = typeof body?.token === "string" ? body.token : "";
    const channel = body?.channel as MyGarageConsent["channel"];
    const purpose = body?.purpose as MyGarageConsent["purpose"];
    if (!token || !CHANNELS.has(channel) || !PURPOSES.has(purpose) || typeof body?.granted !== "boolean") {
      return NextResponse.json({ error: "Invalid communication preference." }, { status: 400 });
    }

    await updateMyGarageConsent({ token, channel, purpose, granted: body.granted });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update communication preference.";
    console.error("[my-garage/consent] POST failed:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
