import type { PublicMarketplaceCardRow } from "@/lib/marketplace/public-card-feed";

// Same hard gate as llm-similar-products: obvious non-cycling inventory
// (e.g. automotive parts test stores) must never reach the For You feed.
const NON_CYCLING_TITLE =
  /\b(mercedes|bmw|audi|toyota|honda civic|nissan|ford|holden|mazda|volkswagen|porsche|ferrari|lamborghini|automotive|car part|engine oil|motor oil|wiper blade|spark plug|transmission fluid|car battery|vehicle|automobile|abs unit|serpentine belt)\b/i;

export function isCyclingMarketplaceRow(row: PublicMarketplaceCardRow): boolean {
  const title = `${row.display_name || ""} ${row.description || ""}`;
  return !NON_CYCLING_TITLE.test(title);
}
