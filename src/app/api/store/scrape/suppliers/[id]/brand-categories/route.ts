import { NextRequest, NextResponse } from "next/server";
import { requireSupplierScraperManager } from "@/lib/scrapers/supplier-auth";
import { discoverOptionSubcategories } from "@/lib/scrapers/supplier-engine";
import { createSupplierSseStream, SupplierScraperLogger } from "@/lib/scrapers/supplier-logger";
import { decryptSupplierCredentials } from "@/lib/scrapers/supplier-security";
import { loadSupplierScraperRow } from "@/lib/scrapers/supplier-storage";
import type { SupplierBrowseMode } from "@/lib/scrapers/supplier-types";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSupplierScraperManager();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = (await request.json()) as {
    brandIds?: unknown;
    optionIds?: unknown;
    mode?: unknown;
  };
  const mode: SupplierBrowseMode = body.mode === "category" ? "category" : "brand";
  const optionIds = Array.isArray(body.optionIds)
    ? body.optionIds.filter((value): value is string => typeof value === "string")
    : Array.isArray(body.brandIds)
      ? body.brandIds.filter((value): value is string => typeof value === "string")
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

  const wantsStream = request.headers.get("accept")?.includes("text/event-stream");

  const execute = async (logger: SupplierScraperLogger) => {
    const scraper = await loadSupplierScraperRow(auth, id);
    const credentials = decryptSupplierCredentials(scraper.credential_ciphertext);
    const categoriesByBrand = await discoverOptionSubcategories({
      config: scraper.config,
      credentials,
      mode,
      optionIds,
      logger,
    });
    return { categoriesByBrand, categoriesByOption: categoriesByBrand };
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
  } catch (error) {
    console.error("[supplier-scrapers/brand-categories]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load categories for the selected options.",
      },
      { status: 500 },
    );
  }
}
