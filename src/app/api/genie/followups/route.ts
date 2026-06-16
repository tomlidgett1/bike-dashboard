import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateGenieFollowups } from "@/lib/genie/followup-suggestions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ suggestions: [] }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("account_type, bicycle_store, business_name")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.account_type !== "bicycle_store" || !profile.bicycle_store) {
    return NextResponse.json({ suggestions: [] }, { status: 403 });
  }

  let body: { question?: unknown; answer?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ suggestions: [] });
  }

  const question = typeof body.question === "string" ? body.question : "";
  const answer = typeof body.answer === "string" ? body.answer : "";
  if (!question.trim() || !answer.trim()) {
    return NextResponse.json({ suggestions: [] });
  }

  const suggestions = await generateGenieFollowups({
    question,
    answer,
    storeName: profile.business_name ?? null,
  });

  return NextResponse.json({ suggestions });
}
