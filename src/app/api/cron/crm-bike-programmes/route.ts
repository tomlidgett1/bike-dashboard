import { NextRequest, NextResponse } from "next/server";
import { runBikeStoreProgrammesForEnabledStores } from "@/lib/crm/bike-programme-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handleBikeProgrammes(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && request.headers.get("authorization") !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }

  try {
    const result = await runBikeStoreProgrammesForEnabledStores({ maxStores: 20 });
    return NextResponse.json(
      { success: result.failed === 0, programmes: result },
      { status: result.failed === 0 ? 200 : 207 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bike programme run failed";
    console.error("[CRM bike programmes] Failed:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleBikeProgrammes(request);
}

export async function POST(request: NextRequest) {
  return handleBikeProgrammes(request);
}
