import { NextRequest, NextResponse } from "next/server";
import { processDueCrmSchedules } from "@/lib/crm/agent/automation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handleCron(request: NextRequest) {
  const cronSecret = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
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
