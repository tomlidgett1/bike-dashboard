import { NextRequest, NextResponse } from "next/server";
import { syncCrmMirrorsForConnectedUsers } from "@/lib/services/lightspeed/crm-customer-mirror";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handleCrmMirror(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (expectedSecret && authorization !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }

  try {
    const result = await syncCrmMirrorsForConnectedUsers({ maxUsers: 5 });
    return NextResponse.json(
      {
        success: result.failed === 0,
        mirror: result,
      },
      { status: result.failed === 0 ? 200 : 207 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lightspeed CRM mirror failed";
    console.error("[Lightspeed CRM mirror] Failed:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleCrmMirror(request);
}

export async function POST(request: NextRequest) {
  return handleCrmMirror(request);
}
