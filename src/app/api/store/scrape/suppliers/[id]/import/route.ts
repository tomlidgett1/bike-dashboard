import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  DEFAULT_FIELD_MAPPING,
  validateFieldMapping,
  type FieldMapping,
} from "@/lib/scrapers/fesports-field-mapping";
import { requireSupplierScraperManager } from "@/lib/scrapers/supplier-auth";
import { sanitiseCategoryOverrides } from "@/lib/scrapers/supplier-category";
import { importSupplierProducts } from "@/lib/scrapers/supplier-import";
import { loadSupplierScraperRow } from "@/lib/scrapers/supplier-storage";
import type { SupplierScrapedProduct } from "@/lib/scrapers/supplier-types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSupplierScraperManager();
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const scraper = await loadSupplierScraperRow(auth, id);
    const body = (await request.json()) as {
      products?: unknown;
      fieldMapping?: unknown;
      imagePreferences?: unknown;
      excludedImages?: unknown;
      categoryOverrides?: unknown;
    };
    const products = Array.isArray(body.products)
      ? (body.products as SupplierScrapedProduct[])
      : [];
    const fieldMapping =
      body.fieldMapping && typeof body.fieldMapping === "object"
        ? (body.fieldMapping as FieldMapping)
        : scraper.field_mapping || DEFAULT_FIELD_MAPPING;

    if (products.length === 0) {
      return NextResponse.json(
        { error: "Select at least one product to import or update." },
        { status: 400 },
      );
    }
    if (products.length > 500) {
      return NextResponse.json(
        { error: "Import up to 500 products in one reviewed batch." },
        { status: 400 },
      );
    }

    const mappingErrors = validateFieldMapping(fieldMapping, products);
    if (mappingErrors.length > 0) {
      return NextResponse.json(
        { error: mappingErrors.join(" ") },
        { status: 400 },
      );
    }

    const {
      data: { session },
    } = await auth.supabase.auth.getSession();
    const result = await importSupplierProducts({
      admin: createServiceRoleClient(),
      ownerUserId: auth.user.id,
      actorUserId: auth.actorUserId,
      accessToken: session?.access_token ?? null,
      scraperId: id,
      scraperName: scraper.name,
      products,
      fieldMapping,
      imagePreferences:
        body.imagePreferences && typeof body.imagePreferences === "object"
          ? (body.imagePreferences as Record<string, "supplier" | "alternate" | "both">)
          : undefined,
      excludedImages:
        body.excludedImages && typeof body.excludedImages === "object"
          ? (body.excludedImages as Record<string, string[]>)
          : undefined,
      categoryOverrides: sanitiseCategoryOverrides(body.categoryOverrides),
    });

    await auth.supabase
      .from("store_supplier_scrapers")
      .update({
        field_mapping: fieldMapping,
        status: "ready",
        last_run_summary: {
          ...scraper.last_run_summary,
          imported_products: products.length,
          created_items: result.created,
          updated_items: result.updated,
          images_saved: result.imagesSaved,
          variant_groups_created: result.groupsCreated,
        },
        last_error: result.errors.length > 0 ? result.errors.join("\n").slice(0, 1_000) : null,
      })
      .eq("id", id)
      .eq("owner_user_id", auth.user.id);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[supplier-scrapers/import]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not import the supplier products.",
      },
      { status: 500 },
    );
  }
}
