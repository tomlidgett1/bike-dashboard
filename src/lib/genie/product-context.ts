import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { parseBikeSpecs } from "@/lib/types/bike-specs";
import { resolveLivePrice } from "@/lib/marketplace/pricing";

export interface ProductGenieContext {
  id: string;
  name: string;
  brand?: string | null;
  model?: string | null;
  bikeType?: string | null;
  price?: number | null;
  condition?: string | null;
  conditionDetails?: string | null;
  sellerNotes?: string | null;
  wearNotes?: string | null;
  usageEstimate?: string | null;
  listingType?: "store_inventory" | "private_listing" | null;
  listingSource?: string | null;
  listingStatus?: string | null;
  category?: string | null;
  subcategory?: string | null;
  modelYear?: string | null;
  quantityOnHand?: number | null;
  storeName?: string | null;
  image?: string | null;
  url: string;
  specsSummary?: string | null;
  description?: string | null;
  productDescription?: string | null;
  productSpecs?: string | null;
  frameSize?: string | null;
  groupset?: string | null;
  wheelSize?: string | null;
  includedAccessories?: string | null;
}

const PRODUCT_GENIE_DB_FIELDS = `
  id,
  description,
  product_description,
  product_specs,
  display_name,
  price,
  discount_percent,
  discount_active,
  discount_ends_at,
  sale_price,
  marketplace_category,
  marketplace_subcategory,
  qoh,
  model_year,
  listing_type,
  listing_source,
  listing_status,
  brand,
  manufacturer_name,
  model,
  bike_type,
  frame_size,
  groupset,
  wheel_size,
  condition_rating,
  condition_details,
  seller_notes,
  wear_notes,
  usage_estimate,
  included_accessories,
  is_bicycle,
  bike_specs,
  users!user_id (
    business_name,
    name
  )
`.trim();

function buildSpecsSummary(bikeSpecs: unknown): string | null {
  const parsed = parseBikeSpecs(bikeSpecs);
  if (!parsed?.sections?.length) return null;

  const lines: string[] = [];
  for (const section of parsed.sections) {
    for (const spec of section.specs ?? []) {
      if (spec.label && spec.value) {
        lines.push(`${spec.label}: ${spec.value}`);
      }
    }
  }

  return lines.length > 0 ? lines.slice(0, 48).join("\n") : null;
}

function resolveConditionLabel(product: {
  condition_rating?: string | null;
  condition?: string | null;
  listing_type?: string | null;
}): string {
  const explicit =
    product.condition_rating ??
    (product as { condition?: string }).condition ??
    null;

  if (explicit) return explicit;

  if (product.listing_type === "store_inventory") {
    return "Not rated — store inventory (typically new retail stock unless the listing says otherwise)";
  }

  if (product.listing_type === "private_listing") {
    return "Not rated — private listing (check seller notes and description)";
  }

  return "Not specified on this listing";
}

function resolveStoreName(users: unknown): string | null {
  if (!users || typeof users !== "object") return null;
  const row = users as { business_name?: string | null; name?: string | null };
  return row.business_name?.trim() || row.name?.trim() || null;
}

function productRowToMarketplaceShape(row: Record<string, unknown>): MarketplaceProduct {
  const users = row.users;
  const storeName = resolveStoreName(users);

  const shaped = row as unknown as MarketplaceProduct & {
    manufacturer_name?: string | null;
    model?: string | null;
  };

  shaped.store_name = storeName ?? "";
  if (!shaped.brand && shaped.manufacturer_name) {
    shaped.brand = shaped.manufacturer_name;
  }

  return shaped;
}

export function buildProductGenieContext(product: MarketplaceProduct): ProductGenieContext {
  const name =
    product.display_name?.trim() ||
    product.description?.trim() ||
    "Product listing";

  const livePrice = resolveLivePrice(product).price;
  const condition = resolveConditionLabel(product);

  const image =
    product.all_images?.[0] ||
    product.primary_image_url ||
    (typeof product.images?.[0] === "object" &&
    product.images[0] &&
    "url" in product.images[0] &&
    typeof product.images[0].url === "string"
      ? product.images[0].url
      : null);

  const categoryParts = [
    product.marketplace_category,
    product.marketplace_subcategory,
    product.marketplace_level_3_category,
  ].filter(Boolean);

  return {
    id: product.id,
    name,
    brand: product.brand ?? (product as { bike_brand?: string }).bike_brand ?? null,
    model:
      (product as { model?: string | null }).model ??
      (product as { bike_model?: string }).bike_model ??
      null,
    bikeType: product.bike_type ?? null,
    price: livePrice > 0 ? livePrice : null,
    condition,
    conditionDetails: product.condition_details?.trim() || null,
    sellerNotes: product.seller_notes?.trim() || null,
    wearNotes: product.wear_notes?.trim() || null,
    usageEstimate: product.usage_estimate?.trim() || null,
    listingType: product.listing_type ?? null,
    listingSource: product.listing_source ?? null,
    listingStatus: product.listing_status ?? null,
    category: categoryParts.length > 0 ? categoryParts.join(" › ") : null,
    subcategory: product.marketplace_subcategory ?? null,
    modelYear: product.model_year ?? null,
    quantityOnHand: product.qoh ?? null,
    storeName: product.store_name?.trim() || null,
    image,
    url: `/marketplace/product/${product.id}`,
    specsSummary: buildSpecsSummary(product.bike_specs),
    description: product.description?.trim() || null,
    productDescription: product.product_description?.trim() || null,
    productSpecs: product.product_specs?.trim() || null,
    frameSize: product.frame_size ?? null,
    groupset: product.groupset ?? null,
    wheelSize: product.wheel_size ?? null,
    includedAccessories: product.included_accessories?.trim() || null,
  };
}

export function formatProductGenieListingForModel(product: ProductGenieContext): string {
  const lines = [
    "=== YELLOW JERSEY LISTING (authoritative for sale facts) ===",
    "This is the actual item for sale on Yellow Jersey — not the manufacturer catalogue page.",
    "Answer listing questions (new/used condition, price, stock, seller claims, what's included) from this block FIRST.",
    "Do NOT use web search for listing-specific facts when they appear here or in the shopper's listing view.",
    "Brand/model/year/category/spec metadata may be imperfect. If those fields conflict with the title or credible OEM info, briefly flag the inconsistency and say what to verify.",
    "",
    `Listing ID: ${product.id}`,
    `Title: ${product.name}`,
    product.brand ? `Brand: ${product.brand}` : null,
    product.model ? `Model: ${product.model}` : null,
    product.bikeType ? `Bike type: ${product.bikeType}` : null,
    product.category ? `Category: ${product.category}` : null,
    product.modelYear ? `Model year (listing): ${product.modelYear}` : null,
    product.price != null ? `Listed price: $${product.price.toLocaleString("en-AU")} AUD` : null,
    product.listingType ? `Listing type: ${product.listingType.replace(/_/g, " ")}` : null,
    product.listingSource ? `Listing source: ${product.listingSource.replace(/_/g, " ")}` : null,
    product.listingStatus ? `Listing status: ${product.listingStatus}` : null,
    product.storeName ? `Seller / store: ${product.storeName}` : null,
    product.quantityOnHand != null ? `Quantity on hand: ${product.quantityOnHand}` : null,
    `Condition (as listed): ${product.condition ?? "Not specified"}`,
    product.conditionDetails ? `Condition details: ${product.conditionDetails}` : null,
    product.wearNotes ? `Wear notes: ${product.wearNotes}` : null,
    product.usageEstimate ? `Usage estimate: ${product.usageEstimate}` : null,
    product.sellerNotes ? `Seller notes: ${product.sellerNotes}` : null,
    product.frameSize ? `Frame size: ${product.frameSize}` : null,
    product.groupset ? `Groupset: ${product.groupset}` : null,
    product.wheelSize ? `Wheel size: ${product.wheelSize}` : null,
    product.includedAccessories ? `Included accessories: ${product.includedAccessories}` : null,
    product.url ? `Listing URL: ${product.url}` : null,
    product.description ? `\nSeller / store description:\n${product.description.slice(0, 1400)}` : null,
    product.productDescription
      ? `\nEnriched product description:\n${product.productDescription.slice(0, 1400)}`
      : null,
    product.productSpecs ? `\nEnriched product specs:\n${product.productSpecs.slice(0, 1400)}` : null,
    product.specsSummary ? `\nStructured listing specifications:\n${product.specsSummary}` : null,
    "",
    'Interpretation guide: "Is this new?" usually means item condition on THIS listing — use Condition (as listed) above. Only discuss manufacturer model-year "newness" if the shopper clearly means that, and say it is separate from listing condition. If the listing year/specs look suspicious from the title/model, call that out cautiously.',
  ].filter((line) => line !== null);

  return lines.join("\n");
}

export async function hydrateProductGenieContext(
  supabase: SupabaseClient,
  clientContext: ProductGenieContext,
): Promise<ProductGenieContext> {
  try {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_GENIE_DB_FIELDS)
      .eq("id", clientContext.id)
      .maybeSingle();

    if (error || !data) return clientContext;

    return buildProductGenieContext(
      productRowToMarketplaceShape(data as unknown as Record<string, unknown>),
    );
  } catch {
    return clientContext;
  }
}
