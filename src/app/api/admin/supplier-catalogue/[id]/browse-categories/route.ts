import { NextRequest, NextResponse } from "next/server";
import { discoverOptionSubcategories } from "@/lib/scrapers/supplier-engine";
import {
  createSupplierSseStream,
  SupplierScraperLogger,
} from "@/lib/scrapers/supplier-logger";
import { decryptSupplierCredentials } from "@/lib/scrapers/supplier-security";
import type {
  SupplierBrowseMode,
  SupplierScraperConfig,
} from "@/lib/scrapers/supplier-types";
import { requireSupplierCatalogueManager } from "@/lib/supplier-catalogue/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * POST /api/admin/supplier-catalogue/[id]/browse-categories
 * Load nested categories for selected brands/categories (same as supplier scrapers).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const auth = await requireSupplierCatalogueManager(supabase);
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const body = (await request.json()) as {
    optionIds?: unknown;
    mode?: unknown;
  };
  const mode: SupplierBrowseMode =
    body.mode === "category" ? "category" : "brand";
  const optionIds = Array.isArray(body.optionIds)
    ? body.optionIds.filter((value): value is string => typeof value === "string")
    : [];

  if (optionIds.length === 0) {
    return NextResponse.json(
      { error: `Select at least one ${mode} to load categories for.` },
      { status: 400 },
    );
  }
  if (optionIds.length > 10) {
    return NextResponse.json(
      { error: "Load categories for up to 10 selections at a time." },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();
  const { data: catalogue, error } = await admin
    .from("supplier_catalogues")
    .select("id, scrape_config, credential_ciphertext")
    .eq("id", id)
    .maybeSingle();

  if (error || !catalogue) {
    return NextResponse.json(
      { error: error?.message || "Catalogue not found" },
      { status: 404 },
    );
  }

  const config = catalogue.scrape_config as SupplierScraperConfig | null;
  if (!config?.productLinkSelector) {
    return NextResponse.json(
      { error: "Layout has not been discovered yet." },
      { status: 400 },
    );
  }

  const wantsStream = request.headers.get("accept")?.includes("text/event-stream");

  const execute = async (logger: SupplierScraperLogger) => {
    const credentials = decryptSupplierCredentials(
      catalogue.credential_ciphertext,
    );
    const categoriesByOption = await discoverOptionSubcategories({
      config,
      credentials,
      mode,
      optionIds,
      logger,
    });
    return { categoriesByOption, categoriesByBrand: categoriesByOption };
  };

  if (wantsStream) {
    return createSupplierSseStream(async (send, logger) => {
      const result = await execute(logger);
      send({ event: "result", ...result });
    });
  }

  try {
    const logger = new SupplierScraperLogger();
    const result = await execute(logger);
    return NextResponse.json({ success: true, ...result });
  } catch (loadError) {
    console.error("[supplier-catalogue/browse-categories]", loadError);
    return NextResponse.json(
      {
        error:
          loadError instanceof Error
            ? loadError.message
            : "Could not load categories for the selected options.",
      },
      { status: 500 },
    );
  }
}
