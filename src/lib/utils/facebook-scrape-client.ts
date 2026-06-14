import type { FacebookScrapedData } from "@/lib/mappers/facebook-to-listing";

interface ScrapeFacebookListingResponse {
  success: boolean;
  data: FacebookScrapedData;
  source_url: string;
}

export async function scrapeFacebookListing(
  facebookUrl: string,
  accessToken: string,
): Promise<ScrapeFacebookListingResponse> {
  const response = await fetch("/api/marketplace/scrape-facebook-listing", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ facebookUrl }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Failed to scrape Facebook listing");
  }

  return payload as ScrapeFacebookListingResponse;
}
