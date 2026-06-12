"use client";

import { buildListingFormDataFromAnalysis } from "@/lib/marketplace/listing-analysis-form-data";
import type { ListingAnalysisResult } from "@/lib/ai/schemas";
import type { BikeSpecsData } from "@/lib/types/bike-specs";
import { SPEC_SECTIONS, type BikeDraft, type SpecValues, type UploadedImage } from "./data";

// ============================================================
// Production wiring for the sell-redesign flows.
// Real image upload, AI photo analysis, AI spec discovery and
// listing creation — reusing the app's existing endpoints.
// ============================================================

function errFrom(res: Response, fallback: string): Promise<string> {
  return res
    .json()
    .then((j) => j?.error || fallback)
    .catch(() => fallback);
}

// ---- Image upload ------------------------------------------

export async function uploadPhotos(files: File[]): Promise<UploadedImage[]> {
  const listingId = `sell-${Date.now()}`;
  const results = await Promise.all(
    files.map(async (file) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("listingId", listingId);
      const res = await fetch("/api/marketplace/listings/upload-image", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(await errFrom(res, `Couldn't upload ${file.name}`));
      const json = await res.json();
      return {
        id: json.data.id as string,
        url: json.data.url as string,
        cardUrl: json.data.cardUrl as string | undefined,
        thumbnailUrl: json.data.thumbnailUrl as string | undefined,
      };
    }),
  );
  return results;
}

// ---- AI photo analysis -------------------------------------

export async function analysePhotos(imageUrls: string[]): Promise<ListingAnalysisResult> {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in to use AI analysis");

  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analyze-listing-ai`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ imageUrls, userHints: {} }),
  });
  if (!res.ok) throw new Error(await errFrom(res, "AI analysis failed"));
  const json = await res.json();
  return json.analysis as ListingAnalysisResult;
}

const s = (v: unknown): string => (typeof v === "string" ? v : "");

// Map an AI analysis result + uploaded images into a BikeDraft patch.
export function analysisToDraftPatch(
  analysis: ListingAnalysisResult,
  urls: string[],
  uploaded: UploadedImage[],
): Partial<BikeDraft> {
  const fd = buildListingFormDataFromAnalysis(analysis, urls, uploaded);
  return {
    images: urls,
    uploadedImages: uploaded,
    title: s(fd.title),
    bikeType: s(fd.bikeType),
    brand: s(fd.brand),
    model: s(fd.model),
    year: s(fd.modelYear),
    frameSize: s(fd.frameSize),
    frameMaterial: s(fd.frameMaterial),
    colourPrimary: s(fd.colorPrimary),
    colourSecondary: s(fd.colorSecondary),
    wheelSize: s(fd.wheelSize),
    groupset: s(fd.groupset),
    suspension: s(fd.suspensionType),
    weight: s(fd.bikeWeight),
    condition: s(fd.conditionRating),
    description: s(fd.productDescription),
    price: typeof fd.price === "number" ? (fd.price as number) : 0,
  };
}

// ---- AI spec discovery (pre-publish) -----------------------

export async function discoverSpecsPreview(draft: Partial<BikeDraft>): Promise<SpecValues> {
  const res = await fetch("/api/marketplace/bike-specs/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brand: draft.brand,
      model: draft.model,
      modelYear: draft.year,
      bikeType: draft.bikeType,
      frameSize: draft.frameSize,
      frameMaterial: draft.frameMaterial,
      groupset: draft.groupset,
      wheelSize: draft.wheelSize,
      title: draft.title,
    }),
  });
  if (!res.ok) throw new Error(await errFrom(res, "Couldn't fetch specifications"));
  const json = await res.json();
  return bikeSpecsToValues(json.bike_specs as BikeSpecsData);
}

// Flatten a discovered { sections:[{title,specs:[{label,value}]}] } sheet back
// onto the flat field keys the editor uses (matching SPEC_SECTIONS labels).
function bikeSpecsToValues(data: BikeSpecsData): SpecValues {
  const byLabel = new Map<string, string>();
  for (const section of data.sections ?? []) {
    for (const row of section.specs ?? []) {
      byLabel.set(row.label.trim().toLowerCase(), row.value);
    }
  }
  const values: SpecValues = {};
  for (const section of SPEC_SECTIONS) {
    for (const field of section.fields) {
      const hit = byLabel.get(field.label.trim().toLowerCase());
      if (hit) values[field.key] = hit;
    }
  }
  return values;
}

// ---- Build the structured bike_specs blob for publish ------

export function buildBikeSpecsBlob(bikeType: string, specs: SpecValues): BikeSpecsData {
  const isEbike = bikeType === "Electric";
  const sections = SPEC_SECTIONS.filter((sec) => (sec.ebikeOnly ? isEbike : true))
    .map((sec) => ({
      title: sec.title,
      specs: sec.fields
        .filter((f) => (specs[f.key] ?? "").trim().length > 0)
        .map((f) => ({ label: f.label, value: specs[f.key].trim() })),
    }))
    .filter((sec) => sec.specs.length > 0);
  return { sections };
}

// ---- Submit / publish listing ------------------------------

export interface SubmitResult {
  listing: { id: string; [k: string]: unknown };
  awardedVoucher?: unknown;
}

function buildImagesPayload(draft: BikeDraft) {
  const src: UploadedImage[] =
    draft.uploadedImages && draft.uploadedImages.length > 0
      ? draft.uploadedImages
      : draft.images.map((url, i) => ({ id: `img-${i}`, url }));
  return src.map((img, i) => ({
    id: img.id ?? `img-${i}`,
    url: img.url,
    cardUrl: img.cardUrl ?? img.url,
    thumbnailUrl: img.thumbnailUrl,
    order: i,
    isPrimary: i === 0,
  }));
}

export function mapDraftToListingPayload(draft: BikeDraft, status: "active" | "draft") {
  const bikeSpecs = buildBikeSpecsBlob(draft.bikeType, draft.specs);
  const hasSpecs = bikeSpecs.sections.length > 0;
  return {
    itemType: "bike",
    listingStatus: status,
    title: draft.title || undefined,
    brand: draft.brand || undefined,
    model: draft.model || undefined,
    modelYear: draft.year || undefined,
    bikeType: draft.bikeType || undefined,
    frameSize: draft.frameSize || undefined,
    frameMaterial: draft.frameMaterial || undefined,
    wheelSize: draft.wheelSize || undefined,
    groupset: draft.groupset || undefined,
    suspensionType: draft.suspension || undefined,
    bikeWeight: draft.weight || undefined,
    colorPrimary: draft.colourPrimary || undefined,
    colorSecondary: draft.colourSecondary || undefined,
    conditionRating: draft.condition || undefined,
    productDescription: draft.description || undefined,
    price: draft.price || undefined,
    isNegotiable: true,
    shippingAvailable: draft.shippingAvailable,
    shippingCost: draft.shippingAvailable ? draft.shippingCost : undefined,
    pickupLocation: draft.pickupAvailable ? draft.pickupLocation : undefined,
    marketplace_category: "Bicycles",
    images: buildImagesPayload(draft),
    bikeSpecs: hasSpecs ? bikeSpecs : undefined,
    isBicycle: hasSpecs ? true : undefined,
  };
}

export async function submitListing(
  draft: BikeDraft,
  status: "active" | "draft" = "active",
): Promise<SubmitResult> {
  const res = await fetch("/api/marketplace/listings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mapDraftToListingPayload(draft, status)),
  });
  if (!res.ok) throw new Error(await errFrom(res, "Couldn't publish your listing"));
  return res.json();
}
