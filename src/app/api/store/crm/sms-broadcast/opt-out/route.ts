/**
 * SMSbroadcast opt-out link/snippet for compose.
 *
 * GET /api/store/crm/sms-broadcast/opt-out
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSmsBroadcastOptOut } from "@/lib/sms/smsbroadcast";

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

    const optOut = getSmsBroadcastOptOut();
    return NextResponse.json(optOut);
  } catch (error) {
    console.error("[crm] smsbroadcast opt-out failed:", error);
    return NextResponse.json({ error: "Failed to load opt-out settings" }, { status: 500 });
  }
}
