import type { ListingAnalysisResult } from "@/lib/ai/schemas";

export interface UploadedListingImage {
  url: string;
  cardUrl?: string;
  mobileCardUrl?: string;
  thumbnailUrl?: string;
  galleryUrl?: string;
  detailUrl?: string;
}

function isUnknownValue(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    lower.includes("unknown") ||
    lower.includes("not specified") ||
    lower.includes("n/a") ||
    lower.includes("cannot determine") ||
    lower.includes("unclear") ||
    lower === "any" ||
    lower === "various"
  );
}

function cleanAiText(text: string | undefined | null): string | undefined {
  if (!text || typeof text !== "string") return undefined;
  if (isUnknownValue(text)) return undefined;

  let cleaned = text
    .replace(/^(maybe|possibly|likely|probably|perhaps|approximately|about|around)\s+/gi, "")
    .replace(/\s+(or so|ish|roughly)\s*$/gi, "")
    .replace(/\s+or\s+/gi, "/")
    .trim();

  cleaned = cleaned
    .split(" ")
    .map((word) => {
      if (word.includes("-") || word.includes("/")) {
        return word
          .split(/[-/]/)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join(word.includes("-") ? "-" : "/");
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");

  return cleaned || undefined;
}

function cleanMaterial(text: string | undefined | null): string | undefined {
  if (!text || typeof text !== "string") return undefined;
  if (isUnknownValue(text)) return undefined;

  const cleaned = text.trim();
  if (!cleaned) return undefined;

  const firstWord = cleaned.split(/[\s/]+/)[0];
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
}

function cleanWheelSize(text: string | undefined | null): string | undefined {
  if (!text || typeof text !== "string") return undefined;
  if (isUnknownValue(text)) return undefined;

  let cleaned = text
    .replace(/^(maybe|possibly|likely|probably|perhaps|approximately|about|around)\s+/gi, "")
    .trim();

  if (cleaned.includes("/")) {
    cleaned = cleaned.split("/")[0].trim();
  }

  return cleaned || undefined;
}

function cleanFrameSize(text: string | undefined | null): string | undefined {
  if (!text || typeof text !== "string") return undefined;
  const lower = text.toLowerCase().trim();
  if (
    lower.includes("all size") ||
    lower.includes("various") ||
    lower.includes("unknown") ||
    lower.includes("not specified") ||
    lower.includes("n/a") ||
    lower === "any"
  ) {
    return undefined;
  }
  return text.trim() || undefined;
}

export function buildListingFormDataFromAnalysis(
  analysis: ListingAnalysisResult,
  urls: string[],
  uploadedImages: UploadedListingImage[],
): Record<string, unknown> {
  const generatedTitle =
    analysis.clean_title ||
    analysis.title ||
    [analysis.brand, analysis.model, analysis.model_year].filter(Boolean).join(" ");

  const formData: Record<string, unknown> = {
    itemType: analysis.item_type,
    title: generatedTitle || undefined,
    brand: analysis.brand,
    model: analysis.model,
    modelYear: analysis.model_year,
    conditionRating: analysis.condition_rating,
    productDescription: analysis.description || "",
    sellerNotes: analysis.seller_notes || analysis.condition_details || "",
    conditionDetails: analysis.seller_notes || analysis.condition_details || "",
    wearNotes: analysis.wear_notes,
    usageEstimate: analysis.usage_estimate,
    price: analysis.price_estimate
      ? Math.round(
          analysis.price_estimate.target_aud ||
          (analysis.price_estimate.min_aud + analysis.price_estimate.max_aud) / 2,
        )
      : undefined,
  };

  if (analysis.item_type === "bike" && analysis.bike_details) {
    formData.bikeType = cleanAiText(analysis.bike_details.bike_type);
    formData.frameSize = cleanFrameSize(analysis.bike_details.frame_size);
    formData.frameMaterial = cleanMaterial(analysis.bike_details.frame_material);
    formData.groupset = cleanAiText(analysis.bike_details.groupset);
    formData.wheelSize = cleanWheelSize(analysis.bike_details.wheel_size);
    formData.suspensionType = cleanAiText(analysis.bike_details.suspension_type);
    formData.colorPrimary = cleanAiText(analysis.bike_details.color_primary);
    formData.colorSecondary = cleanAiText(analysis.bike_details.color_secondary);
    formData.bikeWeight = cleanAiText(analysis.bike_details.approximate_weight);
  }

  if (analysis.item_type === "part" && analysis.part_details) {
    formData.marketplace_subcategory = analysis.part_details.category;
    formData.partTypeDetail = cleanAiText(analysis.part_details.part_type);
    formData.compatibilityNotes = analysis.part_details.compatibility;
    formData.material = cleanMaterial(analysis.part_details.material);
    formData.weight = cleanAiText(analysis.part_details.weight);
  }

  if (analysis.item_type === "apparel" && analysis.apparel_details) {
    formData.marketplace_subcategory = analysis.apparel_details.category;
    formData.size = cleanAiText(analysis.apparel_details.size);
    formData.genderFit = cleanAiText(analysis.apparel_details.gender_fit);
    formData.apparelMaterial = cleanAiText(analysis.apparel_details.material);
  }

  if (analysis.structured_metadata) {
    formData.structuredMetadata = analysis.structured_metadata;
  }
  if (analysis.search_urls) {
    formData.searchUrls = analysis.search_urls;
  }
  if (analysis.field_confidence) {
    formData.fieldConfidence = analysis.field_confidence;
  }

  formData.images = urls.map((url, index) => ({
    id: `ai-${index}`,
    url,
    cardUrl: uploadedImages[index]?.cardUrl,
    mobileCardUrl: uploadedImages[index]?.mobileCardUrl,
    thumbnailUrl: uploadedImages[index]?.thumbnailUrl,
    galleryUrl: uploadedImages[index]?.galleryUrl,
    detailUrl: uploadedImages[index]?.detailUrl,
    order: index,
    isPrimary: index === 0,
  }));

  formData.primaryImageUrl = uploadedImages[0]?.cardUrl || urls[0];

  return formData;
}
