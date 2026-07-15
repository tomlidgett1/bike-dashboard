import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidSmsPhone, cleanSmsPhone } from "@/lib/sms/smsbroadcast";
import { getSmsOptedOutPhoneSet } from "@/lib/sms/sms-opt-outs";
import { fetchAllPostgrestPages, POSTGREST_PAGE_SIZE } from "@/lib/crm/postgrest-page";

export type SmsRecipientMode = "all" | "selected" | "group";

export type SmsRecipient = {
  id: string;
  phone: string;
  first_name: string | null;
  last_name: string | null;
};

export type ResolveSmsRecipientsResult = {
  recipients: SmsRecipient[];
  optedOutCount: number;
  excludedNoPhone: number;
};

type ContactRow = {
  id: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
};

export async function resolveSmsRecipients(args: {
  supabase: SupabaseClient;
  userId: string;
  recipientMode: SmsRecipientMode;
  contactIds?: string[];
  groupId?: string;
  extraPhones?: string[];
}): Promise<ResolveSmsRecipientsResult> {
  const {
    supabase,
    userId,
    recipientMode,
    contactIds = [],
    groupId = "",
    extraPhones = [],
  } = args;
  let candidates: ContactRow[] = [];

  if (recipientMode === "group") {
    const members = await fetchAllPostgrestPages({
      fetchPage: (from, to) =>
        supabase
          .from("crm_contact_group_members")
          .select("contact_id, crm_contacts(id, phone, first_name, last_name)")
          .eq("user_id", userId)
          .eq("group_id", groupId)
          .order("contact_id", { ascending: true })
          .range(from, to),
      pageSize: POSTGREST_PAGE_SIZE,
    });
    candidates = members
      .map((row) => {
        const contact = row.crm_contacts;
        if (!contact || Array.isArray(contact)) return null;
        return contact as ContactRow;
      })
      .filter((contact): contact is ContactRow => !!contact);
  } else if (recipientMode === "selected") {
    const ids = contactIds.slice(0, 10000);
    for (let i = 0; i < ids.length; i += 500) {
      const batch = ids.slice(i, i + 500);
      const { data, error } = await supabase
        .from("crm_contacts")
        .select("id, phone, first_name, last_name")
        .eq("user_id", userId)
        .in("id", batch);
      if (error) throw error;
      candidates.push(...(data ?? []));
    }
  } else {
    candidates = await fetchAllPostgrestPages({
      fetchPage: (from, to) =>
        supabase
          .from("crm_contacts")
          .select("id, phone, first_name, last_name")
          .eq("user_id", userId)
          .order("id", { ascending: true })
          .range(from, to),
      pageSize: POSTGREST_PAGE_SIZE,
    });
  }

  const smsOptedOutPhones = await getSmsOptedOutPhoneSet({ supabase, userId });
  let optedOutCount = 0;
  let excludedNoPhone = 0;
  const recipients: SmsRecipient[] = [];
  const seenPhones = new Set<string>();

  for (const contact of candidates) {
    if (!isValidSmsPhone(contact.phone)) {
      excludedNoPhone++;
      continue;
    }
    const phone = cleanSmsPhone(contact.phone!);
    if (smsOptedOutPhones.has(phone)) {
      optedOutCount++;
      continue;
    }
    if (seenPhones.has(phone)) continue;
    seenPhones.add(phone);
    recipients.push({
      id: contact.id,
      phone,
      first_name: contact.first_name,
      last_name: contact.last_name,
    });
  }

  for (const rawPhone of extraPhones) {
    if (!isValidSmsPhone(rawPhone)) continue;
    const phone = cleanSmsPhone(rawPhone);
    if (smsOptedOutPhones.has(phone)) {
      optedOutCount++;
      continue;
    }
    if (seenPhones.has(phone)) continue;
    seenPhones.add(phone);
    recipients.push({
      id: `phone:${phone}`,
      phone,
      first_name: null,
      last_name: null,
    });
  }

  return { recipients, optedOutCount, excludedNoPhone };
}
