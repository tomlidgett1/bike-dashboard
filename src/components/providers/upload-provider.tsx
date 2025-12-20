"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { compressImage, compressedToFile, shouldCompress } from "@/lib/utils/image-compression";
import type { ListingAnalysisResult } from "@/lib/ai/schemas";

// ============================================================
// Upload Provider - Background Upload Processing
// ============================================================
// Manages the entire upload flow in the background, allowing
// users to continue browsing while their listing is created.
// ============================================================

const UPLOAD_CONCURRENCY = 3;

// Loading messages that rotate during upload
const UPLOAD_MESSAGES = [
  "Feel free to continue browsing...",
  "Optimising photos...",
  "Uploading to cloud...",
  "Yellow Jersey is analysing your product...",
  "Detecting brand and model...",
  "Identifying condition details...",
  "Checking product specifications...",
  "Generating product description...",
  "Estimating fair market value...",
  "Processing final details...",
  "Almost ready...",
  "Did you know we offer 1 hour delivery?",
];

type UploadStage = "idle" | "enhancing" | "compressing" | "uploading" | "analysing" | "creating" | "success" | "error";

interface UploadPhoto {
  id: string;
  file: File;
  preview: string;
}

interface UploadState {
  isUploading: boolean;
  stage: UploadStage;
  messageIndex: number;
  progress: { current: number; total: number };
  error: string | null;
  listingId: string | null;
  listingSlug: string | null;
}

interface UploadContextValue extends UploadState {
  startUpload: (photos: UploadPhoto[], removeBackground: boolean, onComplete: (formData: any, imageUrls: string[]) => void) => void;
  cancelUpload: () => void;
  currentMessage: string;
}

const UploadContext = React.createContext<UploadContextValue | null>(null);

export function useUpload() {
  const context = React.useContext(UploadContext);
  if (!context) {
    throw new Error("useUpload must be used within an UploadProvider");
  }
  return context;
}

interface UploadProviderProps {
  children: React.ReactNode;
}

export function UploadProvider({ children }: UploadProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  
  const [state, setState] = React.useState<UploadState>({
    isUploading: false,
    stage: "idle",
    messageIndex: 0,
    progress: { current: 0, total: 0 },
    error: null,
    listingId: null,
    listingSlug: null,
  });

  const abortControllerRef = React.useRef<AbortController | null>(null);
  const onCompleteRef = React.useRef<((formData: any, imageUrls: string[]) => void) | null>(null);

  // Rotate loading messages every 5 seconds
  React.useEffect(() => {
    if (!state.isUploading || state.stage === "idle" || state.stage === "success" || state.stage === "error") {
      return;
    }

    const interval = setInterval(() => {
      setState(prev => ({
        ...prev,
        messageIndex: (prev.messageIndex + 1) % UPLOAD_MESSAGES.length,
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, [state.isUploading, state.stage]);

  // Handle successful completion - reset state after a brief delay
  // Note: The actual navigation to /marketplace/sell is handled by the onComplete callback
  // The listing doesn't exist yet - it's created when the user submits the sell wizard
  React.useEffect(() => {
    if (state.stage === "success") {
      // Reset state after brief delay to allow floating bar to show success
      const timer = setTimeout(() => {
        setState({
          isUploading: false,
          stage: "idle",
          messageIndex: 0,
          progress: { current: 0, total: 0 },
          error: null,
          listingId: null,
          listingSlug: null,
        });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [state.stage]);

  const cancelUpload = React.useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setState({
      isUploading: false,
      stage: "idle",
      messageIndex: 0,
      progress: { current: 0, total: 0 },
      error: null,
      listingId: null,
      listingSlug: null,
    });
  }, []);

  const startUpload = React.useCallback(async (
    photos: UploadPhoto[],
    removeBackground: boolean,
    onComplete: (formData: any, imageUrls: string[]) => void
  ) => {
    if (photos.length === 0) return;

    // Store the callback
    onCompleteRef.current = onComplete;

    // Create abort controller
    abortControllerRef.current = new AbortController();

    // Start upload
    setState({
      isUploading: true,
      stage: "enhancing",
      messageIndex: 0,
      progress: { current: 0, total: photos.length },
      error: null,
      listingId: null,
      listingSlug: null,
    });

    try {
      // Get Supabase session
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("You must be logged in to upload");
      }

      // Phase 0: Enhance cover image if requested
      let enhancedCover: {
        url: string;
        cardUrl: string;
        thumbnailUrl: string;
        galleryUrl?: string;
        detailUrl?: string;
      } | null = null;

      if (removeBackground) {
        setState(prev => ({ ...prev, stage: "enhancing" }));
        console.log("✨ [UPLOAD CONTEXT] Enhancing cover image...");

        try {
          enhancedCover = await enhanceCoverImage(photos[0], session.access_token);
          console.log("✅ [UPLOAD CONTEXT] Cover enhanced:", enhancedCover?.cardUrl);
        } catch (err) {
          console.error("⚠️ [UPLOAD CONTEXT] Enhancement failed, continuing without:", err);
          // Continue without enhancement if it fails
        }
      }

      // Phase 1: Compress images
      setState(prev => ({ ...prev, stage: "compressing", progress: { current: 0, total: photos.length } }));
      console.log("🗜️ [UPLOAD CONTEXT] Compressing", photos.length, "photos...");

      const compressedFiles: File[] = [];
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        let fileToUpload: File;

        if (shouldCompress(photo.file)) {
          const compressed = await compressImage(photo.file, {
            maxDimension: 1920,
            quality: 0.8,
          });
          fileToUpload = compressedToFile(compressed, photo.file.name);
        } else {
          fileToUpload = photo.file;
        }

        compressedFiles.push(fileToUpload);
        setState(prev => ({ ...prev, progress: { current: i + 1, total: photos.length } }));
      }

      // Phase 2: Upload to Cloudinary
      setState(prev => ({ ...prev, stage: "uploading" }));
      
      const startIndex = enhancedCover ? 1 : 0;
      const filesToUpload = enhancedCover ? compressedFiles.slice(1) : compressedFiles;
      
      setState(prev => ({ ...prev, progress: { current: 0, total: filesToUpload.length } }));
      console.log("📤 [UPLOAD CONTEXT] Uploading to Cloudinary...");

      const uploadedImages: Array<{ url: string; cardUrl: string; thumbnailUrl: string; galleryUrl?: string; detailUrl?: string }> = [];

      // If we have an enhanced cover, add it first
      if (enhancedCover) {
        uploadedImages.push({
          url: enhancedCover.url,
          cardUrl: enhancedCover.cardUrl,
          thumbnailUrl: enhancedCover.thumbnailUrl,
          galleryUrl: enhancedCover.galleryUrl,
          detailUrl: enhancedCover.detailUrl,
        });
      }

      const listingId = `smart-${Date.now()}`;

      for (let i = 0; i < filesToUpload.length; i += UPLOAD_CONCURRENCY) {
        const batch = filesToUpload.slice(i, i + UPLOAD_CONCURRENCY);

        const batchResults = await Promise.all(
          batch.map(async (file, batchIndex) => {
            const globalIndex = startIndex + i + batchIndex;

            const formData = new FormData();
            formData.append("file", file);
            formData.append("listingId", listingId);
            formData.append("index", globalIndex.toString());

            const response = await fetch(
              `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/upload-to-cloudinary`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: formData,
                signal: abortControllerRef.current?.signal,
              }
            );

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || "Upload failed");
            }

            const result = await response.json();
            return {
              url: result.data.url,
              cardUrl: result.data.cardUrl,
              thumbnailUrl: result.data.thumbnailUrl,
              galleryUrl: result.data.galleryUrl,
              detailUrl: result.data.detailUrl,
            };
          })
        );

        uploadedImages.push(...batchResults);
        setState(prev => ({
          ...prev,
          progress: { current: Math.min(i + UPLOAD_CONCURRENCY, filesToUpload.length), total: filesToUpload.length },
        }));
      }

      const urls = uploadedImages.map(img => img.url);
      console.log("✅ [UPLOAD CONTEXT] All photos uploaded");

      // Phase 3: Run AI analysis
      setState(prev => ({ ...prev, stage: "analysing" }));
      console.log("🤖 [UPLOAD CONTEXT] Starting AI analysis...");

      const analysisResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analyze-listing-ai`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            imageUrls: urls,
            userHints: {},
          }),
          signal: abortControllerRef.current?.signal,
        }
      );

      if (!analysisResponse.ok) {
        const errorData = await analysisResponse.json();
        throw new Error(errorData.error || "AI analysis failed");
      }

      const analysisResult = await analysisResponse.json();
      console.log("✅ [UPLOAD CONTEXT] Analysis received");

      if (!analysisResult.analysis) {
        throw new Error("AI analysis returned no data");
      }

      const analysis = analysisResult.analysis as ListingAnalysisResult;

      // Map analysis to form data
      const formData = buildFormData(analysis, urls, uploadedImages);

      // Phase 4: Create listing (call onComplete which will create the listing)
      setState(prev => ({ ...prev, stage: "creating" }));
      console.log("📝 [UPLOAD CONTEXT] Creating listing...");

      // Call the original onComplete callback which creates the listing
      onCompleteRef.current?.(formData, urls);

      // Mark as success
      setState(prev => ({
        ...prev,
        stage: "success",
        listingId: formData.listingId || "success",
      }));

    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("🚫 [UPLOAD CONTEXT] Upload cancelled");
        return;
      }

      console.error("❌ [UPLOAD CONTEXT] Error:", err);
      setState(prev => ({
        ...prev,
        stage: "error",
        error: err.message || "Upload failed",
      }));
    }
  }, []);

  const currentMessage = UPLOAD_MESSAGES[state.messageIndex];

  const value: UploadContextValue = {
    ...state,
    startUpload,
    cancelUpload,
    currentMessage,
  };

  return (
    <UploadContext.Provider value={value}>
      {children}
    </UploadContext.Provider>
  );
}

// ============================================================
// Helper Functions
// ============================================================

async function enhanceCoverImage(
  photo: UploadPhoto,
  accessToken: string
): Promise<{
  url: string;
  cardUrl: string;
  thumbnailUrl: string;
  galleryUrl?: string;
  detailUrl?: string;
}> {
  // Compress first
  let fileToUpload: File;
  if (shouldCompress(photo.file)) {
    const compressed = await compressImage(photo.file, {
      maxDimension: 1920,
      quality: 0.8,
    });
    fileToUpload = compressedToFile(compressed, photo.file.name);
  } else {
    fileToUpload = photo.file;
  }

  // Upload to Cloudinary to get URL
  const formData = new FormData();
  formData.append("file", fileToUpload);
  formData.append("listingId", `enhance-${Date.now()}`);
  formData.append("index", "0");

  const uploadResponse = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/upload-to-cloudinary`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    }
  );

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload image for enhancement");
  }

  const uploadResult = await uploadResponse.json();
  const imageUrl = uploadResult.data.url;

  // Enhance with AI
  const enhanceResponse = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/enhance-product-image`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        imageUrl,
        listingId: `quick-${Date.now()}`,
      }),
    }
  );

  if (!enhanceResponse.ok) {
    const errorData = await enhanceResponse.json();
    throw new Error(errorData.error || "Enhancement failed");
  }

  const enhanceResult = await enhanceResponse.json();
  return enhanceResult.data;
}

function buildFormData(
  analysis: ListingAnalysisResult,
  urls: string[],
  uploadedImages: Array<{ url: string; cardUrl: string; thumbnailUrl: string; galleryUrl?: string; detailUrl?: string }>
): any {
  const generatedTitle = [analysis.brand, analysis.model].filter(Boolean).join(" ");

  const cleanAiText = (text: string | undefined | null): string | undefined => {
    if (!text) return undefined;
    let cleaned = text
      .replace(/^(maybe|possibly|likely|probably|perhaps|approximately|about|around)\s+/gi, "")
      .replace(/\s+(or so|ish|roughly)\s*$/gi, "")
      .replace(/\s+or\s+/gi, "/")
      .trim();
    cleaned = cleaned
      .split(" ")
      .map(word => {
        if (word.includes("-") || word.includes("/")) {
          return word.split(/[-/]/).map(part =>
            part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
          ).join(word.includes("-") ? "-" : "/");
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(" ");
    return cleaned || undefined;
  };

  const formData: any = {
    itemType: analysis.item_type,
    title: generatedTitle || undefined,
    brand: analysis.brand,
    model: analysis.model,
    modelYear: analysis.model_year,
    conditionRating: analysis.condition_rating,
    description: analysis.description,
    sellerNotes: analysis.seller_notes,
    conditionDetails: analysis.description,
    wearNotes: analysis.wear_notes,
    usageEstimate: analysis.usage_estimate,
    price: analysis.price_estimate
      ? Math.round((analysis.price_estimate.min_aud + analysis.price_estimate.max_aud) / 2)
      : undefined,
  };

  // Bike-specific fields
  if (analysis.item_type === "bike" && analysis.bike_details) {
    formData.bikeType = cleanAiText(analysis.bike_details.bike_type);
    formData.frameSize = cleanAiText(analysis.bike_details.frame_size);
    formData.frameMaterial = cleanAiText(analysis.bike_details.frame_material);
    formData.groupset = cleanAiText(analysis.bike_details.groupset);
    formData.wheelSize = cleanAiText(analysis.bike_details.wheel_size);
    formData.suspensionType = cleanAiText(analysis.bike_details.suspension_type);
    formData.colorPrimary = cleanAiText(analysis.bike_details.color_primary);
    formData.colorSecondary = cleanAiText(analysis.bike_details.color_secondary);
    formData.bikeWeight = cleanAiText(analysis.bike_details.approximate_weight);
  }

  // Part-specific fields
  if (analysis.item_type === "part" && analysis.part_details) {
    formData.marketplace_subcategory = analysis.part_details.category;
    formData.partTypeDetail = cleanAiText(analysis.part_details.part_type);
    formData.compatibilityNotes = analysis.part_details.compatibility;
    formData.material = cleanAiText(analysis.part_details.material);
    formData.weight = cleanAiText(analysis.part_details.weight);
  }

  // Apparel-specific fields
  if (analysis.item_type === "apparel" && analysis.apparel_details) {
    formData.marketplace_subcategory = analysis.apparel_details.category;
    formData.size = cleanAiText(analysis.apparel_details.size);
    formData.genderFit = cleanAiText(analysis.apparel_details.gender_fit);
    formData.apparelMaterial = cleanAiText(analysis.apparel_details.material);
  }

  // Metadata
  if (analysis.structured_metadata) {
    formData.structuredMetadata = analysis.structured_metadata;
  }
  if (analysis.search_urls) {
    formData.searchUrls = analysis.search_urls;
  }
  if (analysis.field_confidence) {
    formData.fieldConfidence = analysis.field_confidence;
  }

  // Images
  formData.images = urls.map((url, index) => ({
    id: `ai-${index}`,
    url,
    cardUrl: uploadedImages[index]?.cardUrl,
    thumbnailUrl: uploadedImages[index]?.thumbnailUrl,
    order: index,
    isPrimary: index === 0,
  }));

  formData.primaryImageUrl = uploadedImages[0]?.cardUrl || urls[0];

  return formData;
}

