import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireStoreUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null as null };

  const { data: profile } = await supabase
    .from("users")
    .select("account_type, bicycle_store")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.account_type !== "bicycle_store" || !profile.bicycle_store) {
    return { supabase, user: null as null };
  }
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await requireStoreUser();
  if (!user) return NextResponse.json({ lessons: [] }, { status: 401 });

  try {
    const { data, error } = await supabase
      .from("genie_learned_lessons")
      .select("id, scope, kind, lesson, evidence, source, reinforced_count, active, created_at, updated_at")
      .eq("user_id", user.id)
      .order("active", { ascending: false })
      .order("reinforced_count", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ lessons: [] });
    return NextResponse.json({ lessons: data ?? [] });
  } catch {
    return NextResponse.json({ lessons: [] });
  }
}

export async function PATCH(request: Request) {
  const { supabase, user } = await requireStoreUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { id?: unknown; active?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id || typeof body.active !== "boolean") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { error } = await supabase
    .from("genie_learned_lessons")
    .update({ active: body.active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  return NextResponse.json({ ok: !error });
}

export async function DELETE(request: Request) {
  const { supabase, user } = await requireStoreUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const { error } = await supabase
    .from("genie_learned_lessons")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  return NextResponse.json({ ok: !error });
}
