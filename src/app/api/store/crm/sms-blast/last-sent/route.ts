/**
 * Last SMSbroadcast send per phone for the current store.
 *
 * GET /api/store/crm/sms-blast/last-sent
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSmsLastSentEntries } from "@/lib/sms/sms-sends";

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

    const entries = await getSmsLastSentEntries({ supabase, userId: user.id });
    const byPhone = Object.fromEntries(entries.map((entry) => [entry.phone, entry.lastSentAt]));

    return NextResponse.json({ entries, byPhone });
  } catch (error) {
    console.error("[crm] sms last-sent failed:", error);
    return NextResponse.json({ error: "Failed to load last SMS dates" }, { status: 500 });
  }
}
