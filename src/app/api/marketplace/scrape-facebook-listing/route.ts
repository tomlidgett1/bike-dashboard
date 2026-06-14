import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  cleanFacebookListingUrl,
  scrapeFacebookMarketplaceListing,
} from "@/lib/scrapers/facebook-marketplace-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function getAuthenticatedUser(request: NextRequest) {
  const supabase = await createClient();
  const cookieAuth = await supabase.auth.getUser();
  if (cookieAuth.data.user) {
    return cookieAuth.data.user;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return data.user;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const body = await request.json();
    const facebookUrl = typeof body?.facebookUrl === "string" ? body.facebookUrl.trim() : "";

    if (!facebookUrl) {
      return NextResponse.json({ error: "Facebook URL is required" }, { status: 400 });
    }

    const { listingUrl } = cleanFacebookListingUrl(facebookUrl);
    const scrapedData = await scrapeFacebookMarketplaceListing(facebookUrl);

    return NextResponse.json({
      success: true,
      data: scrapedData,
      source_url: listingUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Invalid Facebook Marketplace URL") ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
