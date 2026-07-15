/**
 * SMSbroadcast opt-out list for the current store.
 *
 * GET /api/store/crm/sms-opt-outs
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanSmsPhone, isValidSmsPhone } from "@/lib/sms/smsbroadcast";
import { getSmsOptedOutPhoneSet } from "@/lib/sms/sms-opt-outs";

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

    const [{ data: optOutRows, error: optOutError }, { data: contacts, error: contactsError }] =
      await Promise.all([
        supabase
          .from("store_sms_opt_outs")
          .select("phone, opted_out_at, reason, source")
          .eq("user_id", user.id)
          .order("opted_out_at", { ascending: false }),
        supabase
          .from("crm_contacts")
          .select("id, email, first_name, last_name, phone")
          .eq("user_id", user.id)
          .not("phone", "is", null),
      ]);

    if (optOutError) throw optOutError;
    if (contactsError) throw contactsError;

    const optedOutPhones = await getSmsOptedOutPhoneSet({ supabase, userId: user.id });
    const contactByPhone = new Map<string, (typeof contacts)[number]>();
    for (const contact of contacts ?? []) {
      if (!isValidSmsPhone(contact.phone)) continue;
      contactByPhone.set(cleanSmsPhone(contact.phone!), contact);
    }

    const entries = (optOutRows ?? []).map((row) => {
      const phone = cleanSmsPhone(String(row.phone));
      const contact = contactByPhone.get(phone);
      const name = contact
        ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email
        : phone;
      return {
        phone,
        name,
        contactId: contact?.id ?? null,
        optedOutAt: row.opted_out_at,
        reason: row.reason,
        source: row.source,
      };
    });

    return NextResponse.json({
      count: optedOutPhones.size,
      entries,
      phones: Array.from(optedOutPhones),
    });
  } catch (error) {
    console.error("[crm] sms opt-outs list failed:", error);
    return NextResponse.json({ error: "Failed to load SMS opt-outs" }, { status: 500 });
  }
}
