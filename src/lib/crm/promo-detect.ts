// Deterministic promotion + brand extraction from campaign prompts.

import type { CrmPromoBrief } from "./agent/types";

const NONE: CrmPromoBrief = {
  kind: "none",
  discount_percent: null,
  brand: null,
  keyword: null,
  label: null,
  only_on_sale: false,
};

/** Normalise brand names like "muc off" → "Muc-Off". */
function normaliseBrand(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/muc[\s-]*off/i.test(trimmed)) return "Muc-Off";
  return trimmed
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Extract promo signals from the raw prompt — merged with GPT output as a safety net.
 */
export function detectPromoFromPrompt(prompt: string): CrmPromoBrief {
  const text = prompt.trim();
  if (!text) return NONE;

  const lower = text.toLowerCase();
  let discount_percent: number | null = null;
  let brand: string | null = null;
  let keyword: string | null = null;
  let only_on_sale = false;
  let kind: CrmPromoBrief["kind"] = "none";

  const pctMatch =
    lower.match(/(\d{1,2})\s*%\s*off/) ||
    lower.match(/(\d{1,2})\s*percent\s*off/) ||
    lower.match(/(\d{1,2})\s*%\s*discount/);
  if (pctMatch) {
    const pct = Number(pctMatch[1]);
    if (pct > 0 && pct <= 90) {
      discount_percent = pct;
      kind = "percent_off";
    }
  }

  if (/\bon[\s-]?sale\b|\bsale\b|\bdiscounted\b|\bclearance\b/.test(lower)) {
    only_on_sale = true;
    if (kind === "none") kind = "on_sale_only";
  }

  const brandPatterns: Array<{ re: RegExp; brand: string }> = [
    { re: /\bmuc[\s-]?off\b/i, brand: "Muc-Off" },
    { re: /\bshimano\b/i, brand: "Shimano" },
    { re: /\bsram\b/i, brand: "SRAM" },
    { re: /\btrek\b/i, brand: "Trek" },
    { re: /\bgiant\b/i, brand: "Giant" },
    { re: /\bspeciali[sz]ed\b/i, brand: "Specialized" },
    { re: /\bcannondale\b/i, brand: "Cannondale" },
    { re: /\borbea\b/i, brand: "Orbea" },
    { re: /\bcastelli\b/i, brand: "Castelli" },
    { re: /\bpearl\s+izumi\b/i, brand: "Pearl Izumi" },
  ];

  for (const entry of brandPatterns) {
    if (entry.re.test(text)) {
      brand = entry.brand;
      break;
    }
  }

  if (!brand) {
    const brandOfMatch = lower.match(/\b([a-z][a-z0-9&-]*(?:\s+[a-z0-9&-]+){0,2})\s+products?\b/);
    if (brandOfMatch?.[1] && !["our", "your", "the", "all", "new", "some"].includes(brandOfMatch[1])) {
      brand = normaliseBrand(brandOfMatch[1]);
    }
  }

  if (brand) {
    keyword = brand;
    if (kind === "none" && !only_on_sale) kind = "percent_off";
  }

  const label =
    discount_percent != null ? `${discount_percent}% OFF` : only_on_sale ? "SALE" : null;

  if (kind === "none" && !brand && !keyword) return NONE;

  return {
    kind,
    discount_percent,
    brand,
    keyword,
    label,
    only_on_sale: kind === "on_sale_only" ? true : only_on_sale,
  };
}

export function mergePromoBrief(
  fromModel: Partial<CrmPromoBrief> | null | undefined,
  fromPrompt: CrmPromoBrief,
): CrmPromoBrief {
  const model = fromModel ?? {};
  const kind =
    model.kind === "percent_off" ||
    model.kind === "on_sale_only" ||
    model.kind === "none"
      ? model.kind
      : fromPrompt.kind;

  const discount_percent =
    typeof model.discount_percent === "number" && model.discount_percent > 0
      ? model.discount_percent
      : fromPrompt.discount_percent;

  const brand = String(model.brand ?? fromPrompt.brand ?? "").trim() || null;
  const keyword = String(model.keyword ?? fromPrompt.keyword ?? brand ?? "").trim() || null;

  let resolvedKind = kind;
  if (resolvedKind === "none" && (discount_percent || brand || fromPrompt.only_on_sale)) {
    resolvedKind = fromPrompt.only_on_sale || model.only_on_sale ? "on_sale_only" : "percent_off";
  }

  const label =
    String(model.label ?? "").trim() ||
    (discount_percent != null ? `${discount_percent}% OFF` : null) ||
    fromPrompt.label;

  return {
    kind: resolvedKind,
    discount_percent,
    brand,
    keyword,
    label,
    only_on_sale:
      resolvedKind === "on_sale_only" ||
      Boolean(model.only_on_sale) ||
      fromPrompt.only_on_sale,
  };
}
