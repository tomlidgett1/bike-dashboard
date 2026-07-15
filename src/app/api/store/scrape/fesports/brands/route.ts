import { NextRequest, NextResponse } from "next/server";
import type { CookieParam } from "puppeteer-core";
import { requireBicycleStore } from "@/lib/store/online-products-store-auth";
import { withFesportsPage } from "@/lib/scrapers/fesports-browser";
import {
  discoverFesportsBrands,
  FESPORTS_DEFAULT_START_URL,
} from "@/lib/scrapers/fesports-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireBicycleStore();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const startUrl =
      typeof body?.startUrl === "string" && body.startUrl.trim()
        ? body.startUrl.trim()
        : FESPORTS_DEFAULT_START_URL;
    const cookies = Array.isArray(body?.cookies) ? (body.cookies as CookieParam[]) : null;

    const startedAt = Date.now();
    console.log("[FEsports Scrape] Brands start", { startUrl });

    const brands = await withFesportsPage(cookies, async (page) => {
      return discoverFesportsBrands(page, startUrl);
    });

    const durationMs = Date.now() - startedAt;
    console.log("[FEsports Scrape] Brands complete", {
      startUrl,
      count: brands.length,
      durationMs,
    });

    return NextResponse.json({
      success: true,
      startUrl,
      brands,
      count: brands.length,
      durationMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to discover FEsports brands";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
