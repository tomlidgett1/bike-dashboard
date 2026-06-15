// ============================================================
// Map raw AI groups -> reviewable variant candidates (pure)
// ============================================================
// Kept free of any network/model dependency so it can be unit tested.
// Responsibilities:
//   - drop low-confidence / non-variant groups and < 2-item groups
//   - resolve refs back to real products (price/qoh/image come from the
//     product, never from the model)
//   - guarantee a product appears in at most one group
//   - de-duplicate identical groups
//   - merge deterministic bucket warnings with AI warnings

import type { RawVariantGroup } from "@/lib/ai/detect-product-variants";
import { variantTokenSignature } from "./normalize";
import type {
  VariantBucket,
  VariantCandidate,
  VariantCandidateItem,
  VariantCandidateProduct,
  VariantConfidence,
  VariantOptionType,
  VariantWarning,
} from "./types";

const KNOWN_WARNINGS = new Set<VariantWarning>([
  "price_mismatch",
  "category_mismatch",
  "model_year_conflict",
  "ambiguous_titles",
  "possible_false_positive",
  "missing_sku",
  "already_lightspeed_matrix",
]);

function normalizeConfidence(value: string | undefined): VariantConfidence {
  return value === "high" || value === "medium" || value === "low" ? value : "medium";
}

function dedupeWarnings(values: string[]): VariantWarning[] {
  const out: VariantWarning[] = [];
  for (const v of values) {
    if (KNOWN_WARNINGS.has(v as VariantWarning) && !out.includes(v as VariantWarning)) {
      out.push(v as VariantWarning);
    }
  }
  return out;
}

/**
 * Cross-check the original Lightspeed listings: if each item's listing carries a
 * distinct size/colour token, we are very confident (high). If none of the
 * listings distinguish the items, they may be duplicates — flag it.
 */
/** A per-product fingerprint built from the Lightspeed listing text AND the
 *  structured colour/size fields — so we can tell variants apart even when one
 *  source is blank. */
function productDetailSignature(product: VariantCandidateProduct | undefined): string {
  if (!product) return "";
  const fromText = variantTokenSignature((product.lightspeed_description || product.title || "").trim());
  const structured = [
    product.color_primary,
    product.color_secondary,
    product.size,
    product.frame_size,
    product.wheel_size,
  ]
    .map((v) => (v ?? "").trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|");
  return [fromText, structured].filter(Boolean).join("#");
}

function crossCheckWithLightspeed(
  items: VariantCandidateItem[],
  byId: Map<string, VariantCandidateProduct>,
  aiConfidence: VariantConfidence,
): { confidence: VariantConfidence; warnings: VariantWarning[] } {
  const signatures = items.map((it) => productDetailSignature(byId.get(it.product_id)));
  const everyHasToken = signatures.every((s) => s.length > 0);
  const allDistinct = everyHasToken && new Set(signatures).size === signatures.length;
  const noneDistinguish = new Set(signatures).size <= 1;

  const warnings: VariantWarning[] = [];
  let confidence = aiConfidence;
  if (allDistinct) {
    confidence = "high"; // Lightspeed listings clearly separate each variant
  } else if (noneDistinguish) {
    warnings.push("possible_false_positive");
    if (confidence === "high") confidence = "medium";
  }
  return { confidence, warnings };
}

function dedupeOptionTypes(rawTypes: { name: string }[], items: VariantCandidateItem[]): VariantOptionType[] {
  const seen = new Set<string>();
  const out: VariantOptionType[] = [];
  const push = (name: string) => {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      out.push({ name: trimmed });
    }
  };
  for (const t of rawTypes ?? []) push(t.name ?? "");
  // Backfill from the values actually assigned, in case the model under-declared.
  for (const item of items) for (const optionName of Object.keys(item.variant_values)) push(optionName);
  return out;
}

export function mapRawGroupsToCandidates(
  bucket: VariantBucket,
  rawGroups: RawVariantGroup[],
  refToProductId: Map<string, string>,
): VariantCandidate[] {
  const byId = new Map(bucket.products.map((p) => [p.product_id, p]));
  const usedProductIds = new Set<string>();
  const seenSignatures = new Set<string>();
  const candidates: VariantCandidate[] = [];

  for (const group of rawGroups) {
    if (!group || group.is_variant_group === false) continue;

    const items: VariantCandidateItem[] = [];
    const seenInGroup = new Set<string>();

    for (const rawItem of group.items ?? []) {
      const productId = refToProductId.get(rawItem.ref);
      if (!productId) continue;
      if (usedProductIds.has(productId) || seenInGroup.has(productId)) continue;
      const product = byId.get(productId);
      if (!product) continue;

      const variant_values: Record<string, string> = {};
      for (const v of rawItem.values ?? []) {
        const option = (v.option ?? "").trim();
        const value = (v.value ?? "").trim();
        if (option && value) variant_values[option] = value;
      }

      items.push({
        product_id: product.product_id,
        lightspeed_item_id: product.lightspeed_item_id,
        title: product.title,
        variant_values,
        price: product.price,
        qoh: product.qoh,
        image_url: product.image_url,
        // Extra detail for the reviewer — what the cleaned title may have dropped.
        lightspeed_description:
          product.lightspeed_description && product.lightspeed_description !== product.title
            ? product.lightspeed_description
            : null,
        color: product.color_primary,
        color_secondary: product.color_secondary,
        size: product.size,
        frame_size: product.frame_size,
        wheel_size: product.wheel_size,
      });
      seenInGroup.add(productId);
    }

    if (items.length < 2) continue;

    // Skip a group whose exact product set we have already accepted.
    const signature = items.map((i) => i.product_id).sort().join("|");
    if (seenSignatures.has(signature)) continue;
    seenSignatures.add(signature);

    const option_types = dedupeOptionTypes(group.option_types, items);
    const crossCheck = crossCheckWithLightspeed(items, byId, normalizeConfidence(group.confidence));

    candidates.push({
      proposed_master_title: (group.master_title || bucket.base_title || items[0].title).trim(),
      base_title: bucket.base_title,
      brand: bucket.brand,
      category_name: bucket.category_name,
      option_types,
      items,
      confidence: crossCheck.confidence,
      explanation: group.explanation || "",
      warnings: dedupeWarnings([...(group.warnings ?? []), ...bucket.warnings, ...crossCheck.warnings]),
    });

    for (const item of items) usedProductIds.add(item.product_id);
  }

  return candidates;
}

/** Distinct option values across a candidate's items, in first-seen order. */
export function collectOptionValues(candidate: VariantCandidate): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const option of candidate.option_types) out[option.name] = [];
  for (const item of candidate.items) {
    for (const [option, value] of Object.entries(item.variant_values)) {
      if (!out[option]) out[option] = [];
      if (!out[option].includes(value)) out[option].push(value);
    }
  }
  return out;
}
