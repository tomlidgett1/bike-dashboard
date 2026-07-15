/**
 * All SMS-blast selectable recipients for browse mode (bulk select).
 *
 * GET /api/store/crm/sms-blast/bulk-recipients?filter=all|opted_in
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPostgrestPages } from "@/lib/crm/postgrest-page";
import { cleanSmsPhone, isValidSmsPhone } from "@/lib/sms/smsbroadcast";
import { getSmsOptedOutPhoneSet } from "@/lib/sms/sms-opt-outs";

type SmsBulkRecipient = {
  key: string;
  contactId: string;
  phone: string;
  name: string;
};

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

    const filter = request.nextUrl.searchParams.get("filter") ?? "all";
    if (filter === "opted_out") {
      return NextResponse.json({ recipients: [], count: 0 });
    }

    const smsOptedOutPhones = await getSmsOptedOutPhoneSet({ supabase, userId: user.id });

    const rows = await fetchAllPostgrestPages<{
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
    }>({
      fetchPage: (from, to) =>
        supabase
          .from("crm_contacts")
          .select("id, email, first_name, last_name, phone")
          .eq("user_id", user.id)
          .order("first_name", { ascending: true, nullsFirst: false })
          .order("last_name", { ascending: true, nullsFirst: false })
          .order("email", { ascending: true })
          .range(from, to),
    });

    const recipients: SmsBulkRecipient[] = [];
    const seenPhones = new Set<string>();

    for (const row of rows) {
      if (!isValidSmsPhone(row.phone)) continue;
      const phone = cleanSmsPhone(row.phone!);
      if (smsOptedOutPhones.has(phone)) continue;
      if (seenPhones.has(phone)) continue;
      seenPhones.add(phone);

      const name = [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email;
      recipients.push({
        key: `crm:${row.id}`,
        contactId: row.id,
        phone,
        name,
      });
    }

    return NextResponse.json({
      recipients,
      count: recipients.length,
    });
  } catch (error) {
    console.error("[crm] sms blast bulk-recipients failed:", error);
    return NextResponse.json({ error: "Failed to load SMS recipients" }, { status: 500 });
  }
}
