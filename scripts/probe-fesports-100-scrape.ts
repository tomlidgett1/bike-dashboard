/**
 * Live probe: scrape FE Sports "100%" brand only (no DB writes).
 *
 * Usage:
 *   FESPORTS_PROBE_USER=... FESPORTS_PROBE_PASS=... \
 *   npx tsx --env-file=.env.local scripts/probe-fesports-100-scrape.ts
 */
import { createClient } from "@supabase/supabase-js";
import {
  runSupplierScraper,
} from "../src/lib/scrapers/supplier-engine";
import { SupplierScraperLogger } from "../src/lib/scrapers/supplier-logger";
import { decryptSupplierCredentials } from "../src/lib/scrapers/supplier-security";
import type {
  SupplierBrowseOption,
  SupplierScraperConfig,
} from "../src/lib/scrapers/supplier-types";

const CATALOGUE_ID = "b3f52a03-45b9-4950-9a69-6c60edb1dc7a";

async function main() {
  const sb = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: catalogue, error } = await sb
    .from("supplier_catalogues")
    .select("id, name, scrape_config, credential_ciphertext, login_url, base_url")
    .eq("id", CATALOGUE_ID)
    .single();
  if (error || !catalogue) throw error || new Error("Catalogue not found");

  const config = catalogue.scrape_config as SupplierScraperConfig;
  const brand = (config.brandOptions as SupplierBrowseOption[]).find(
    (option) => option.name === "100%" || /\/Shop\/C_1549\b/i.test(option.url),
  );
  const productGrid = (config.categoryOptions as SupplierBrowseOption[]).find(
    (option) =>
      option.name === "100%" || /\/Shop\/c_230_1549\b/i.test(option.url),
  );

  console.log("Catalogue:", catalogue.name);
  console.log("Brand hub:", brand?.name, brand?.url);
  console.log("Product grid:", productGrid?.name, productGrid?.url);
  console.log("productLinkSelector:", config.productLinkSelector);
  console.log("productSelectors:", JSON.stringify(config.productSelectors, null, 2));

  if (!productGrid && !brand) {
    throw new Error("Could not find 100% brand or product grid in scrape_config");
  }

  const target = productGrid ?? brand!;
  const credentials = process.env.FESPORTS_PROBE_USER && process.env.FESPORTS_PROBE_PASS
    ? {
        username: process.env.FESPORTS_PROBE_USER,
        password: process.env.FESPORTS_PROBE_PASS,
      }
    : decryptSupplierCredentials(catalogue.credential_ciphertext);

  const logger = new SupplierScraperLogger();
  logger.onEntry((entry) => {
    console.log(
      `[+${entry.elapsedMs}ms] [${entry.level}] ${entry.step}: ${entry.message}`,
    );
  });

  console.log("\n=== Scraping 100% only (max 5 products, not saved) ===\n");
  const started = Date.now();
  const products = await runSupplierScraper({
    config,
    credentials,
    mode: "category",
    optionIds: [target.id],
    scrapeTargets: [
      {
        id: target.id,
        name: target.name,
        url: target.url,
        parentId: brand?.id ?? null,
      },
    ],
    maxProducts: 5,
    logger,
  });

  console.log("\n=== Result ===");
  console.log("Elapsed:", `${Date.now() - started}ms`);
  console.log("Products scraped:", products.length);
  for (const product of products) {
    console.log(
      `- ${product.name || "(no name)"} | sku=${product.sku || "?"} | $${product.price ?? "?"} | images=${product.imageUrls?.length ?? 0} | ${product.url}`,
    );
  }
  console.log("\nDone. Nothing written to the database.");
}

main().catch((error) => {
  console.error("\nProbe failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
