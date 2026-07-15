/** Shared CRM contact search filters for PostgREST / Supabase queries. */

export function sanitiseContactSearchTerm(search: string): string {
  return search.replace(/[,()]/g, " ").trim();
}

export function buildContactSearchOrFilter(search: string): string | null {
  const term = sanitiseContactSearchTerm(search);
  if (!term) return null;

  const escaped = term.replace(/%/g, "");
  const tokens = term.split(/\s+/).filter((part) => part.length > 0);
  const conditions = new Set<string>([
    `email.ilike.%${escaped}%`,
    `phone.ilike.%${escaped}%`,
    `first_name.ilike.%${escaped}%`,
    `last_name.ilike.%${escaped}%`,
    `lightspeed_customer_id.ilike.%${escaped}%`,
  ]);

  const digits = term.replace(/\D+/g, "");
  if (digits.length >= 3) {
    conditions.add(`phone.ilike.%${digits}%`);
  }

  if (tokens.length >= 2) {
    const first = tokens[0]!.replace(/%/g, "");
    const last = tokens[tokens.length - 1]!.replace(/%/g, "");
    conditions.add(`and(first_name.ilike.%${first}%,last_name.ilike.%${last}%)`);
  }

  for (const token of tokens) {
    if (token.length < 2) continue;
    const safe = token.replace(/%/g, "");
    conditions.add(`first_name.ilike.%${safe}%`);
    conditions.add(`last_name.ilike.%${safe}%`);
  }

  return Array.from(conditions).join(",");
}
