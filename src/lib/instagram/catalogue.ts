/**
 * Store catalogue helpers for Instagram: search approved primary product photos.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";

export type InstagramCatalogueProduct = {
  id: string;
  name: string;
  brand: string | null;
  description: string | null;
  /** Full/list price in AUD. */
  price: number | null;
  /** Live sale price in AUD, when available. */
  salePrice: number | null;
  discountPercent: number | null;
  imageUrl: string;
};

type ReadyRow = {
  id: string;
  display_name: string | null;
  description: string | null;
  product_description: string | null;
  manufacturer_name: string | null;
  brand: string | null;
  price: number | null;
  sale_price: number | null;
  discount_percent: number | null;
  discount_active: boolean | null;
  resolved_cloudinary_url: string | null;
  resolved_external_url: string | null;
  cached_image_url: string | null;
  cached_thumbnail_url: string | null;
  primary_image_url: string | null;
};

const READY_PRODUCT_SELECT =
  "id, display_name, description, product_description, manufacturer_name, brand, price, sale_price, discount_percent, discount_active, resolved_cloudinary_url, resolved_external_url, cached_image_url, cached_thumbnail_url, primary_image_url";

function productName(row: ReadyRow): string {
  return (
    row.display_name?.trim() ||
    row.description?.trim() ||
    "Untitled product"
  );
}

function productDescription(row: ReadyRow): string | null {
  const rich = row.product_description?.trim() || "";
  const basic = row.description?.trim() || "";
  const text = rich || basic;
  if (!text) return null;
  // Keep prompt/caption context compact.
  return text.length > 900 ? `${text.slice(0, 897).trim()}…` : text;
}

function productImageUrl(row: ReadyRow): string | null {
  const url =
    row.resolved_cloudinary_url?.trim() ||
    row.cached_image_url?.trim() ||
    row.cached_thumbnail_url?.trim() ||
    row.resolved_external_url?.trim() ||
    row.primary_image_url?.trim() ||
    "";
  return url || null;
}

function money(value: number | null | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mapReadyRow(row: ReadyRow): InstagramCatalogueProduct | null {
  const imageUrl = productImageUrl(row);
  if (!imageUrl) return null;
  const listPrice = money(row.price);
  const rawSale = money(row.sale_price);
  const salePrice =
    row.discount_active === false
      ? null
      : rawSale && (!listPrice || rawSale < listPrice)
        ? rawSale
        : null;
  const discountPercent =
    row.discount_active === false ? null : money(row.discount_percent);
  return {
    id: row.id,
    name: productName(row),
    brand: row.manufacturer_name || row.brand || null,
    description: productDescription(row),
    price: listPrice,
    salePrice,
    discountPercent,
    imageUrl,
  };
}

function formatAud(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

/**
 * Compact product facts for image prompts and caption drafting.
 * Includes list/sale pricing so creatives like "50% off" can use real numbers.
 */
export function formatInstagramProductFacts(
  product: Pick<
    InstagramCatalogueProduct,
    | "name"
    | "brand"
    | "description"
    | "price"
    | "salePrice"
    | "discountPercent"
  >,
): string {
  const lines = [`Product name: ${product.name}`];
  if (product.brand?.trim()) {
    lines.push(`Brand: ${product.brand.trim()}`);
  }
  if (product.price != null) {
    lines.push(`List price: ${formatAud(product.price)}`);
  }
  if (product.salePrice != null) {
    lines.push(`Sale price: ${formatAud(product.salePrice)}`);
  }
  if (product.discountPercent != null) {
    lines.push(`Current discount: ${product.discountPercent}% off`);
  }
  if (product.price != null) {
    const half = Math.round((product.price * 0.5 + Number.EPSILON) * 100) / 100;
    lines.push(`50% off the list price would be: ${formatAud(half)}`);
  }
  if (product.description?.trim()) {
    lines.push(`Product description: ${product.description.trim()}`);
  }
  return lines.join("\n");
}

export async function searchInstagramCatalogueProducts(params: {
  ownerUserId: string;
  query: string;
  limit?: number;
}): Promise<InstagramCatalogueProduct[]> {
  const admin = createServiceRoleClient();
  const limit = Math.min(Math.max(params.limit ?? 24, 1), 40);
  const query = params.query.trim();

  let builder = admin
    .from("marketplace_ready_products")
    .select(READY_PRODUCT_SELECT)
    .eq("user_id", params.ownerUserId)
    .not("resolved_cloudinary_url", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (query.length >= 2) {
    const safe = query.replace(/[%_,]/g, " ").trim();
    builder = builder.or(
      `display_name.ilike.%${safe}%,description.ilike.%${safe}%,product_description.ilike.%${safe}%,manufacturer_name.ilike.%${safe}%,brand.ilike.%${safe}%`,
    );
  }

  const { data, error } = await builder;
  if (error) {
    throw new Error(`Could not search catalogue: ${error.message}`);
  }

  return ((data || []) as ReadyRow[])
    .map(mapReadyRow)
    .filter((item): item is InstagramCatalogueProduct => Boolean(item));
}

export async function resolveInstagramCatalogueProduct(params: {
  ownerUserId: string;
  productId: string;
}): Promise<InstagramCatalogueProduct> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("marketplace_ready_products")
    .select(READY_PRODUCT_SELECT)
    .eq("user_id", params.ownerUserId)
    .eq("id", params.productId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load product: ${error.message}`);
  }
  const mapped = data ? mapReadyRow(data as ReadyRow) : null;
  if (!mapped) {
    throw new Error(
      "That product has no approved primary image. Choose another product.",
    );
  }
  return mapped;
}
