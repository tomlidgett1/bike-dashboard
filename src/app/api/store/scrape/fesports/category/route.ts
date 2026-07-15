import { NextRequest, NextResponse } from "next/server";
import type { CookieParam } from "puppeteer-core";
import { requireBicycleStore } from "@/lib/store/online-products-store-auth";
import { withFesportsPage } from "@/lib/scrapers/fesports-browser";
import { scrapeFesportsCategory } from "@/lib/scrapers/fesports-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireBicycleStore();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const categoryUrl = typeof body?.categoryUrl === "string" ? body.categoryUrl.trim() : "";
    if (!categoryUrl) {
      return NextResponse.json({ error: "categoryUrl is required" }, { status: 400 });
    }

    const cookies = Array.isArray(body?.cookies) ? (body.cookies as CookieParam[]) : null;
    const downloadImages = body?.downloadImages !== false;
    const maxProducts =
      typeof body?.maxProducts === "number" && body.maxProducts > 0
        ? Math.floor(body.maxProducts)
        : null;

    const startedAt = Date.now();
    console.log("[FEsports Scrape] Category start", {
      categoryUrl,
      downloadImages,
      maxProducts,
    });

    const products = await withFesportsPage(cookies, async (page) => {
      return scrapeFesportsCategory(page, categoryUrl, {
        downloadImages,
        maxProducts,
      });
    });

    const durationMs = Date.now() - startedAt;
    console.log("[FEsports Scrape] Category complete", {
      categoryUrl,
      count: products.length,
      durationMs,
      products: products.slice(0, 5).map((product) => product.name),
    });

    return NextResponse.json({
      success: true,
      categoryUrl,
      products,
      count: products.length,
      durationMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to scrape FEsports category";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
