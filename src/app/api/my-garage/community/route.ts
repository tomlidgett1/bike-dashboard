import { NextRequest, NextResponse } from "next/server";
import { updateMyGarageAttendance } from "@/lib/crm/my-garage";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as {
      token?: unknown;
      eventId?: unknown;
      registered?: unknown;
    } | null;
    const token = typeof body?.token === "string" ? body.token : "";
    const eventId = typeof body?.eventId === "string" ? body.eventId.trim() : "";
    if (!token || !eventId || typeof body?.registered !== "boolean") {
      return NextResponse.json({ error: "Invalid event registration." }, { status: 400 });
    }

    await updateMyGarageAttendance({ token, eventId, registered: body.registered });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update event registration.";
    console.error("[my-garage/community] POST failed:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
