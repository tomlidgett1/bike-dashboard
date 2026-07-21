import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type {
  BikeUrlDraft,
  BikeUrlImportRequest,
  BikeUrlImportResult,
} from "@/lib/scrapers/bike-url-types";
import { getImageVariantKey } from "@/lib/scrapers/fesports-scraper";
import {
  chooseHighestQualityImageUrls,
  upgradeProductImageUrl,
} from "@/lib/scrapers/product-image-quality";
import { requireSupplierScraperManager } from "@/lib/scrapers/supplier-auth";
import {
  ensureCanonical,
  scheduleCloudinaryUpload,
} from "@/lib/scrapers/supplier-import";
import { resolveCanonicalPath } from "@/lib/marketplace/canonical-taxonomy";
import type { BikeSpecsData } from "@/lib/types/bike-specs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function urlHash(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 12);
}

function parseBody(raw: unknown): BikeUrlImportRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const draft = body.draft as BikeUrlDraft | undefined;
  if (!draft || typeof draft !== "object" || !draft.sourceUrl || !draft.name) return null;

  const price = Number(body.price);
  if (!Number.isFinite(price) || price <= 0) return null;

  const sizes = Array.isArray(body.sizes)
    ? (body.sizes as Array<Record<string, unknown>>)
        .map((size) => ({
          name: String(size.name ?? "").trim(),
          sku: size.sku ? String(size.sku).trim() : null,
          qoh: Math.max(0, Math.floor(Number(size.qoh) || 0)),
        }))
        .filter((size) => size.name)
    : [];

  const imageUrls = Array.isArray(body.imageUrls)
    ? (body.imageUrls as unknown[]).map(String).filter(Boolean)
    : [];

  const rawLevel1 = String((body as { marketplace_category?: string }).marketplace_category ?? "Bicycles");
  const rawLevel2 = String(body.subcategory ?? "Hybrid / Fitness");
  const resolved =
    resolveCanonicalPath(rawLevel1, rawLevel2, null) ||
    resolveCanonicalPath("Bicycles", rawLevel2, null) ||
    resolveCanonicalPath("E-Bikes", rawLevel2, null) ||
    resolveCanonicalPath("Bicycles", "Hybrid / Fitness", null);

  return {
    draft,
    price,
    sizes,
    imageUrls,
    heroImageUrl: body.heroImageUrl ? String(body.heroImageUrl) : imageUrls[0] ?? null,
    subcategory: resolved?.level2 ?? "Hybrid / Fitness",
    marketplace_category: resolved?.level1 ?? "Bicycles",
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireSupplierScraperManager();
  if ("error" in auth) return auth.error;

  try {
    const input = parseBody(await request.json());
    if (!input) {
      return NextResponse.json(
        { error: "Set a valid store price before importing the bike." },
        { status: 400 },
      );
    }
    if (input.imageUrls.length === 0) {
      return NextResponse.json(
        { error: "Keep at least one photo for the product page." },
        { status: 400 },
      );
    }

    const admin = createServiceRoleClient();
    const {
      data: { session },
    } = await auth.supabase.auth.getSession();
    const accessToken = session?.access_token ?? null;
    const { draft } = input;
    const sourceKey = urlHash(draft.sourceUrl);
    const now = Date.now();

    const result: BikeUrlImportResult = {
      created: 0,
      groupCreated: false,
      imagesSaved: 0,
      masterProductId: null,
      errors: [],
    };

    const bikeSpecs: BikeSpecsData | null =
      draft.specSections.length > 0
        ? {
            sections: draft.specSections,
            metadata: {
              primary_source_url: draft.sourceUrl,
              primary_source_title: `${draft.brand ?? ""} official product page`.trim(),
              brand_website: null,
              discovered_at: new Date().toISOString(),
              sources: [
                {
                  url: draft.sourceUrl,
                  title: draft.name,
                  is_official_brand: true,
                },
              ],
            },
          }
        : null;

    const canonicalId = await ensureCanonical(admin, draft.name, draft.brand);
    // A bike with no size options still imports as a single product row.
    const sizes = input.sizes.length > 0 ? input.sizes : [{ name: "", sku: null, qoh: 0 }];
    const insertedIds: Array<{ id: string; sizeName: string; isMaster: boolean }> = [];
    const imageUrls = chooseHighestQualityImageUrls(input.imageUrls, draft.sourceUrl);
    const heroImageUrl = upgradeProductImageUrl(
      input.heroImageUrl ?? imageUrls[0] ?? "",
      draft.sourceUrl,
    ) || imageUrls[0] || null;

    for (let index = 0; index < sizes.length; index += 1) {
      const size = sizes[index];
      const isMaster = index === 0;
      const displayName = size.name ? `${draft.name} - ${size.name}` : draft.name;
      const values = {
        user_id: auth.user.id,
        listing_type: "store_inventory",
        listing_source: "bike_url_import",
        listing_status: "active",
        is_active: true,
        canonical_product_id: canonicalId,
        description: draft.name,
        display_name: displayName,
        brand: draft.brand,
        manufacturer_name: draft.brand,
        model: draft.model,
        model_year: draft.modelYear,
        bike_type: draft.bikeType,
        frame_size: size.name || null,
        is_bicycle: true,
        bike_specs: bikeSpecs,
        price: input.price,
        marketplace_category: input.marketplace_category || "Bicycles",
        marketplace_subcategory: input.subcategory,
        product_description:
          draft.description || [`Source: official product page`, draft.sourceUrl].join("\n"),
        qoh: size.qoh,
        system_sku: size.sku || `YJ-BIKE-${sourceKey}-${index + 1}`,
        lightspeed_item_id: `bike_url-${sourceKey}-${index}-${now}`,
        primary_image_url: heroImageUrl ?? imageUrls[0] ?? null,
        supplier_source_url: draft.sourceUrl,
      };

      const { data, error } = await admin
        .from("products")
        .insert(values)
        .select("id")
        .single();
      if (error || !data) {
        result.errors.push(`${displayName}: ${error?.message ?? "insert failed"}`);
        continue;
      }
      insertedIds.push({ id: String(data.id), sizeName: size.name, isMaster });
      result.created += 1;
      if (isMaster) result.masterProductId = String(data.id);
    }

    if (insertedIds.length === 0) {
      return NextResponse.json(
        { error: result.errors.join(" ") || "Could not create the bike products." },
        { status: 500 },
      );
    }

    // Photos: saved once against the master product's canonical, like the
    // supplier import pipeline. Cloudinary uploads continue in the background.
    const master = insertedIds[0];
    const heroKey = heroImageUrl ? getImageVariantKey(heroImageUrl) : null;
    let selectedImageId: string | null = null;
    for (let index = 0; index < imageUrls.length; index += 1) {
      const imageUrl = imageUrls[index];
      const isPrimary = heroKey
        ? getImageVariantKey(imageUrl) === heroKey
        : index === 0;
      const { data, error } = await admin
        .from("product_images")
        .insert({
          product_id: master.id,
          canonical_product_id: canonicalId,
          external_url: imageUrl,
          is_downloaded: false,
          approval_status: "approved",
          is_primary: isPrimary,
          sort_order: index,
          source: "bike_url_scrape",
          uploaded_by: auth.actorUserId,
        })
        .select("id")
        .single();
      if (error || !data) {
        result.errors.push(`Photo ${index + 1}: ${error?.message ?? "could not save"}`);
        continue;
      }
      result.imagesSaved += 1;
      if (isPrimary) selectedImageId = String(data.id);
      await scheduleCloudinaryUpload(
        admin,
        accessToken,
        String(data.id),
        canonicalId,
        imageUrl,
        index,
      );
    }

    if (selectedImageId) {
      await admin
        .from("products")
        .update({ selected_product_image_id: selectedImageId })
        .in(
          "id",
          insertedIds.map((item) => item.id),
        )
        .eq("user_id", auth.user.id);
    }

    // Size variant group so the storefront shows one bike with a size picker.
    if (insertedIds.length > 1) {
      const { data: group, error: groupError } = await admin
        .from("product_variant_groups")
        .insert({
          user_id: auth.user.id,
          master_title: draft.name,
          brand: draft.brand,
          category_name: "Bicycles",
          visibility_mode: "master_only",
          sync_target: "local",
          status: "active",
        })
        .select("id")
        .single();
      if (groupError || !group) {
        result.errors.push(groupError?.message ?? "Could not create the size group.");
      } else {
        const groupId = String(group.id);
        result.groupCreated = true;
        const { data: option, error: optionError } = await admin
          .from("product_variant_options")
          .insert({
            group_id: groupId,
            user_id: auth.user.id,
            name: "Size",
            position: 1,
          })
          .select("id")
          .single();
        if (optionError || !option) {
          result.errors.push(optionError?.message ?? "Could not create the size option.");
        } else {
          for (let index = 0; index < insertedIds.length; index += 1) {
            const item = insertedIds[index];
            const value = item.sizeName || `Size ${index + 1}`;
            const { error: valueError } = await admin
              .from("product_variant_values")
              .insert({
                option_id: option.id,
                group_id: groupId,
                user_id: auth.user.id,
                value,
                position: index + 1,
              });
            if (valueError) result.errors.push(valueError.message);
            const { error: itemError } = await admin
              .from("product_variant_group_items")
              .insert({
                group_id: groupId,
                user_id: auth.user.id,
                product_id: item.id,
                is_master: item.isMaster,
                value_assignments: { Size: value },
                position: index,
              });
            if (itemError) result.errors.push(itemError.message);
            const { error: updateError } = await admin
              .from("products")
              .update({
                variant_group_id: groupId,
                variant_hidden_from_grid: !item.isMaster,
                variant_master_title: item.isMaster ? draft.name : null,
              })
              .eq("id", item.id)
              .eq("user_id", auth.user.id);
            if (updateError) result.errors.push(updateError.message);
          }
          await admin.from("product_variant_audit_logs").insert({
            user_id: auth.user.id,
            group_id: groupId,
            action: "created_from_bike_url_import",
            detail: {
              source_url: draft.sourceUrl,
              actor_user_id: auth.actorUserId,
              item_count: insertedIds.length,
            },
          });
        }
      }
    }

    try {
      await admin.rpc("refresh_public_marketplace_cards");
    } catch {
      // Product writes have succeeded. A later catalogue refresh can recover this cache.
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[bike-url/import]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not import this bike.",
      },
      { status: 500 },
    );
  }
}
