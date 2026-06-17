/**
 * POST /api/optimize/hero-images
 *
 * Runs the advanced "Smart product photos" pipeline for a single product and
 * returns the chosen hero + supporting images, plus the full funnel and reject
 * breakdown for transparency.
 *
 * Serper is reached via the Supabase edge function (which holds SERPER_API_KEY),
 * matching the rest of the optimise image flow. The pipeline downloads + measures
 * images with sharp, so this must run on the Node.js runtime.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runHeroImagePipeline } from "@/lib/optimize/hero-images/pipeline";
import type { ProductInput, RawHit } from "@/lib/optimize/hero-images/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

interface EdgeImageResult {
  url?: string;
  thumbnailUrl?: string;
  title?: string;
  source?: string;
  domain?: string;
  width?: number;
  height?: number;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      return NextResponse.json({ error: "No access token" }, { status: 401 });
    }

    const body = await request.json();
    const name = (body.name as string | undefined)?.trim();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const product: ProductInput = {
      name,
      brand: (body.brand as string | undefined)?.trim() || null,
      upc: (body.upc as string | undefined)?.trim() || null,
      description: (body.description as string | undefined)?.trim() || null,
      searchQuery: (body.searchQuery as string | undefined)?.trim() || null,
      maxImages: Math.min(Math.max(Number(body.maxImages) || 6, 1), 6),
    };

    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/search-product-images`;

    const serperSearch = async (query: string): Promise<RawHit[]> => {
      const res = await fetch(functionUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ searchQuery: query }),
      });
      if (!res.ok) return [];
      const data = (await res.json().catch(() => null)) as
        | { success?: boolean; results?: EdgeImageResult[] }
        | null;
      if (!data?.success || !Array.isArray(data.results)) return [];
      return data.results
        .filter((r): r is EdgeImageResult & { url: string } => typeof r.url === "string")
        .map((r) => ({
          url: r.url,
          thumbnailUrl: r.thumbnailUrl,
          title: r.title,
          source: r.source,
          domain: r.domain,
          reportedWidth: r.width,
          reportedHeight: r.height,
        }));
    };

    const result = await runHeroImagePipeline(product, { serperSearch });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[HERO-IMAGES] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pipeline failed" },
      { status: 500 },
    );
  }
}
