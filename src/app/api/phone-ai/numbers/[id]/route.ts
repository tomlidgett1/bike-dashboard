/**
 * PATCH /api/phone-ai/numbers/[id]
 * DELETE /api/phone-ai/numbers/[id]
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isErrorResponse, requireVerifiedStore } from "@/lib/phone-ai/auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireVerifiedStore();
  if (isErrorResponse(auth)) return auth;

  const { id } = await context.params;
  const body = (await request.json()) as {
    label?: string;
    enabled?: boolean;
    openaiModel?: string;
    voice?: string;
    instructions?: string;
  };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.label !== undefined) patch.label = body.label.trim();
  if (body.enabled !== undefined) patch.enabled = body.enabled;
  if (body.openaiModel !== undefined) patch.openai_model = body.openaiModel.trim();
  if (body.voice !== undefined) patch.voice = body.voice.trim();
  if (body.instructions !== undefined) patch.instructions = body.instructions.trim();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("phone_ai_numbers")
    .update(patch)
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ number: data });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireVerifiedStore();
  if (isErrorResponse(auth)) return auth;

  const { id } = await context.params;
  const supabase = await createClient();

  const { error } = await supabase
    .from("phone_ai_numbers")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
