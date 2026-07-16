import type { SupabaseClient } from "@supabase/supabase-js";
import { getImageVariantKey } from "@/lib/scrapers/fesports-scraper";
import {
  applyFieldMapping,
  type FieldMapping,
} from "@/lib/scrapers/fesports-field-mapping";
import {
  materialiseSupplierImportItems,
  type SupplierImportItem,
} from "@/lib/scrapers/supplier-product-items";
import {
  defaultImagePreference,
  resolveProductImages,
} from "@/lib/scrapers/supplier-image-preferences";
import {
  isValidAssignment,
  resolveMarketplaceCategory,
  type SupplierCategoryOverrides,
} from "@/lib/scrapers/supplier-category";
import type {
  SupplierImageSourcePreferences,
  SupplierScrapedProduct,
} from "@/lib/scrapers/supplier-types";

interface ExistingSupplierProduct {
  id: string;
  supplier_product_id: string | null;
  canonical_product_id: string | null;
  variant_group_id: string | null;
}

interface ImportedItem {
  item: SupplierImportItem;
  productId: string;
  canonicalId: string;
  existing: boolean;
  variantGroupId: string | null;
}

interface SupplierImportInput {
  admin: SupabaseClient;
  ownerUserId: string;
  actorUserId: string;
  accessToken: string | null;
  scraperId: string;
  scraperName: string;
  products: SupplierScrapedProduct[];
  fieldMapping: FieldMapping;
  imagePreferences?: SupplierImageSourcePreferences;
  excludedImages?: Record<string, string[]>;
  categoryOverrides?: SupplierCategoryOverrides;
}

export interface SupplierImportResult {
  created: number;
  updated: number;
  groupsCreated: number;
  imagesSaved: number;
  errors: string[];
  productIds: string[];
}

function normaliseCanonicalName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ");
}

export async function ensureCanonical(
  admin: SupabaseClient,
  name: string,
  brand: string | null,
): Promise<string> {
  const normalisedName = normaliseCanonicalName(name);
  const { data: existing } = await admin
    .from("canonical_products")
    .select("id")
    .eq("normalized_name", normalisedName)
    .maybeSingle();
  if (existing?.id) return String(existing.id);

  const { data, error } = await admin
    .from("canonical_products")
    .insert({
      normalized_name: normalisedName,
      manufacturer: brand || null,
      cleaned: false,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Could not create canonical product: ${error?.message ?? "unknown error"}`);
  }
  return String(data.id);
}

function fallbackCategory(item: SupplierImportItem): {
  category: string;
  subcategory: string;
} {
  const resolved = resolveMarketplaceCategory({
    rawCategory: item.marketplace_category,
    rawSubcategory: item.marketplace_subcategory,
    name: item.display_name,
    description: item.product_description,
  });
  return { category: resolved.category, subcategory: resolved.subcategory };
}

function stableLightspeedId(scraperId: string, sourceId: string): string {
  return `supplier_scrape-${scraperId.slice(0, 12)}-${sourceId}`.slice(0, 190);
}

async function saveProductItem(
  input: SupplierImportInput,
  item: SupplierImportItem,
  baseName: string,
  existing: ExistingSupplierProduct | null,
): Promise<ImportedItem> {
  const canonicalId =
    existing?.canonical_product_id ||
    (await ensureCanonical(input.admin, baseName, item.brand));
  const fallback = fallbackCategory(item);
  // Free-text supplier categories are invisible to marketplace/category
  // browsing — only vocabulary values may reach the products table.
  const category = isValidAssignment({
    category: item.marketplace_category,
    subcategory: item.marketplace_subcategory,
  })
    ? {
        category: item.marketplace_category as string,
        subcategory: item.marketplace_subcategory as string,
      }
    : fallback;
  const values = {
    user_id: input.ownerUserId,
    listing_type: "store_inventory",
    listing_source: "supplier_scrape",
    listing_status: "active",
    is_active: true,
    canonical_product_id: canonicalId,
    description: item.description ?? item.display_name,
    display_name: item.display_name,
    brand: item.brand,
    manufacturer_name: item.brand,
    price: Number.isFinite(item.price) ? item.price : 0,
    marketplace_category: category.category,
    marketplace_subcategory: category.subcategory,
    product_description:
      item.product_description ||
      [`Source: ${input.scraperName}`, item.sourceUrl].filter(Boolean).join("\n"),
    product_specs: item.product_specs,
    qoh:
      typeof item.qoh === "number" && Number.isFinite(item.qoh)
        ? Math.max(0, Math.floor(item.qoh))
        : 0,
    system_sku:
      item.system_sku ||
      `YJ-${input.scraperId.slice(0, 6)}-${item.sourceId.slice(-10)}`,
    lightspeed_item_id: stableLightspeedId(input.scraperId, item.sourceId),
    primary_image_url: item.heroImageUrl ?? item.imageUrls[0] ?? null,
    supplier_scraper_id: input.scraperId,
    supplier_product_id: item.sourceId,
    supplier_source_url: item.sourceUrl,
  };

  if (existing) {
    const { error } = await input.admin
      .from("products")
      .update(values)
      .eq("id", existing.id)
      .eq("user_id", input.ownerUserId);
    if (error) throw new Error(error.message);
    return {
      item,
      productId: existing.id,
      canonicalId,
      existing: true,
      variantGroupId: existing.variant_group_id,
    };
  }

  const { data, error } = await input.admin
    .from("products")
    .insert(values)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Product insert failed");
  return {
    item,
    productId: String(data.id),
    canonicalId,
    existing: false,
    variantGroupId: null,
  };
}

export async function scheduleCloudinaryUpload(
  admin: SupabaseClient,
  accessToken: string | null,
  imageId: string,
  canonicalId: string,
  imageUrl: string,
  index: number,
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !accessToken) return;

  void fetch(`${supabaseUrl}/functions/v1/upload-to-cloudinary`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      imageUrl,
      listingId: `canonical-${canonicalId}`,
      index,
    }),
  })
    .then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json();
      if (!payload.success) return;
      await admin
        .from("product_images")
        .update({
          cloudinary_url: payload.data?.url,
          cloudinary_public_id: payload.data?.publicId,
          is_downloaded: true,
        })
        .eq("id", imageId);
    })
    .catch(() => undefined);
}

async function saveAllImages(
  input: SupplierImportInput,
  importedItems: ImportedItem[],
  product: SupplierScrapedProduct,
): Promise<number> {
  const first = importedItems[0];
  if (!first) return 0;

  const preference =
    input.imagePreferences?.[product.productId] ?? defaultImagePreference(product);
  const resolved = resolveProductImages(
    product,
    preference,
    input.excludedImages?.[product.productId] ?? [],
  );
  if (resolved.imageUrls.length === 0) return 0;

  const canonicalId = first.canonicalId;
  const supplierUrls = new Set(product.imageUrls);
  const alternateUrls = new Set(product.alternatePhoto?.imageUrls ?? []);
  const imageSources = new Set(resolved.sources);
  const primaryUrl = resolved.heroImageUrl ?? resolved.imageUrls[0] ?? null;
  const primaryKey = primaryUrl ? getImageVariantKey(primaryUrl) : null;

  const { data: existingRows } = await input.admin
    .from("product_images")
    .select("id, external_url, source")
    .eq("product_id", first.productId)
    .eq("canonical_product_id", canonicalId)
    .in("source", [...imageSources]);
  const existingByUrl = new Map(
    (existingRows ?? [])
      .filter((row) => row.external_url)
      .map((row) => [`${row.source}:${row.external_url}`, String(row.id)]),
  );

  for (const source of imageSources) {
    await input.admin
      .from("product_images")
      .update({ is_primary: false })
      .eq("product_id", first.productId)
      .eq("canonical_product_id", canonicalId)
      .eq("source", source);
  }

  let saved = 0;
  let selectedImageId: string | null = null;
  for (let index = 0; index < resolved.imageUrls.length; index += 1) {
    const imageUrl = resolved.imageUrls[index];
    const source =
      alternateUrls.has(imageUrl) && !supplierUrls.has(imageUrl)
        ? "alternate_photo_scrape"
        : supplierUrls.has(imageUrl)
          ? "supplier_scrape"
          : preference === "alternate"
            ? "alternate_photo_scrape"
            : "supplier_scrape";
    const isPrimary = primaryKey
      ? getImageVariantKey(imageUrl) === primaryKey
      : index === 0;
    const existingId = existingByUrl.get(`${source}:${imageUrl}`);
    let imageId = existingId ?? null;

    if (existingId) {
      await input.admin
        .from("product_images")
        .update({
          approval_status: "approved",
          is_primary: isPrimary,
          sort_order: index,
        })
        .eq("id", existingId);
    } else {
      const { data, error } = await input.admin
        .from("product_images")
        .insert({
          product_id: first.productId,
          canonical_product_id: canonicalId,
          external_url: imageUrl,
          is_downloaded: false,
          approval_status: "approved",
          is_primary: isPrimary,
          sort_order: index,
          source,
          uploaded_by: input.actorUserId,
        })
        .select("id")
        .single();
      if (error || !data) {
        throw new Error(error?.message ?? "Could not save supplier image.");
      }
      imageId = String(data.id);
      saved += 1;
    }

    if (isPrimary && imageId) selectedImageId = imageId;
    if (imageId) {
      await scheduleCloudinaryUpload(
        input.admin,
        input.accessToken,
        imageId,
        canonicalId,
        imageUrl,
        index,
      );
    }
  }

  if (selectedImageId) {
    await input.admin
      .from("products")
      .update({
        selected_product_image_id: selectedImageId,
        primary_image_url: primaryUrl,
      })
      .in(
        "id",
        importedItems.map((item) => item.productId),
      )
      .eq("user_id", input.ownerUserId);
  }
  return saved;
}

async function ensureVariantGroup(
  input: SupplierImportInput,
  product: SupplierScrapedProduct,
  importedItems: ImportedItem[],
): Promise<boolean> {
  if (importedItems.length < 2) return false;

  const mappedBase = applyFieldMapping(product, input.fieldMapping);
  let groupId =
    importedItems.find((imported) => imported.variantGroupId)?.variantGroupId ?? null;
  let groupCreated = false;

  if (!groupId) {
    const { data, error } = await input.admin
      .from("product_variant_groups")
      .insert({
        user_id: input.ownerUserId,
        master_title: mappedBase.display_name,
        brand: mappedBase.brand,
        category_name: mappedBase.marketplace_category,
        visibility_mode: "master_only",
        sync_target: "local",
        status: "active",
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Could not create variant group.");
    groupId = String(data.id);
    groupCreated = true;
  }

  let { data: optionRow } = await input.admin
    .from("product_variant_options")
    .select("id, name")
    .eq("group_id", groupId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!optionRow) {
    const { data, error } = await input.admin
      .from("product_variant_options")
      .insert({
        group_id: groupId,
        user_id: input.ownerUserId,
        name: importedItems[0].item.optionName || "Option",
        position: 1,
      })
      .select("id, name")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Could not create variant option.");
    optionRow = data;
  }

  const { data: existingValues } = await input.admin
    .from("product_variant_values")
    .select("value")
    .eq("option_id", optionRow.id);
  const knownValues = new Set((existingValues ?? []).map((row) => String(row.value)));
  for (let index = 0; index < importedItems.length; index += 1) {
    const value = importedItems[index].item.optionValue || `Variant ${index + 1}`;
    if (knownValues.has(value)) continue;
    const { error } = await input.admin.from("product_variant_values").insert({
      option_id: optionRow.id,
      group_id: groupId,
      user_id: input.ownerUserId,
      value,
      position: index + 1,
    });
    if (error) throw new Error(error.message);
    knownValues.add(value);
  }

  const { data: existingItems } = await input.admin
    .from("product_variant_group_items")
    .select("product_id")
    .eq("group_id", groupId);
  const knownProductIds = new Set(
    (existingItems ?? []).map((row) => String(row.product_id)),
  );

  for (let index = 0; index < importedItems.length; index += 1) {
    const imported = importedItems[index];
    const isMaster = imported.item.isMaster;
    const value = imported.item.optionValue || `Variant ${index + 1}`;
    if (!knownProductIds.has(imported.productId)) {
      const { error } = await input.admin
        .from("product_variant_group_items")
        .insert({
          group_id: groupId,
          user_id: input.ownerUserId,
          product_id: imported.productId,
          is_master: isMaster,
          value_assignments: {
            [String(optionRow.name || imported.item.optionName || "Option")]: value,
          },
          position: index,
        });
      if (error) throw new Error(error.message);
    }

    const { error: updateError } = await input.admin
      .from("products")
      .update({
        variant_group_id: groupId,
        variant_hidden_from_grid: !isMaster,
        variant_master_title: isMaster ? mappedBase.display_name : null,
      })
      .eq("id", imported.productId)
      .eq("user_id", input.ownerUserId);
    if (updateError) throw new Error(updateError.message);
  }

  await input.admin.from("product_variant_audit_logs").insert({
    user_id: input.ownerUserId,
    group_id: groupId,
    action: groupCreated ? "created_from_supplier_scrape" : "updated_from_supplier_scrape",
    detail: {
      scraper_id: input.scraperId,
      actor_user_id: input.actorUserId,
      source_product_id: product.productId,
      item_count: importedItems.length,
    },
  });

  return groupCreated;
}

export async function importSupplierProducts(
  input: SupplierImportInput,
): Promise<SupplierImportResult> {
  const allItems = input.products.flatMap((product) =>
    materialiseSupplierImportItems(product, input.fieldMapping),
  );
  const sourceIds = allItems.map((item) => item.sourceId);
  const { data: existingRows, error: existingError } = sourceIds.length
    ? await input.admin
        .from("products")
        .select(
          "id, supplier_product_id, canonical_product_id, variant_group_id",
        )
        .eq("user_id", input.ownerUserId)
        .eq("supplier_scraper_id", input.scraperId)
        .in("supplier_product_id", sourceIds)
    : { data: [], error: null };
  if (existingError) throw new Error(existingError.message);

  const existingBySourceId = new Map(
    ((existingRows ?? []) as ExistingSupplierProduct[])
      .filter((row) => row.supplier_product_id)
      .map((row) => [row.supplier_product_id as string, row]),
  );
  const result: SupplierImportResult = {
    created: 0,
    updated: 0,
    groupsCreated: 0,
    imagesSaved: 0,
    errors: [],
    productIds: [],
  };

  for (const product of input.products) {
    const preference =
      input.imagePreferences?.[product.productId] ?? defaultImagePreference(product);
    const resolved = resolveProductImages(
      product,
      preference,
      input.excludedImages?.[product.productId] ?? [],
    );
    const mapped = applyFieldMapping(product, input.fieldMapping);
    const baseName = mapped.display_name;
    const categoryOverride = input.categoryOverrides?.[product.productId];
    const items = materialiseSupplierImportItems(product, input.fieldMapping).map((item) => ({
      ...item,
      heroImageUrl: resolved.heroImageUrl,
      imageUrls: resolved.imageUrls,
      ...(categoryOverride
        ? {
            marketplace_category: categoryOverride.category,
            marketplace_subcategory: categoryOverride.subcategory,
          }
        : {}),
    }));
    const importedItems: ImportedItem[] = [];

    for (const item of items) {
      try {
        const existing = existingBySourceId.get(item.sourceId) ?? null;
        const imported = await saveProductItem(input, item, baseName, existing);
        importedItems.push(imported);
        result.productIds.push(imported.productId);
        if (imported.existing) result.updated += 1;
        else result.created += 1;
      } catch (error) {
        result.errors.push(
          `${item.display_name}: ${
            error instanceof Error ? error.message : "Could not save product."
          }`,
        );
      }
    }

    if (importedItems.length === 0) continue;
    try {
      result.imagesSaved += await saveAllImages(input, importedItems, product);
      if (await ensureVariantGroup(input, product, importedItems)) {
        result.groupsCreated += 1;
      }
    } catch (error) {
      result.errors.push(
        `${baseName}: ${
          error instanceof Error ? error.message : "Could not save images or variants."
        }`,
      );
    }
  }

  try {
    await input.admin.rpc("refresh_public_marketplace_cards");
  } catch {
    // Product writes have succeeded. A later catalogue refresh can recover this cache.
  }
  return result;
}
