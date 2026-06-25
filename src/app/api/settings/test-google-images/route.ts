/**
 * GET /api/settings/test-google-images?q=...
 * Google Images search via SearchAPI (verified bicycle stores only).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchApiImage = {
  position: number;
  title: string;
  thumbnail: string;
  original: {
    link: string;
    width: number;
    height: number;
  };
  source: {
    name: string;
    link: string;
  };
};

type SearchApiResponse = {
  images?: SearchApiImage[];
  error?: string;
};

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("account_type, bicycle_store")
      .eq("user_id", user.id)
      .single();

    if (!profile || profile.account_type !== "bicycle_store" || !profile.bicycle_store) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (!query) {
      return NextResponse.json({ error: "Enter a search query" }, { status: 400 });
    }

    const apiKey = process.env.SEARCHAPI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "SEARCHAPI_API_KEY is not configured" },
        { status: 500 },
      );
    }

    const params = new URLSearchParams({
      engine: "google_images",
      q: query,
      gl: "au",
      hl: "en",
    });

    const response = await fetch(
      `https://www.searchapi.io/api/v1/search?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        cache: "no-store",
      },
    );

    const data = (await response.json()) as SearchApiResponse;

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || `Search failed (${response.status})` },
        { status: response.status },
      );
    }

    const images = (data.images ?? []).map((image) => ({
      position: image.position,
      title: image.title,
      thumbnail: image.thumbnail,
      originalUrl: image.original.link,
      width: image.original.width,
      height: image.original.height,
      sourceName: image.source.name,
      sourceUrl: image.source.link,
    }));

    return NextResponse.json({
      success: true,
      query,
      images,
      total: images.length,
    });
  } catch (err) {
    console.error("Error in GET /api/settings/test-google-images:", err);
    return NextResponse.json({ error: "Image search failed" }, { status: 500 });
  }
}
