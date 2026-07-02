/**
 * CRM customer groups
 *
 * GET  /api/store/crm/groups — list groups with member counts
 * POST /api/store/crm/groups — create group { name, description?, contactIds? }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    const { data: groups, error } = await supabase
      .from("crm_contact_groups")
      .select("id, name, description, created_at, updated_at")
      .eq("user_id", user.id)
      .order("name");

    if (error) throw error;

    const groupIds = (groups ?? []).map((group) => group.id);
    const counts = new Map<string, number>();
    if (groupIds.length > 0) {
      const { data: members } = await supabase
        .from("crm_contact_group_members")
        .select("group_id")
        .eq("user_id", user.id)
        .in("group_id", groupIds);
      for (const member of members ?? []) {
        const id = String(member.group_id);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }

    return NextResponse.json({
      groups: (groups ?? []).map((group) => ({
        ...group,
        member_count: counts.get(group.id) ?? 0,
      })),
    });
  } catch (error) {
    console.error("[crm] groups list failed:", error);
    return NextResponse.json({ error: "Failed to load groups" }, { status: 500 });
  }
}

type CreateBody = {
  name?: string;
  description?: string;
  contactIds?: string[];
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const body = (await request.json()) as CreateBody;
    const name = String(body.name ?? "").trim();
    const description = String(body.description ?? "").trim() || null;
    const contactIds = Array.isArray(body.contactIds) ? body.contactIds.slice(0, 10000) : [];

    if (!name) {
      return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    }

    const { data: group, error } = await supabase
      .from("crm_contact_groups")
      .insert({ user_id: user.id, name, description })
      .select("id, name, description, created_at, updated_at")
      .single();
    if (error || !group) throw error ?? new Error("Insert failed");

    if (contactIds.length > 0) {
      const rows = contactIds.map((contactId) => ({
        group_id: group.id,
        contact_id: contactId,
        user_id: user.id,
      }));
      for (let i = 0; i < rows.length; i += 500) {
        await supabase.from("crm_contact_group_members").insert(rows.slice(i, i + 500));
      }
    }

    return NextResponse.json({
      group: { ...group, member_count: contactIds.length },
    });
  } catch (error) {
    console.error("[crm] group create failed:", error);
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }
}
