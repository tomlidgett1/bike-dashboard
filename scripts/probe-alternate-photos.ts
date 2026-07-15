import { fetchAlternatePhotoForProduct } from "../src/lib/scrapers/supplier-alternate-photos";
import { SupplierScraperLogger } from "../src/lib/scrapers/supplier-logger";
import {
  launchSupplierBrowser,
  prepareSupplierPage,
} from "../src/lib/scrapers/supplier-browser";
import { assertSafeSupplierUrl } from "../src/lib/scrapers/supplier-security";
import type {
  AlternatePhotoSourceConfig,
  SupplierScrapedProduct,
} from "../src/lib/scrapers/supplier-types";

async function main() {
  const websiteUrl = process.argv[2] ?? "https://www.focus-bikes.com/int/";
  const productName = process.argv[3] ?? "F26 Izalco Max 9.9";
  const sku = process.argv[4] ?? "";
  const brand = process.argv[5] ?? "Focus";
  const searchTemplate = process.argv[6] ?? "";

  const config: AlternatePhotoSourceConfig = {
    enabled: true,
    websiteUrl,
    sourceName: new URL(websiteUrl).hostname,
    searchUrlTemplate: searchTemplate || null,
  };

  const product: SupplierScrapedProduct = {
    productId: "probe-izalco",
    name: productName,
    url: "https://ponbikeaus.com.au/probe",
    categoryUrl: "https://ponbikeaus.com.au/focus",
    sku: sku || null,
    brand,
    price: null,
    soh: null,
    sohRaw: null,
    description: null,
    imageUrls: [],
    heroImageUrl: null,
    fields: {},
    variants: [],
  };

  const logger = new SupplierScraperLogger();
  logger.onEntry((entry) => {
    const meta = entry.meta ? ` ${JSON.stringify(entry.meta)}` : "";
    console.log(`[+${entry.elapsedMs}ms] [${entry.level}] ${entry.step}: ${entry.message}${meta}`);
  });

  console.log(`Probing alternate photos for "${productName}" on ${websiteUrl}`);
  const started = Date.now();
  const safeUrl = await assertSafeSupplierUrl(websiteUrl);
  const browser = await launchSupplierBrowser(logger);

  try {
    const page = await prepareSupplierPage(browser);
    const match = await fetchAlternatePhotoForProduct(
      page,
      product,
      config,
      safeUrl.hostname,
      logger,
    );

    console.log("\nProbe finished in", `${Date.now() - started}ms`);
    console.log("Status:", match.status);
    console.log("Match method:", match.matchMethod);
    console.log("Match score:", match.matchScore);
    console.log("Product URL:", match.productUrl);
    console.log("Images:", match.imageUrls.length);
    if (match.imageUrls[0]) console.log("First image:", match.imageUrls[0]);
    if (match.error) console.log("Error:", match.error);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("\nProbe failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
