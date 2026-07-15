import { buildSupplierScraper } from "../src/lib/scrapers/supplier-engine";
import { SupplierScraperLogger } from "../src/lib/scrapers/supplier-logger";

async function main() {
  const websiteUrl = process.argv[2] ?? "https://ponbikeaus.com.au/login/";
  const loginUrl = process.argv[3] ?? websiteUrl;
  const username = process.argv[4] ?? process.env.SUPPLIER_PROBE_USERNAME ?? "";
  const password = process.argv[5] ?? process.env.SUPPLIER_PROBE_PASSWORD ?? "";

  if (!username || !password) {
    console.error(
      "Usage: tsx --env-file=.env.local scripts/probe-supplier-scraper.ts [websiteUrl] [loginUrl] [username] [password]",
    );
    process.exit(1);
  }

  const logger = new SupplierScraperLogger();
  logger.onEntry((entry) => {
    const meta = entry.meta ? ` ${JSON.stringify(entry.meta)}` : "";
    console.log(`[+${entry.elapsedMs}ms] [${entry.level}] ${entry.step}: ${entry.message}${meta}`);
  });

  console.log(`Probing supplier scraper for ${websiteUrl}`);
  const started = Date.now();
  const { config, sampleProducts } = await buildSupplierScraper({
    websiteUrl,
    loginUrl,
    credentials: { username, password },
    logger,
  });

  console.log("\nBuild succeeded in", `${Date.now() - started}ms`);
  console.log("Supplier:", config.supplierName);
  console.log("Catalogue:", config.catalogueUrl);
  console.log("Browse modes:", config.browseModes.join(", "));
  console.log("Brand options:", config.brandOptions.length);
  console.log("Category options:", config.categoryOptions.length);
  console.log("Product link selector:", config.productLinkSelector);
  console.log("Sample products:", sampleProducts.length);
  if (sampleProducts[0]) {
    console.log("Sample product:", sampleProducts[0].name);
    console.log("Sample SKU:", sampleProducts[0].sku);
    console.log("Sample images:", sampleProducts[0].imageUrls.length);
  }
}

main().catch((error) => {
  console.error("\nProbe failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
