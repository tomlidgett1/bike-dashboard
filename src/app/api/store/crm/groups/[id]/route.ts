/**
 * CRM customer group detail
 *
 * GET    /api/store/crm/groups/[id] — members
 * PATCH  /api/store/crm/groups/[id] — update name/description, add/remove members
 * DELETE /api/store/crm/groups/[id]
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type GroupMemberRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  opted_out: boolean;
};

async function loadGroupMembers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  groupId: string,
): Promise<GroupMemberRow[]> {
  const members: GroupMemberRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error: membersError } = await supabase
      .from("crm_contact_group_members")
      .select("contact_id, crm_contacts(id, email, first_name, last_name, opted_out)")
      .eq("user_id", userId)
      .eq("group_id", groupId)
      .order("contact_id")
      .range(offset, offset + 999);
    if (membersError) throw membersError;
    for (const row of data ?? []) {
      const raw = row.crm_contacts as unknown;
      const contact = (Array.isArray(raw) ? raw[0] : raw) as GroupMemberRow | null | undefined;
      if (contact) members.push(contact);
    }
    if (!data || data.length < 1000) break;
  }
  return members;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { id } = await params;
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { data: group, error } = await supabase
      .from("crm_contact_groups")
      .select("id, name, description, created_at, updated_at")
      .eq("user_id", user.id)
      .eq("id", id)
      .single();
    if (error || !group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const search = request.nextUrl.searchParams.get("search")?.trim().toLowerCase() ?? "";
    const offset = Math.max(0, Number.parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10) || 0);
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit =
      limitParam == null ? null : Math.min(200, Math.max(1, Number.parseInt(limitParam, 10) || 50));

    const allMembers = await loadGroupMembers(supabase, user.id, id);

    const filtered = search
      ? allMembers.filter((member) => {
          const haystack = [member.first_name, member.last_name, member.email]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(search);
        })
      : allMembers;

    if (limit == null) {
      return NextResponse.json({ group, members: filtered, total: filtered.length });
    }

    return NextResponse.json({
      group,
      members: filtered.slice(offset, offset + limit),
      total: filtered.length,
      offset,
      limit,
    });
  } catch (error) {
    console.error("[crm] group detail failed:", error);
    return NextResponse.json({ error: "Failed to load group" }, { status: 500 });
  }
}

type PatchBody = {
  name?: string;
  description?: string;
  addContactIds?: string[];
  removeContactIds?: string[];
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { id } = await params;
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const body = (await request.json()) as PatchBody;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.description !== undefined) patch.description = String(body.description).trim() || null;

    if (Object.keys(patch).length > 1) {
      await supabase.from("crm_contact_groups").update(patch).eq("id", id).eq("user_id", user.id);
    }

    const addIds = Array.isArray(body.addContactIds) ? body.addContactIds : [];
    if (addIds.length > 0) {
      const rows = addIds.map((contactId) => ({
        group_id: id,
        contact_id: contactId,
        user_id: user.id,
      }));
      await supabase
        .from("crm_contact_group_members")
        .upsert(rows, { onConflict: "group_id,contact_id", ignoreDuplicates: true });
    }

    const removeIds = Array.isArray(body.removeContactIds) ? body.removeContactIds : [];
    if (removeIds.length > 0) {
      await supabase
        .from("crm_contact_group_members")
        .delete()
        .eq("group_id", id)
        .eq("user_id", user.id)
        .in("contact_id", removeIds);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[crm] group update failed:", error);
    return NextResponse.json({ error: "Failed to update group" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { id } = await params;
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { error } = await supabase
      .from("crm_contact_groups")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[crm] group delete failed:", error);
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 });
  }
}
