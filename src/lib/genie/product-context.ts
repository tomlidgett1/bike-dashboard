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
  image?: string | null;
  url: string;
  specsSummary?: string | null;
  description?: string | null;
}

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

export function buildProductGenieContext(product: MarketplaceProduct): ProductGenieContext {
  const name =
    (product as { display_name?: string }).display_name?.trim() ||
    product.description?.trim() ||
    "Product listing";

  const livePrice = resolveLivePrice(product).price;
  const condition =
    (product as { condition_rating?: string }).condition_rating ??
    (product as { condition?: string }).condition ??
    null;

  const image =
    product.all_images?.[0] ||
    product.primary_image_url ||
    (typeof product.images?.[0] === "object" &&
    product.images[0] &&
    "url" in product.images[0] &&
    typeof product.images[0].url === "string"
      ? product.images[0].url
      : null);

  return {
    id: product.id,
    name,
    brand: product.brand ?? (product as { bike_brand?: string }).bike_brand ?? null,
    model: (product as { model?: string }).model ?? (product as { bike_model?: string }).bike_model ?? null,
    bikeType: product.bike_type ?? null,
    price: livePrice > 0 ? livePrice : null,
    condition,
    image,
    url: `/marketplace/product/${product.id}`,
    specsSummary: buildSpecsSummary(product.bike_specs),
    description: product.description?.trim() || null,
  };
}
