/**
 * All selectable contact IDs for the current list filters (bulk select).
 *
 * GET /api/store/crm/contacts/bulk-ids?search=&filter=&sort=&groupId=
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  countSelectableContactsMatchingList,
  fetchSelectableContactIds,
  type ContactListFilter,
} from "@/lib/crm/contact-list-query";
import type { CrmContactSort } from "@/lib/crm/types";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const search = (searchParams.get("search") ?? "").trim();
    const filter = (searchParams.get("filter") ?? "all") as ContactListFilter;
    const sort = (searchParams.get("sort") ?? "recent") as CrmContactSort;
    const groupId = (searchParams.get("groupId") ?? "").trim();

    const queryArgs = {
      supabase,
      userId: user.id,
      search,
      filter,
      sort,
      groupId,
    };

    const [contactIds, count] = await Promise.all([
      fetchSelectableContactIds(queryArgs),
      countSelectableContactsMatchingList(queryArgs),
    ]);

    return NextResponse.json({ contactIds, count });
  } catch (error) {
    console.error("[crm] contacts bulk-ids failed:", error);
    return NextResponse.json({ error: "Failed to load contact IDs" }, { status: 500 });
  }
}
