import { NextRequest, NextResponse } from "next/server";
import { processDueCrmSchedules } from "@/lib/crm/agent/automation";

/** Runs every 5 minutes via Vercel cron; picks up schedules once scheduled_at (UTC) is due. */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function verifyCron(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  return request.headers.get("x-vercel-cron") === "1";
}

async function handleCron(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }

  try {
    const summary = await processDueCrmSchedules();
    return NextResponse.json(
      { success: summary.failed === 0, crm_automation: summary },
      { status: summary.failed === 0 ? 200 : 207 },
    );
  } catch (error) {
    console.error("[CRM Automation Cron] Failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "CRM automation cron failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}
