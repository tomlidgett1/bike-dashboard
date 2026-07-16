import OpenAI from "openai";
import { buildProductImageList } from "@/lib/scrapers/fesports-scraper";
import type { BikeUrlDraft, BikeUrlSize } from "@/lib/scrapers/bike-url-types";
import {
  chooseHighestQualityImageUrls,
  upgradeProductImageUrl,
} from "@/lib/scrapers/product-image-quality";
import {
  launchSupplierBrowser,
  navigateSupplierPage,
  prepareSupplierPage,
  snapshotSupplierPage,
  type SupplierPageSnapshot,
} from "@/lib/scrapers/supplier-browser";
import type { SupplierScraperLogger } from "@/lib/scrapers/supplier-logger";
import { evaluateSupplierRuntime } from "@/lib/scrapers/supplier-page-runtime";
import { assertSafeSupplierUrl } from "@/lib/scrapers/supplier-security";
import { MARKETPLACE_SUBCATEGORIES } from "@/lib/types/marketplace";

const MODEL = "gpt-5.4";

interface PublicProductImages {
  title: string;
  url: string;
  imageUrls: string[];
  heroImageUrl: string | null;
}

interface BikeExtractionResponse {
  is_bike_product_page: boolean;
  name: string;
  brand: string | null;
  model: string | null;
  model_year: string | null;
  bike_type: string | null;
  colors: string[];
  description: string;
  spec_sections: Array<{
    title: string;
    specs: Array<{ label: string; value: string }>;
  }>;
  sizes: Array<{ name: string; sku: string | null }>;
  price: number | null;
  currency: string | null;
  hero_image_url: string | null;
  gallery_image_urls: string[];
}

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_bike_product_page",
    "name",
    "brand",
    "model",
    "model_year",
    "bike_type",
    "colors",
    "description",
    "spec_sections",
    "sizes",
    "price",
    "currency",
    "hero_image_url",
    "gallery_image_urls",
  ],
  properties: {
    is_bike_product_page: { type: "boolean" },
    name: { type: "string" },
    brand: { type: ["string", "null"] },
    model: { type: ["string", "null"] },
    model_year: { type: ["string", "null"] },
    bike_type: { type: ["string", "null"] },
    colors: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    spec_sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "specs"],
        properties: {
          title: { type: "string" },
          specs: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "value"],
              properties: {
                label: { type: "string" },
                value: { type: "string" },
              },
            },
          },
        },
      },
    },
    sizes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "sku"],
        properties: {
          name: { type: "string" },
          sku: { type: ["string", "null"] },
        },
      },
    },
    price: { type: ["number", "null"] },
    currency: { type: ["string", "null"] },
    hero_image_url: { type: ["string", "null"] },
    gallery_image_urls: { type: "array", items: { type: "string" } },
  },
} as const;

const EXTRACTION_INSTRUCTIONS = `You are YJ, building a perfect bike-shop product page from an official manufacturer product page.

You receive the page's readable text, structured data (JSON-LD), headings, and the list of image URLs found on the page. Extract:

- name: the full retail product name, e.g. "Focus Atlas 6.8 EQP". Include the model year in the name only if the brand displays it that way.
- brand: manufacturer name, e.g. "Focus".
- model / model_year: split out when identifiable.
- bike_type: what kind of bike this is, e.g. "Gravel", "Electric Mountain", "Road", "Kids".
- colors: colour options offered.
- description: 2-4 paragraphs of polished retail copy in Australian English. Base it on the manufacturer's copy — keep their tone, drop marketing fluff that references the brand's website, newsletters, or dealers. Plain text with paragraph breaks only (no markdown headings).
- spec_sections: the complete component specification grouped into sections such as General, Frame, Drivetrain/Groupset, Brakes, Wheels & Tyres, Cockpit, Saddle. Use the exact component names from the page. Include geometry only if clearly available as label/value rows.
- sizes: every frame size offered (e.g. S, M, L, XL or 49, 52, 54...). Include per-size SKU/EAN when shown.
- price and its ISO currency code exactly as displayed on the page (null when no price shown).
- hero_image_url and gallery_image_urls: choose ONLY from the provided image URL list. Prefer the highest-resolution studio shots of this bike (full-bike first, then detail shots). When the same photo appears at multiple sizes, pick the largest. Exclude logos, icons, unrelated products, banners, and lifestyle images where the bike is not the subject.

If the page is not a bicycle product page, set is_bike_product_page to false and leave other fields minimal.
Return JSON only.`;

function normaliseSizes(sizes: Array<{ name: string; sku: string | null }>): BikeUrlSize[] {
  const seen = new Set<string>();
  const result: BikeUrlSize[] = [];
  for (const size of sizes) {
    const name = size.name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ name, sku: size.sku?.trim() || null });
  }
  return result;
}

export function guessBicycleSubcategory(bikeType: string | null, name: string): string {
  const haystack = `${bikeType ?? ""} ${name}`.toLowerCase();
  const vocab = MARKETPLACE_SUBCATEGORIES.Bicycles;
  if (/(e-?bike|electric|e-?mtb|pedelec|bosch|shimano ep|fazua)/.test(haystack)) {
    return vocab.includes("Electric") ? "Electric" : "Other";
  }
  if (/(mountain|mtb|trail|enduro|downhill|hardtail)/.test(haystack)) return "Mountain";
  if (/(road|race|aero|endurance|gravel|cyclocross|all-?road)/.test(haystack)) return "Road";
  if (/(kids|youth|junior|balance)/.test(haystack)) return "Kids";
  if (/\bbmx\b/.test(haystack)) return "BMX";
  if (/(hybrid|commut|city|urban|trekking)/.test(haystack)) return "Hybrid";
  if (/cruiser/.test(haystack)) return "Cruiser";
  return "Other";
}

function resolveImageUrls(
  chosen: string[],
  available: string[],
  pageUrl: string,
): string[] {
  const availableSet = new Set(available);
  const resolved: string[] = [];
  for (const raw of chosen) {
    try {
      const absolute = new URL(raw, pageUrl).toString();
      if (availableSet.has(absolute)) resolved.push(absolute);
      else if (availableSet.has(raw)) resolved.push(raw);
    } catch {
      // Skip URLs the model invented or mangled.
    }
  }
  return resolved;
}

function compactPageText(snapshot: SupplierPageSnapshot): string {
  return snapshot.bodyText.replace(/\n{3,}/g, "\n\n").slice(0, 18_000);
}

export async function extractBikeFromUrl(
  rawUrl: string,
  logger?: SupplierScraperLogger,
): Promise<BikeUrlDraft> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for YJ to read bike pages.");
  }
  const url = await assertSafeSupplierUrl(rawUrl);
  const allowedHostname = url.hostname;

  logger?.step("browser", "Opening the official bike page");
  const browser = await launchSupplierBrowser(logger);
  let snapshot: SupplierPageSnapshot;
  let extractedImages: PublicProductImages;
  try {
    const page = await prepareSupplierPage(browser);
    await navigateSupplierPage(page, url.toString(), allowedHostname, logger);
    logger?.step("images", "Loading the photo gallery");
    await evaluateSupplierRuntime(page, "loadLazyImages");
    snapshot = await snapshotSupplierPage(page, logger);
    extractedImages = await evaluateSupplierRuntime<PublicProductImages>(
      page,
      "extractPublicProductImages",
    );
  } finally {
    await browser.close().catch(() => undefined);
  }

  // FE Sports size-suffix picker first, then upgrade CDN transforms
  // (Bynder/Pondigital/Storyblok/etc.) to full-resolution source URLs.
  const rawImageList = buildProductImageList(
    extractedImages.heroImageUrl,
    extractedImages.imageUrls,
  );
  const highQualityUrls = chooseHighestQualityImageUrls(
    rawImageList.imageUrls,
    snapshot.url,
  );
  const imageList = {
    imageUrls: highQualityUrls,
    heroImageUrl: rawImageList.heroImageUrl
      ? upgradeProductImageUrl(rawImageList.heroImageUrl, snapshot.url)
      : highQualityUrls[0] ?? null,
  };
  logger?.success(
    "images",
    `Found ${imageList.imageUrls.length} photos on the page (full-resolution source URLs)`,
  );

  logger?.step("ai", "Reading the page like a bike mechanic");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: MODEL,
    instructions: EXTRACTION_INSTRUCTIONS,
    text: {
      format: {
        type: "json_schema",
        name: "bike_product_page",
        strict: true,
        schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
      },
    },
    input: JSON.stringify({
      page_url: snapshot.url,
      page_title: snapshot.title,
      headings: snapshot.headings.slice(0, 40),
      structured_data: snapshot.structuredData.slice(0, 6),
      image_urls: imageList.imageUrls.slice(0, 80),
      hero_candidate: imageList.heroImageUrl,
      page_text: compactPageText(snapshot),
    }),
  });

  let outputText = "";
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) outputText += content.text;
    }
  }
  let parsed: BikeExtractionResponse;
  try {
    parsed = JSON.parse(outputText) as BikeExtractionResponse;
  } catch {
    const match = outputText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("YJ could not read this bike page.");
    parsed = JSON.parse(match[0]) as BikeExtractionResponse;
  }

  if (!parsed.is_bike_product_page || !parsed.name?.trim()) {
    throw new Error(
      "This does not look like a bike product page. Paste the URL of a single bike, e.g. https://www.focus-bikes.com/int/atlas-6-8-eqp",
    );
  }

  const galleryFromModel = resolveImageUrls(
    parsed.gallery_image_urls ?? [],
    imageList.imageUrls,
    snapshot.url,
  );
  const heroFromModel = resolveImageUrls(
    parsed.hero_image_url ? [parsed.hero_image_url] : [],
    imageList.imageUrls,
    snapshot.url,
  )[0];
  const finalImages = chooseHighestQualityImageUrls(
    galleryFromModel.length >= 3 ? galleryFromModel : imageList.imageUrls,
    snapshot.url,
  );
  const finalHero = upgradeProductImageUrl(
    heroFromModel ?? imageList.heroImageUrl ?? finalImages[0] ?? "",
    snapshot.url,
  ) || null;
  const orderedImages = finalHero
    ? [finalHero, ...finalImages.filter((candidate) => candidate !== finalHero)]
    : finalImages;

  const specSections = (parsed.spec_sections ?? [])
    .map((section) => ({
      title: section.title?.trim() || "Specifications",
      specs: (section.specs ?? [])
        .filter((spec) => spec.label?.trim() && spec.value?.trim())
        .map((spec) => ({ label: spec.label.trim(), value: spec.value.trim() })),
    }))
    .filter((section) => section.specs.length > 0);

  const sizes = normaliseSizes(parsed.sizes ?? []);
  logger?.success(
    "ai",
    `Extracted ${parsed.name} · ${sizes.length} size${sizes.length === 1 ? "" : "s"} · ${specSections.length} spec sections`,
  );

  return {
    sourceUrl: snapshot.url,
    name: parsed.name.trim(),
    brand: parsed.brand?.trim() || null,
    model: parsed.model?.trim() || null,
    modelYear: parsed.model_year?.trim() || null,
    bikeType: parsed.bike_type?.trim() || null,
    subcategory: guessBicycleSubcategory(parsed.bike_type, parsed.name),
    colors: (parsed.colors ?? []).map((color) => color.trim()).filter(Boolean),
    description: parsed.description?.trim() || "",
    specSections,
    sizes,
    price: typeof parsed.price === "number" && parsed.price > 0 ? parsed.price : null,
    currency: parsed.currency?.trim()?.toUpperCase() || null,
    imageUrls: orderedImages,
    heroImageUrl: finalHero,
  };
}
