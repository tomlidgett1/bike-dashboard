/**
 * SMSbroadcast account balance
 *
 * GET /api/store/crm/sms-broadcast/balance
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSmsBroadcastBalance } from "@/lib/sms/smsbroadcast";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const result = await getSmsBroadcastBalance();
    return NextResponse.json({
      balance: result.balance,
      credits: Math.floor(result.balance),
    });
  } catch (error) {
    console.error("[crm] smsbroadcast balance failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load SMS credits" },
      { status: 502 },
    );
  }
}
