import { NextRequest, NextResponse } from "next/server";
import { processDueCrmSchedules } from "@/lib/crm/agent/automation";
import { processLifecycleStores } from "@/lib/crm/lifecycle/engine";

/**
 * Runs every 5 minutes via Vercel cron. Two jobs share the slot:
 * 1. Scheduled agent campaigns once scheduled_at (UTC) is due.
 * 2. Lifecycle engine ticks (classification / planning / attribution are
 *    internally gated, so most ticks are cheap no-ops).
 */
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

    let lifecycle: Awaited<ReturnType<typeof processLifecycleStores>> | { errors: string[] };
    try {
      lifecycle = await processLifecycleStores();
    } catch (error) {
      console.error("[CRM Automation Cron] lifecycle tick failed:", error);
      lifecycle = { errors: [error instanceof Error ? error.message : "Lifecycle tick failed"] };
    }

    const ok = summary.failed === 0 && lifecycle.errors.length === 0;
    return NextResponse.json(
      { success: ok, crm_automation: summary, lifecycle },
      { status: ok ? 200 : 207 },
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
