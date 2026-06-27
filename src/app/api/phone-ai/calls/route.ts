/**
 * GET /api/phone-ai/calls — recent inbound call sessions
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isErrorResponse, requireVerifiedStore } from "@/lib/phone-ai/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireVerifiedStore();
  if (isErrorResponse(auth)) return auth;

  const limit = Math.min(
    Number(request.nextUrl.searchParams.get("limit") ?? "25"),
    100,
  );

  const supabase = await createClient();

  const { data: numbers } = await supabase
    .from("phone_ai_numbers")
    .select("twilio_phone_number_e164")
    .eq("user_id", auth.userId);

  const e164s = (numbers ?? []).map((n) => n.twilio_phone_number_e164).filter(Boolean);
  if (e164s.length === 0) {
    return NextResponse.json({ calls: [] });
  }

  const { data, error } = await supabase
    .from("phone_ai_call_sessions")
    .select("*")
    .in("to_e164", e164s)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ calls: data ?? [] });
}
