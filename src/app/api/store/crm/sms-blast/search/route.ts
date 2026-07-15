/**
 * SMS blast recipient search — CRM contacts + live Lightspeed customers.
 *
 * GET /api/store/crm/sms-blast/search?q=
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildContactSearchOrFilter } from "@/lib/crm/contact-search";
import { cleanSmsPhone, isValidSmsPhone } from "@/lib/sms/smsbroadcast";
import { getSmsOptedOutPhoneSet, isSmsOptedOut } from "@/lib/sms/sms-opt-outs";
import { searchLightspeedCustomersForNest } from "@/lib/services/lightspeed/customer-search";
import { getConnection } from "@/lib/services/lightspeed/token-manager";

export type SmsBlastSearchResult = {
  key: string;
  contactId: string | null;
  lightspeedCustomerId: string | null;
  name: string;
  phone: string;
  source: "crm" | "lightspeed";
  optedOut: boolean;
};

function phoneKey(phone: string): string {
  return cleanSmsPhone(phone).replace(/\D+/g, "");
}

function contactDisplayName(row: {
  first_name: string | null;
  last_name: string | null;
  email: string;
}): string {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
  return name || row.email;
}

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

    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ results: [], lightspeedConnected: true });
    }

    const searchFilter = buildContactSearchOrFilter(q);
    let crmQuery = supabase
      .from("crm_contacts")
      .select("id, email, first_name, last_name, phone, lightspeed_customer_id")
      .eq("user_id", user.id)
      .order("first_name", { ascending: true, nullsFirst: false })
      .order("last_name", { ascending: true, nullsFirst: false })
      .limit(25);

    if (searchFilter) crmQuery = crmQuery.or(searchFilter);

    const connection = await getConnection(user.id);
    const lightspeedConnected = Boolean(
      connection && connection.status !== "disconnected" && connection.status !== "expired",
    );

    const [crmResult, lightspeedResults] = await Promise.all([
      crmQuery,
      lightspeedConnected
        ? searchLightspeedCustomersForNest(user.id, q, 12).catch((error) => {
            console.error("[crm] sms blast lightspeed search failed:", error);
            return [];
          })
        : Promise.resolve([]),
    ]);

    if (crmResult.error) throw crmResult.error;

    const smsOptedOutPhones = await getSmsOptedOutPhoneSet({ supabase, userId: user.id });
    const byPhone = new Map<string, SmsBlastSearchResult>();

    for (const row of crmResult.data ?? []) {
      const hasPhone = isValidSmsPhone(row.phone);
      const phone = hasPhone ? cleanSmsPhone(row.phone!) : "";
      const smsOptedOut = hasPhone ? isSmsOptedOut(phone, smsOptedOutPhones) : false;
      if (!hasPhone && !smsOptedOut) continue;
      const key = hasPhone ? phoneKey(phone) : `crm:${row.id}`;
      if (hasPhone && byPhone.has(key)) continue;
      byPhone.set(key, {
        key: `crm:${row.id}`,
        contactId: row.id,
        lightspeedCustomerId: row.lightspeed_customer_id,
        name: contactDisplayName(row),
        phone,
        source: "crm",
        optedOut: smsOptedOut,
      });
    }

    for (const customer of lightspeedResults) {
      if (!isValidSmsPhone(customer.phone)) continue;
      const phone = cleanSmsPhone(customer.phone);
      const key = phoneKey(phone);
      if (byPhone.has(key)) continue;
      byPhone.set(key, {
        key: `ls:${customer.customerId}`,
        contactId: null,
        lightspeedCustomerId: customer.customerId,
        name: customer.name,
        phone,
        source: "lightspeed",
        optedOut: isSmsOptedOut(phone, smsOptedOutPhones),
      });
    }

    const results = Array.from(byPhone.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "en-AU"),
    );

    return NextResponse.json({
      results,
      lightspeedConnected,
    });
  } catch (error) {
    console.error("[crm] sms blast search failed:", error);
    return NextResponse.json({ error: "Failed to search recipients" }, { status: 500 });
  }
}
