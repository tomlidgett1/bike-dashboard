// CRM merge tags — the one supported personalisation token is {{FIRST_NAME}}.
//
// The compose agent is instructed to write exactly {{FIRST_NAME}}; this module
// (a) normalises the sloppy variants a model might emit ({{first_name}},
// {{ FIRST_NAME }}, [FIRST_NAME]) into the canonical token, (b) detects
// leftover literal artifacts like "Hi first_name" so verification can fail the
// draft, and (c) substitutes the token per recipient at send/preview time.

const CANONICAL_TAG = "{{FIRST_NAME}}";
export const FIRST_NAME_FALLBACK = "there";

/** Rewrite near-miss merge tags into the canonical {{FIRST_NAME}} token. */
export function normalizeMergeTags(value: string): string {
  return value
    .replace(/\{\{\s*first[_\s-]?name\s*\}\}/gi, CANONICAL_TAG)
    // Single-brace variant — lookarounds stop it re-matching inside the
    // canonical double-brace token and stacking braces ({{{FIRST_NAME}}}).
    .replace(/(?<!\{)\{\s*first[_\s-]?name\s*\}(?!\})/gi, CANONICAL_TAG)
    .replace(/\[\s*first[_\s-]?name\s*\]/gi, CANONICAL_TAG)
    .replace(/%first[_\s-]?name%/gi, CANONICAL_TAG);
}

/**
 * Literal "first_name"-ish text that survived normalisation (e.g. "Hi first_name,")
 * — a personalisation bug waiting to be sent to a real customer.
 */
export function findMergeTagArtifacts(value: string): string[] {
  const artifacts: string[] = [];
  const withoutCanonical = value.replaceAll(CANONICAL_TAG, "");
  const re = /.{0,20}\bfirst[_\s]?name\b.{0,20}/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(withoutCanonical)) !== null && artifacts.length < 3) {
    artifacts.push(match[0].replace(/\s+/g, " ").trim());
  }
  return artifacts;
}

export function applyMergeTags(
  value: string,
  fields: { firstName?: string | null },
): string {
  const firstName = String(fields.firstName ?? "").trim() || FIRST_NAME_FALLBACK;
  return normalizeMergeTags(value).replaceAll(CANONICAL_TAG, firstName);
}

export function hasMergeTags(value: string): boolean {
  return normalizeMergeTags(value).includes(CANONICAL_TAG);
}
