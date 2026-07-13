import { NextRequest, NextResponse } from "next/server";
import type { CookieParam } from "puppeteer-core";
import { requireBicycleStore } from "@/lib/store/online-products-store-auth";
import { withFesportsPage } from "@/lib/scrapers/fesports-browser";
import {
  discoverFesportsCategories,
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
    const maxCategories =
      typeof body?.maxCategories === "number" && body.maxCategories > 0
        ? Math.floor(body.maxCategories)
        : null;
    const cookies = Array.isArray(body?.cookies) ? (body.cookies as CookieParam[]) : null;

    const categories = await withFesportsPage(cookies, async (page) => {
      return discoverFesportsCategories(page, startUrl, maxCategories);
    });

    return NextResponse.json({
      success: true,
      startUrl,
      categories,
      count: categories.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to discover FEsports categories";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
