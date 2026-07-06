/** AU-focused E.164 normalisation for customer phone capture flows. */
export function normaliseToE164(input: string): string | null {
  const s0 = input.trim().replace(/[\s().-]/g, "");
  if (!s0 || s0.includes("@")) return null;

  let digits = s0.startsWith("+") ? s0.slice(1).replace(/\D/g, "") : s0.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return null;

  if (digits.startsWith("0")) {
    digits = `61${digits.slice(1)}`;
  }

  if (digits.startsWith("61") && digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }

  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}
