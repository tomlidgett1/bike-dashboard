/** ElevenLabs outbound dynamic_variables must be string primitives only. */
const ELEVENLABS_DYNAMIC_VAR_MAX_LEN = 4500;

export function sanitiseElevenLabsDynamicVariables(
  vars: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (key.startsWith('_nest_')) continue;
    if (key === 'elevenlabs_response') continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    const text = String(value).trim();
    if (!text) continue;
    out[key] = text.length > ELEVENLABS_DYNAMIC_VAR_MAX_LEN
      ? `${text.slice(0, ELEVENLABS_DYNAMIC_VAR_MAX_LEN)}\n\n[Truncated for voice API limits]`
      : text;
  }
  return out;
}
