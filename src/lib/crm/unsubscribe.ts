// Token-based opt-out shared by the public /unsubscribe page and the
// one-click List-Unsubscribe endpoint.
//
// The token is an unguessable per-contact UUID minted at import time, so the
// link identifies the contact without login and without exposing an update
// endpoint keyed on email. Uses the service-role client because the visitor
// is anonymous; the token lookup is the authorisation.

import { createServiceRoleClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UnsubscribeOutcome = "unsubscribed" | "already_unsubscribed" | "invalid";

export async function optOutContactByToken(
  token: string | null | undefined,
  reason: string,
): Promise<UnsubscribeOutcome> {
  const cleaned = String(token ?? "").trim();
  if (!UUID_RE.test(cleaned)) return "invalid";

  const supabase = createServiceRoleClient();
  const { data: contact, error } = await supabase
    .from("crm_contacts")
    .select("id, opted_out")
    .eq("unsubscribe_token", cleaned)
    .maybeSingle();
  if (error) {
    console.error("[crm] unsubscribe lookup failed:", error.message);
    return "invalid";
  }
  if (!contact) return "invalid";
  if (contact.opted_out) return "already_unsubscribed";

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("crm_contacts")
    .update({
      opted_out: true,
      opted_out_at: now,
      opt_out_reason: reason,
      updated_at: now,
    })
    .eq("id", contact.id);
  if (updateError) {
    console.error("[crm] unsubscribe update failed:", updateError.message);
    return "invalid";
  }
  return "unsubscribed";
}
