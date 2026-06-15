/** Format variant option assignments for table badges, e.g. "Size M · Black". */
export function formatVariantOptionLabel(
  valueAssignments: Record<string, string> | null | undefined,
): string | null {
  if (!valueAssignments) return null;
  const values = Object.values(valueAssignments)
    .map((v) => v?.trim())
    .filter(Boolean);
  if (values.length === 0) return null;
  return values.join(" · ");
}

export type ProductVariantSummary = {
  variant_group_id: string | null;
  variant_master_title: string | null;
  variant_hidden_from_grid: boolean;
  variant_is_master: boolean | null;
  variant_option_label: string | null;
  variant_sibling_count: number | null;
  variant_group_title: string | null;
};

export function buildVariantBadgeLabel(summary: ProductVariantSummary): string | null {
  if (!summary.variant_group_id) return null;

  if (summary.variant_is_master) {
    const count = summary.variant_sibling_count ?? 0;
    return count > 0 ? `Master · ${count}` : "Master";
  }

  const option = summary.variant_option_label;
  if (summary.variant_hidden_from_grid) {
    return option ? `Hidden · ${option}` : "Hidden";
  }

  return option ?? "Variant";
}
