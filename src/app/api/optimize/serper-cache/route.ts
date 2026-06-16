import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  parseSerperCacheRow,
  type SerperAiSelectionCache,
} from "@/lib/optimize/serper-image-cache";
import type { SpeedSearchCandidate } from "@/lib/admin/image-qa-speed";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const idsParam = request.nextUrl.searchParams.get("canonicalIds") || "";
    const canonicalIds = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (canonicalIds.length === 0) {
      return NextResponse.json({ caches: {} });
    }

    const { data: ownedRows, error: ownedError } = await supabase
      .from("products")
      .select("canonical_product_id")
      .eq("user_id", user.id)
      .in("canonical_product_id", canonicalIds);

    if (ownedError) {
      return NextResponse.json({ error: "Failed to verify products" }, { status: 500 });
    }

    const allowedIds = [
      ...new Set(
        (ownedRows || [])
          .map((row) => row.canonical_product_id as string | null)
          .filter((id): id is string => !!id),
      ),
    ];

    if (allowedIds.length === 0) {
      return NextResponse.json({ caches: {} });
    }

    const { data: rows, error } = await supabase
      .from("canonical_products")
      .select(
        "id, serper_candidates, serper_candidates_search_query, serper_candidates_fetched_at, serper_ai_selection",
      )
      .in("id", allowedIds);

    if (error) {
      return NextResponse.json({ error: "Failed to load cache" }, { status: 500 });
    }

    const caches: Record<string, ReturnType<typeof parseSerperCacheRow>> = {};
    for (const row of rows || []) {
      caches[row.id] = parseSerperCacheRow(row);
    }

    return NextResponse.json({ caches });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
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

    const body = await request.json();
    const canonicalProductId = body.canonicalProductId as string | undefined;
    if (!canonicalProductId) {
      return NextResponse.json({ error: "canonicalProductId is required" }, { status: 400 });
    }

    const { data: ownedRow, error: ownedError } = await supabase
      .from("products")
      .select("canonical_product_id")
      .eq("user_id", user.id)
      .eq("canonical_product_id", canonicalProductId)
      .limit(1)
      .maybeSingle();

    if (ownedError || !ownedRow) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const candidates = Array.isArray(body.candidates)
      ? (body.candidates as SpeedSearchCandidate[])
      : [];
    const searchQuery =
      typeof body.searchQuery === "string" ? body.searchQuery : null;
    const rawAi = body.aiSelection as Partial<SerperAiSelectionCache> | null | undefined;
    const aiSelection =
      rawAi?.primaryUrl && Array.isArray(rawAi.selectedCandidates)
        ? {
            selectedCandidates: rawAi.selectedCandidates as SpeedSearchCandidate[],
            selectedUrls: Array.isArray(rawAi.selectedUrls) ? rawAi.selectedUrls : [],
            primaryUrl: rawAi.primaryUrl,
            photoSystem:
              rawAi.photoSystem === "smart_product_photos"
                ? ("smart_product_photos" as const)
                : undefined,
            smartPhotoPayloadKey:
              typeof rawAi.smartPhotoPayloadKey === "string"
                ? rawAi.smartPhotoPayloadKey
                : undefined,
            reasoning: rawAi.reasoning,
          }
        : null;

    const { error } = await supabase
      .from("canonical_products")
      .update({
        serper_candidates: candidates,
        serper_candidates_search_query: searchQuery,
        serper_candidates_fetched_at: new Date().toISOString(),
        serper_ai_selection: aiSelection,
        image_review_status: aiSelection
          ? "recommended"
          : candidates.length > 0
            ? "in_review"
            : "no_results",
      })
      .eq("id", canonicalProductId);

    if (error) {
      return NextResponse.json({ error: "Failed to save cache" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
