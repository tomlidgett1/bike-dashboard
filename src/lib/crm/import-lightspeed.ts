// Import Lightspeed customers with email addresses into crm_contacts.
//
// Deduped by normalized (lowercase, trimmed) email per store. Re-running the
// import merges metadata into existing contacts but NEVER clears an opt-out —
// unsubscribes are one-way from our side. Customers flagged "noEmail" at the
// Lightspeed POS are imported already opted out so we never mail them.

import type { SupabaseClient } from "@supabase/supabase-js";
import { LightspeedClient } from "@/lib/services/lightspeed/lightspeed-client";
import type {
  LightspeedContactEmail,
  LightspeedContactPhone,
  LightspeedCustomer,
} from "@/lib/services/lightspeed/types";
import { normalizeEmail } from "./types";

export type CrmImportResult = {
  scanned: number;
  imported: number;
  updated: number;
  skippedNoEmail: number;
  hitPageLimit: boolean;
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function extractEmail(customer: LightspeedCustomer): string | null {
  const emails = asArray<LightspeedContactEmail>(customer.Contact?.Emails?.ContactEmail);
  const primary = emails.find((entry) => entry.useType?.toLowerCase() === "primary");
  for (const candidate of [primary, ...emails]) {
    const normalized = normalizeEmail(candidate?.address);
    if (normalized) return normalized;
  }
  return null;
}

function extractPhone(customer: LightspeedCustomer): string | null {
  const contact = customer.Contact;
  if (!contact) return null;
  const flat = [contact.mobile, contact.phoneHome, contact.phoneWork]
    .map((value) => String(value ?? "").trim())
    .find(Boolean);
  if (flat) return flat;

  const phones = asArray<LightspeedContactPhone>(contact.Phones?.ContactPhone);
  const mobile = phones.find((entry) => entry.useType?.toLowerCase() === "mobile");
  const first = mobile ?? phones[0];
  const number = String(first?.number ?? "").trim();
  return number || null;
}

function cleanName(value: string | undefined): string | null {
  const name = String(value ?? "").trim();
  return name || null;
}

type ContactRow = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  lightspeed_customer_id: string | null;
  posNoEmail: boolean;
};

export async function importLightspeedContacts(
  supabase: SupabaseClient,
  userId: string,
): Promise<CrmImportResult> {
  const client = new LightspeedClient(userId);

  const { customers, hitPageLimit } = await client.getAllCustomersCursor(
    { load_relations: '["Contact"]', archived: "false" },
    { limit: 100, maxPages: 300 },
  );

  // Collapse Lightspeed rows to one candidate per email, merging metadata.
  const byEmail = new Map<string, ContactRow>();
  let skippedNoEmail = 0;

  for (const customer of customers) {
    const email = extractEmail(customer);
    if (!email) {
      skippedNoEmail++;
      continue;
    }
    const candidate: ContactRow = {
      email,
      first_name: cleanName(customer.firstName),
      last_name: cleanName(customer.lastName),
      phone: extractPhone(customer),
      lightspeed_customer_id: customer.customerID ? String(customer.customerID) : null,
      posNoEmail: customer.Contact?.noEmail === "true",
    };
    const existing = byEmail.get(email);
    if (!existing) {
      byEmail.set(email, candidate);
    } else {
      byEmail.set(email, {
        email,
        first_name: existing.first_name ?? candidate.first_name,
        last_name: existing.last_name ?? candidate.last_name,
        phone: existing.phone ?? candidate.phone,
        lightspeed_customer_id:
          existing.lightspeed_customer_id ?? candidate.lightspeed_customer_id,
        posNoEmail: existing.posNoEmail || candidate.posNoEmail,
      });
    }
  }

  // Split into inserts vs metadata updates against what we already have.
  const { data: existingRows, error: existingError } = await supabase
    .from("crm_contacts")
    .select("id, email, first_name, last_name, phone, lightspeed_customer_id, opted_out")
    .eq("user_id", userId);
  if (existingError) throw new Error(`Failed to load existing contacts: ${existingError.message}`);

  const existingByEmail = new Map(
    (existingRows ?? []).map((row) => [String(row.email), row]),
  );

  const now = new Date().toISOString();
  const inserts: Record<string, unknown>[] = [];
  let updated = 0;

  for (const candidate of byEmail.values()) {
    const existing = existingByEmail.get(candidate.email);

    if (!existing) {
      inserts.push({
        user_id: userId,
        email: candidate.email,
        first_name: candidate.first_name,
        last_name: candidate.last_name,
        phone: candidate.phone,
        lightspeed_customer_id: candidate.lightspeed_customer_id,
        source: "lightspeed",
        opted_out: candidate.posNoEmail,
        opted_out_at: candidate.posNoEmail ? now : null,
        opt_out_reason: candidate.posNoEmail ? "lightspeed_no_email" : null,
      });
      continue;
    }

    // Merge: fill gaps, refresh the Lightspeed link, honour a new POS opt-out.
    const patch: Record<string, unknown> = {};
    if (candidate.first_name && candidate.first_name !== existing.first_name)
      patch.first_name = candidate.first_name;
    if (candidate.last_name && candidate.last_name !== existing.last_name)
      patch.last_name = candidate.last_name;
    if (candidate.phone && candidate.phone !== existing.phone) patch.phone = candidate.phone;
    if (
      candidate.lightspeed_customer_id &&
      candidate.lightspeed_customer_id !== existing.lightspeed_customer_id
    )
      patch.lightspeed_customer_id = candidate.lightspeed_customer_id;
    if (candidate.posNoEmail && !existing.opted_out) {
      patch.opted_out = true;
      patch.opted_out_at = now;
      patch.opt_out_reason = "lightspeed_no_email";
    }

    if (Object.keys(patch).length > 0) {
      patch.updated_at = now;
      const { error } = await supabase
        .from("crm_contacts")
        .update(patch)
        .eq("id", existing.id)
        .eq("user_id", userId);
      if (!error) updated++;
    }
  }

  for (let i = 0; i < inserts.length; i += 500) {
    const chunk = inserts.slice(i, i + 500);
    const { error } = await supabase
      .from("crm_contacts")
      .upsert(chunk, { onConflict: "user_id,email", ignoreDuplicates: true });
    if (error) throw new Error(`Failed to insert contacts: ${error.message}`);
  }

  return {
    scanned: customers.length,
    imported: inserts.length,
    updated,
    skippedNoEmail,
    hitPageLimit,
  };
}
