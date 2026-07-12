/** CRM v2 is on by default and may be explicitly disabled for rollback. */
export function isStoreCrmV2Enabled(
  value: string | undefined = process.env.NEXT_PUBLIC_STORE_CRM_V2_ENABLED,
): boolean {
  return value?.trim().toLowerCase() !== "false";
}

export const STORE_CRM_V2_ENABLED = isStoreCrmV2Enabled();
