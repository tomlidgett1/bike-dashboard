import { createHash } from "node:crypto";
import {
  applyFieldMapping,
  type FieldMapping,
  type MappedYellowJerseyProduct,
} from "@/lib/scrapers/fesports-field-mapping";
import type {
  SupplierScrapedProduct,
  SupplierVariant,
} from "@/lib/scrapers/supplier-types";

export interface SupplierImportItem extends MappedYellowJerseyProduct {
  sourceId: string;
  baseProductId: string;
  optionName: string | null;
  optionValue: string | null;
  isMaster: boolean;
}

function parseVariantPrice(raw: string | null): number | null {
  if (!raw) return null;
  const matches = raw.replace(/,/g, "").match(/(?:\d+\.\d{1,2}|\d+)/g);
  if (!matches?.length) return null;
  const parsed = Number(matches[matches.length - 1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function variantIdentity(productId: string, variant: SupplierVariant, index: number): string {
  const identity = [
    variant.sku,
    variant.optionName,
    variant.optionValue,
  ]
    .filter(Boolean)
    .join("|") || String(index);
  const suffix = createHash("sha256").update(identity).digest("hex").slice(0, 16);
  return `${productId}:${suffix}`;
}

export function materialiseSupplierImportItems(
  product: SupplierScrapedProduct,
  mapping: FieldMapping,
): SupplierImportItem[] {
  const mapped = applyFieldMapping(product, mapping);
  if (product.variants.length === 0) {
    return [
      {
        ...mapped,
        sourceId: product.productId,
        baseProductId: product.productId,
        optionName: null,
        optionValue: null,
        isMaster: true,
      },
    ];
  }

  return product.variants.map((variant, index) => {
    const optionValue = variant.optionValue?.trim() || `Variant ${index + 1}`;
    return {
      ...mapped,
      sourceId: variantIdentity(product.productId, variant, index),
      baseProductId: product.productId,
      optionName: variant.optionName?.trim() || "Option",
      optionValue,
      isMaster: index === 0,
      display_name: `${mapped.display_name} - ${optionValue}`,
      price: parseVariantPrice(variant.price) ?? mapped.price,
      qoh: variant.soh ?? mapped.qoh,
      system_sku: variant.sku?.trim() || mapped.system_sku,
    };
  });
}
