/**
 * Saved CRM email templates.
 *
 * GET    /api/store/crm/templates            → { templates } (with content for previews)
 * POST   /api/store/crm/templates            → save current design { name, description?, subject, templateKey, content }
 * DELETE /api/store/crm/templates?id=<uuid>  → remove a template
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CampaignContent } from "@/lib/crm/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("crm_email_templates")
    .select("id, name, description, subject, template_key, content, use_count, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    description?: string;
    subject?: string;
    templateKey?: string;
    content?: CampaignContent;
  } | null;

  const name = String(body?.name ?? "").trim();
  const subject = String(body?.subject ?? "").trim();
  const content = body?.content;
  if (!name || name.length > 80) {
    return NextResponse.json({ error: "Template name is required (max 80 chars)" }, { status: 400 });
  }
  if (!subject || !content || typeof content !== "object") {
    return NextResponse.json({ error: "Subject and content are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_email_templates")
    .upsert(
      {
        user_id: user.id,
        name,
        description: String(body?.description ?? "").trim() || null,
        subject,
        template_key: String(body?.templateKey ?? "store_announcement"),
        content,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,name" },
    )
    .select("id, name, description, subject, template_key, content, use_count, updated_at")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Save failed" }, { status: 500 });
  }

  return NextResponse.json({ template: data });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Template id is required" }, { status: 400 });

  const { error } = await supabase
    .from("crm_email_templates")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
