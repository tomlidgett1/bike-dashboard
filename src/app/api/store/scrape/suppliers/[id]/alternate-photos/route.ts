import { NextRequest, NextResponse } from "next/server";
import { fetchAlternatePhotosForProducts } from "@/lib/scrapers/supplier-alternate-photos";
import { requireSupplierScraperManager } from "@/lib/scrapers/supplier-auth";
import { createSupplierSseStream, SupplierScraperLogger } from "@/lib/scrapers/supplier-logger";
import { loadSupplierScraperRow } from "@/lib/scrapers/supplier-storage";
import type {
  AlternatePhotoSourceConfig,
  SupplierScrapedProduct,
} from "@/lib/scrapers/supplier-types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function normaliseAlternatePhotoConfig(
  value: unknown,
): AlternatePhotoSourceConfig | null {
  if (!value || typeof value !== "object") return null;
  const config = value as Record<string, unknown>;
  const websiteUrl = typeof config.websiteUrl === "string" ? config.websiteUrl.trim() : "";
  if (!websiteUrl) return null;
  return {
    enabled: config.enabled !== false,
    websiteUrl,
    sourceName:
      typeof config.sourceName === "string" && config.sourceName.trim()
        ? config.sourceName.trim().slice(0, 120)
        : new URL(websiteUrl).hostname,
    searchUrlTemplate:
      typeof config.searchUrlTemplate === "string" && config.searchUrlTemplate.trim()
        ? config.searchUrlTemplate.trim()
        : null,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSupplierScraperManager();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = (await request.json()) as {
    products?: unknown;
    alternatePhotoSource?: unknown;
  };
  const products = Array.isArray(body.products)
    ? (body.products as SupplierScrapedProduct[])
    : [];
  if (products.length === 0) {
    return NextResponse.json(
      { error: "Select at least one scraped product to match official photos." },
      { status: 400 },
    );
  }
  if (products.length > 100) {
    return NextResponse.json(
      { error: "Match official photos for up to 100 products at a time." },
      { status: 400 },
    );
  }

  const wantsStream = request.headers.get("accept")?.includes("text/event-stream");

  const execute = async (
    send: ((payload: Record<string, unknown>) => void) | undefined,
    logger: SupplierScraperLogger,
  ) => {
    const scraper = await loadSupplierScraperRow(auth, id);
    const alternatePhotoSource =
      normaliseAlternatePhotoConfig(body.alternatePhotoSource) ||
      scraper.config.alternatePhotoSource ||
      null;
    if (!alternatePhotoSource?.enabled || !alternatePhotoSource.websiteUrl) {
      throw new Error("Configure an official photo website before fetching alternate photos.");
    }

    const enriched = await fetchAlternatePhotosForProducts({
      products,
      config: alternatePhotoSource,
      logger,
      onProductMatched: send
        ? (product, progress) => {
            send({ event: "product", product, progress });
          }
        : undefined,
    });

    return { products: enriched, alternatePhotoSource };
  };

  if (wantsStream) {
    return createSupplierSseStream(async (send, logger) => {
      const result = await execute(send, logger);
      send({ event: "result", ...result });
    });
  }

  try {
    const logger = new SupplierScraperLogger();
    const result = await execute(undefined, logger);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[supplier-scrapers/alternate-photos]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not fetch official product photos.",
      },
      { status: 500 },
    );
  }
}
