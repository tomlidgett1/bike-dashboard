import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmContactSort } from "@/lib/crm/types";
import { buildContactSearchOrFilter } from "@/lib/crm/contact-search";
import { fetchAllPostgrestPages } from "@/lib/crm/postgrest-page";

export type ContactListFilter = "all" | "opted_in" | "opted_out";

const SORT_OPTIONS: Record<CrmContactSort, { column: string; ascending: boolean }> = {
  recent: { column: "created_at", ascending: false },
  name_asc: { column: "first_name", ascending: true },
  joined_newest: { column: "lightspeed_joined_at", ascending: false },
  joined_oldest: { column: "lightspeed_joined_at", ascending: true },
  spend_high: { column: "total_spend", ascending: false },
  spend_low: { column: "total_spend", ascending: true },
  visits_high: { column: "sale_count", ascending: false },
  visits_low: { column: "sale_count", ascending: true },
  last_purchase: { column: "last_purchase_at", ascending: false },
};

type ContactListQueryArgs = {
  supabase: SupabaseClient;
  userId: string;
  search?: string;
  filter?: ContactListFilter;
  sort?: CrmContactSort;
  groupId?: string;
};

async function resolveGroupContactIds(
  supabase: SupabaseClient,
  userId: string,
  groupId: string,
): Promise<string[] | null> {
  if (!groupId) return null;
  const { data: members } = await supabase
    .from("crm_contact_group_members")
    .select("contact_id")
    .eq("user_id", userId)
    .eq("group_id", groupId);
  return (members ?? []).map((row) => String(row.contact_id));
}

export function applyContactListFilters<T extends { eq: Function; or: Function; in: Function }>(
  query: T,
  args: {
    search?: string;
    filter?: ContactListFilter;
    contactIdsInGroup?: string[] | null;
    selectableOnly?: boolean;
  },
): T {
  let next = query;
  if (args.contactIdsInGroup) next = next.in("id", args.contactIdsInGroup) as T;
  if (args.filter === "opted_in") next = next.eq("opted_out", false) as T;
  if (args.filter === "opted_out") next = next.eq("opted_out", true) as T;
  if (args.selectableOnly) next = next.eq("opted_out", false) as T;

  const search = (args.search ?? "").trim();
  if (search) {
    const searchFilter = buildContactSearchOrFilter(search);
    if (searchFilter) next = next.or(searchFilter) as T;
  }

  return next;
}

export async function countContactsMatchingList(args: ContactListQueryArgs): Promise<number> {
  const contactIdsInGroup = args.groupId
    ? await resolveGroupContactIds(args.supabase, args.userId, args.groupId)
    : null;
  if (args.groupId && contactIdsInGroup?.length === 0) return 0;

  let query = args.supabase
    .from("crm_contacts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.userId);

  query = applyContactListFilters(query, {
    search: args.search,
    filter: args.filter,
    contactIdsInGroup,
  });

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function countSelectableContactsMatchingList(
  args: ContactListQueryArgs,
): Promise<number> {
  if (args.filter === "opted_out") return 0;

  const contactIdsInGroup = args.groupId
    ? await resolveGroupContactIds(args.supabase, args.userId, args.groupId)
    : null;
  if (args.groupId && contactIdsInGroup?.length === 0) return 0;

  let query = args.supabase
    .from("crm_contacts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.userId);

  query = applyContactListFilters(query, {
    search: args.search,
    filter: args.filter,
    contactIdsInGroup,
    selectableOnly: args.filter === "all",
  });

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function fetchSelectableContactIds(args: ContactListQueryArgs): Promise<string[]> {
  if (args.filter === "opted_out") return [];

  const contactIdsInGroup = args.groupId
    ? await resolveGroupContactIds(args.supabase, args.userId, args.groupId)
    : null;
  if (args.groupId && contactIdsInGroup?.length === 0) return [];

  const sortConfig = SORT_OPTIONS[args.sort ?? "recent"] ?? SORT_OPTIONS.recent;

  const rows = await fetchAllPostgrestPages<{ id: string }>({
    fetchPage: (from, to) => {
      let query = args.supabase
        .from("crm_contacts")
        .select("id")
        .eq("user_id", args.userId)
        .order(sortConfig.column, { ascending: sortConfig.ascending, nullsFirst: false })
        .order("email", { ascending: true })
        .range(from, to);

      query = applyContactListFilters(query, {
        search: args.search,
        filter: args.filter,
        contactIdsInGroup,
        selectableOnly: args.filter === "all",
      });

      return query;
    },
  });

  return rows.map((row) => String(row.id));
}
