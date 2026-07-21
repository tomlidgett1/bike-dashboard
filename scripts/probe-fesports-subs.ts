/**
 * One-off live probe: FE Sports layout + subcategory discovery.
 * Does not write to the database.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/probe-fesports-subs.ts
 */
import {
  buildSupplierScraper,
  discoverOptionSubcategories,
} from "../src/lib/scrapers/supplier-engine";
import { SupplierScraperLogger } from "../src/lib/scrapers/supplier-logger";

async function main() {
  const websiteUrl = "https://www.fesports.com.au/";
  const loginUrl = "https://www.fesports.com.au/Login";
  const username = process.env.FESPORTS_PROBE_USER;
  const password = process.env.FESPORTS_PROBE_PASS;
  if (!username || !password) {
    console.error(
      "Set FESPORTS_PROBE_USER and FESPORTS_PROBE_PASS (do not commit these).",
    );
    process.exit(1);
  }

  const logger = new SupplierScraperLogger();
  logger.onEntry((entry) => {
    console.log(
      `[+${entry.elapsedMs}ms] [${entry.level}] ${entry.step}: ${entry.message}`,
    );
  });

  console.log("=== 1) Live layout discovery (not saved) ===");
  const started = Date.now();
  const { config } = await buildSupplierScraper({
    websiteUrl,
    loginUrl,
    credentials: { username, password },
    logger,
  });

  console.log("\nLayout ready in", `${Date.now() - started}ms`);
  console.log("Supplier:", config.supplierName);
  console.log("Brands:", config.brandOptions.length);
  console.log("Categories:", config.categoryOptions.length);
  console.log(
    "Brand names:",
    config.brandOptions.map((b) => b.name).join(", "),
  );

  const brandIds = config.brandOptions.map((b) => b.id);
  console.log("\n=== 2) Load nested options for ALL brands (batched) ===");

  const allNested: Record<string, { name: string; count: number; samples: string[] }> =
    {};
  let totalNested = 0;

  for (let i = 0; i < brandIds.length; i += 5) {
    const batch = brandIds.slice(i, i + 5);
    const batchNames = batch
      .map((id) => config.brandOptions.find((b) => b.id === id)?.name)
      .join(", ");
    console.log(`\nBatch ${i / 5 + 1}: ${batchNames}`);

    const nested = await discoverOptionSubcategories({
      config,
      credentials: { username, password },
      mode: "brand",
      optionIds: batch,
      logger,
    });

    for (const id of batch) {
      const parent = config.brandOptions.find((b) => b.id === id);
      const kids = nested[id] ?? [];
      totalNested += kids.length;
      allNested[parent?.name ?? id] = {
        name: parent?.name ?? id,
        count: kids.length,
        samples: kids.slice(0, 8).map((k) => k.name),
      };
      console.log(
        `  ${parent?.name}: ${kids.length} nested` +
          (kids.length
            ? ` → ${kids
                .slice(0, 5)
                .map((k) => k.name)
                .join(", ")}${kids.length > 5 ? "…" : ""}`
            : ""),
      );
    }
  }

  console.log("\n=== Summary (not saved) ===");
  console.log("Brands probed:", brandIds.length);
  console.log("Total nested links found:", totalNested);
  const withKids = Object.values(allNested).filter((row) => row.count > 0);
  const withoutKids = Object.values(allNested).filter((row) => row.count === 0);
  console.log("Brands with nested options:", withKids.length);
  console.log("Brands with none:", withoutKids.length);
  if (withoutKids.length) {
    console.log(
      "Empty brands:",
      withoutKids.map((row) => row.name).join(", "),
    );
  }

  // Also try category mode for a couple of categories if present
  if (config.categoryOptions.length > 0) {
    console.log("\n=== 3) Sample category nested load (first 5) ===");
    const catBatch = config.categoryOptions.slice(0, 5).map((c) => c.id);
    const catNested = await discoverOptionSubcategories({
      config,
      credentials: { username, password },
      mode: "category",
      optionIds: catBatch,
      logger,
    });
    for (const id of catBatch) {
      const parent = config.categoryOptions.find((c) => c.id === id);
      const kids = catNested[id] ?? [];
      console.log(`  ${parent?.name}: ${kids.length} nested`);
    }
  }

  console.log("\nDone. Nothing was written to the database.");
}

main().catch((error) => {
  console.error("\nProbe failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
