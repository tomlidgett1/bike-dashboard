import { pickServerEnv } from "@/lib/nest-portal/lib/server-env";

function splitNumberList(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value.split(/[\s,;\n]+/).map((s) => s.trim()).filter(Boolean);
}

function normaliseLinqFromNumber(number: string): string {
  const compact = number.replace(/[\s().-]/g, "");
  if (compact.startsWith("+")) return compact;
  if (/^1\d{10}$/.test(compact)) return `+${compact}`;
  return `+${compact}`;
}

function isNorthAmericanE164(number: string): boolean {
  const compact = number.replace(/[\s().-]/g, "");
  return /^\+1\d{10}$/.test(compact);
}

function collectLinqNumberCandidates(): string[] {
  const candidates: string[] = [];
  for (const key of [
    "LINQ_VOICE_FROM",
    "LINQ_AGENT_FROM",
    "NEST_IMESSAGE_NUMBER",
    "YJ_BUSINESS_LINQ_NUMBERS",
    "LINQ_AGENT_BOT_NUMBERS",
  ]) {
    const value = pickServerEnv([key]);
    if (value) candidates.push(...splitNumberList(value));
  }
  return candidates;
}

/** Linq API `from` must be the US iMessage line (+1), not AU storefront numbers. */
export function getLinqFromNumber(): string | null {
  const usNumbers = collectLinqNumberCandidates()
    .map(normaliseLinqFromNumber)
    .filter(isNorthAmericanE164);

  // AU lines are listed first in env; the Nest iMessage sender is the last US entry.
  return usNumbers.at(-1) ?? null;
}
