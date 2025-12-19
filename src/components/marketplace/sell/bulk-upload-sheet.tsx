"use client";

import * as React from "react";
import {
  Upload,
  X,
  Camera,
  Image as ImageIcon,
  Plus,
  Loader2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Trash2,
  Edit,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  compressImage,
  compressedToFile,
  shouldCompress,
} from "@/lib/utils/image-compression";
import { CONDITION_RATINGS, type ConditionRating } from "@/lib/types/listing";

// ============================================================
// Bulk Upload Sheet
// Complete bulk upload flow within a single bottom sheet
// Stages: photos → uploading → grouping → reviewing → final → publishing → success
// ============================================================

const UPLOAD_CONCURRENCY = 3;

type BulkUploadStage =
  | "photos"
  | "uploading"
  | "grouping"
  | "reviewing"
  | "final"
  | "publishing"
  | "success";

interface UploadedPhoto {
  id: string;
  url: string;
  cardUrl: string;
  thumbnailUrl: string;
  mobileCardUrl: string;
}

interface PhotoGroup {
  id: string;
  photoIndexes: number[];
  suggestedName: string;
  confidence: number;
}

interface ProductData {
  groupId: string;
  imageUrls: string[];
  thumbnailUrls: string[];
  suggestedName: string;
  aiData: any;
  formData: ProductFormData;
  isValid: boolean;
}

interface ProductFormData {
  title: string;
  description: string;
  brand: string;
  model: string;
  modelYear: string;
  itemType: string;
  bikeType: string;
  frameSize: string;
  frameMaterial: string;
  groupset: string;
  wheelSize: string;
  colorPrimary: string;
  partTypeDetail: string;
  compatibilityNotes: string;
  size: string;
  genderFit: string;
  conditionRating: ConditionRating;
  conditionDetails: string;
  price: number;
  originalRrp: number;
}

interface BulkUploadSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (listingIds: string[]) => void;
}

export function BulkUploadSheet({
  isOpen,
  onClose,
  onComplete,
}: BulkUploadSheetProps) {
  const router = useRouter();

  // Stage management
  const [stage, setStage] = React.useState<BulkUploadStage>("photos");

  // Photo selection state
  const [photos, setPhotos] = React.useState<{ file: File; preview: string }[]>(
    []
  );

  // Upload state
  const [uploadedPhotos, setUploadedPhotos] = React.useState<UploadedPhoto[]>(
    []
  );
  const [uploadProgress, setUploadProgress] = React.useState({
    current: 0,
    total: 0,
  });
  const [isCompressing, setIsCompressing] = React.useState(false);

  // Grouping state
  const [groups, setGroups] = React.useState<PhotoGroup[]>([]);

  // Products state
  const [products, setProducts] = React.useState<ProductData[]>([]);
  const [currentProductIndex, setCurrentProductIndex] = React.useState(0);
  const [showDetails, setShowDetails] = React.useState(false);

  // Success state
  const [successListingIds, setSuccessListingIds] = React.useState<string[]>(
    []
  );

  // Error state
  const [error, setError] = React.useState<string | null>(null);

  // Refs
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const carouselRef = React.useRef<HTMLDivElement>(null);
  const blobUrlsRef = React.useRef<Set<string>>(new Set());

  // Reset state when sheet opens/closes
  React.useEffect(() => {
    if (isOpen) {
      setStage("photos");
      setPhotos([]);
      setUploadedPhotos([]);
      setGroups([]);
      setProducts([]);
      setCurrentProductIndex(0);
      setSuccessListingIds([]);
      setError(null);
      setUploadProgress({ current: 0, total: 0 });
      setShowDetails(false);
    }
  }, [isOpen]);

  // Cleanup blob URLs on unmount
  React.useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current.clear();
    };
  }, []);

  // Prevent body scroll when sheet is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  // ============================================================
  // Photo Selection Handlers
  // ============================================================

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addPhotos(files);
    // Reset input to allow selecting same files again
    e.target.value = "";
  };

  const addPhotos = (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    const newPhotos = imageFiles.map((file) => {
      const preview = URL.createObjectURL(file);
      blobUrlsRef.current.add(preview);
      return { file, preview };
    });
    setPhotos((prev) => [...prev, ...newPhotos]);
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const url = prev[index].preview;
      URL.revokeObjectURL(url);
      blobUrlsRef.current.delete(url);
      return prev.filter((_, i) => i !== index);
    });
  };

  // ============================================================
  // Upload Handler
  // ============================================================

  const handleUpload = async () => {
    if (photos.length === 0) return;

    setError(null);
    setStage("uploading");
    setIsCompressing(true);
    setUploadProgress({ current: 0, total: photos.length });

    try {
      // Get Supabase session
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("You must be logged in to upload photos");
      }

      // Phase 1: Compress images
      console.log("🗜️ [BULK SHEET] Compressing", photos.length, "photos...");

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
          console.log(
            `[BULK SHEET] Compressed: ${(photo.file.size / 1024).toFixed(0)}KB → ${(fileToUpload.size / 1024).toFixed(0)}KB`
          );
        } else {
          fileToUpload = photo.file;
        }

        compressedFiles.push(fileToUpload);
        setUploadProgress({ current: i + 1, total: photos.length });
      }

      // Phase 2: Upload to Cloudinary
      setIsCompressing(false);
      setUploadProgress({ current: 0, total: compressedFiles.length });

      console.log("📤 [BULK SHEET] Uploading to Cloudinary...");

      const uploaded: UploadedPhoto[] = [];
      const listingId = `bulk-${Date.now()}`;

      for (let i = 0; i < compressedFiles.length; i += UPLOAD_CONCURRENCY) {
        const batch = compressedFiles.slice(i, i + UPLOAD_CONCURRENCY);

        const batchResults = await Promise.all(
          batch.map(async (file, batchIndex) => {
            const globalIndex = i + batchIndex;

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
              }
            );

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || "Upload failed");
            }

            const result = await response.json();
            console.log(
              `✅ [BULK SHEET] Image ${globalIndex + 1} uploaded to Cloudinary`
            );

            return {
              id: result.data.id,
              url: result.data.url,
              cardUrl: result.data.cardUrl,
              thumbnailUrl: result.data.thumbnailUrl,
              mobileCardUrl: result.data.mobileCardUrl,
            };
          })
        );

        uploaded.push(...batchResults);
        setUploadProgress({
          current: uploaded.length,
          total: compressedFiles.length,
        });
      }

      console.log("✅ [BULK SHEET] All photos uploaded successfully");
      setUploadedPhotos(uploaded);

      // Move to grouping stage
      await handleGrouping(uploaded, session.access_token);
    } catch (err) {
      console.error("❌ [BULK SHEET] Upload error:", err);
      setError(err instanceof Error ? err.message : "Upload failed");
      setStage("photos");
      setIsCompressing(false);
    }
  };

  // ============================================================
  // Grouping Handler
  // ============================================================

  const handleGrouping = async (
    photos: UploadedPhoto[],
    accessToken: string
  ) => {
    setStage("grouping");

    try {
      // Call AI grouping edge function
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/group-photos-ai`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            imageUrls: photos.map((p) => p.url),
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to group photos");
      }

      const data = await response.json();
      console.log("✅ [BULK SHEET] AI grouping complete:", data);
      setGroups(data.groups);

      // Analyse each group
      await handleAnalysis(photos, data.groups, accessToken);
    } catch (err) {
      console.error("❌ [BULK SHEET] Grouping error:", err);

      // Fallback: Create one group per photo
      const fallbackGroups: PhotoGroup[] = photos.map((_, index) => ({
        id: `group-${index + 1}`,
        photoIndexes: [index],
        suggestedName: `Product ${index + 1}`,
        confidence: 50,
      }));
      setGroups(fallbackGroups);

      // Continue with fallback groups
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        await handleAnalysis(photos, fallbackGroups, session.access_token);
      }
    }
  };

  // ============================================================
  // Analysis Handler
  // ============================================================

  const handleAnalysis = async (
    photos: UploadedPhoto[],
    photoGroups: PhotoGroup[],
    accessToken: string
  ) => {
    try {
      // Analyse each product group
      const analysisPromises = photoGroups.map(async (group) => {
        const imageUrls = group.photoIndexes.map((idx) => photos[idx].url);

        try {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analyze-listing-ai`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                imageUrls,
                userHints: {},
              }),
            }
          );

          if (!response.ok) {
            throw new Error("Analysis failed");
          }

          const result = await response.json();
          return { groupId: group.id, success: true, analysis: result.analysis };
        } catch (error) {
          console.error(`Failed to analyse group ${group.id}:`, error);
          return { groupId: group.id, success: false, analysis: null };
        }
      });

      const results = await Promise.all(analysisPromises);
      console.log("✅ [BULK SHEET] AI analysis complete:", results);

      // Map results to products
      const analysedProducts: ProductData[] = photoGroups.map((group) => {
        const result = results.find((r) => r.groupId === group.id);
        const analysis = result?.success ? result.analysis : null;

        // Generate title from AI data
        const titleParts = [
          analysis?.brand,
          analysis?.model,
          analysis?.model_year,
        ].filter(Boolean);
        const generatedTitle =
          titleParts.length > 0 ? titleParts.join(" ") : group.suggestedName;

        // Get details
        const bikeDetails = analysis?.bike_details || {};
        const partDetails = analysis?.part_details || {};
        const apparelDetails = analysis?.apparel_details || {};
        const priceEstimate = analysis?.price_estimate || {};

        return {
          groupId: group.id,
          imageUrls: group.photoIndexes.map((idx) => photos[idx].url),
          thumbnailUrls: group.photoIndexes.map(
            (idx) => photos[idx].thumbnailUrl || photos[idx].cardUrl
          ),
          suggestedName: generatedTitle,
          aiData: analysis,
          formData: {
            title: generatedTitle,
            description: analysis?.description || "",
            brand: analysis?.brand || "",
            model: analysis?.model || "",
            modelYear: analysis?.model_year || "",
            itemType: analysis?.item_type || "bike",
            bikeType: bikeDetails.bike_type || "",
            frameSize: bikeDetails.frame_size || "",
            frameMaterial: bikeDetails.frame_material || "",
            groupset: bikeDetails.groupset || "",
            wheelSize: bikeDetails.wheel_size || "",
            colorPrimary: bikeDetails.color_primary || "",
            partTypeDetail: partDetails.part_category || "",
            compatibilityNotes: partDetails.compatibility || "",
            size: apparelDetails.size || "",
            genderFit: apparelDetails.gender_fit || "",
            conditionRating: (analysis?.condition_rating ||
              "Good") as ConditionRating,
            conditionDetails: analysis?.description || "",
            price: priceEstimate.min_aud
              ? Math.round(
                  (priceEstimate.min_aud + priceEstimate.max_aud) / 2
                )
              : 0,
            originalRrp: priceEstimate.max_aud || 0,
          },
          isValid: true,
        };
      });

      setProducts(analysedProducts);
      setCurrentProductIndex(0);
      setStage("reviewing");
    } catch (err) {
      console.error("❌ [BULK SHEET] Analysis error:", err);
      setError(err instanceof Error ? err.message : "Failed to analyse products");
      setStage("photos");
    }
  };

  // ============================================================
  // Product Review Handlers
  // ============================================================

  const updateProductField = (field: keyof ProductFormData, value: any) => {
    setProducts((prev) =>
      prev.map((p, idx) =>
        idx === currentProductIndex
          ? {
              ...p,
              formData: { ...p.formData, [field]: value },
              isValid: validateProduct({ ...p.formData, [field]: value }),
            }
          : p
      )
    );
  };

  const validateProduct = (data: ProductFormData): boolean => {
    return !!(
      data.title &&
      data.title.trim().length > 0 &&
      data.brand &&
      data.model &&
      data.price > 0
    );
  };

  const goToNextProduct = () => {
    if (currentProductIndex < products.length - 1) {
      setCurrentProductIndex((prev) => prev + 1);
      setShowDetails(false);
      // Scroll carousel
      if (carouselRef.current) {
        const nextIndex = currentProductIndex + 1;
        carouselRef.current.scrollTo({
          left: nextIndex * carouselRef.current.offsetWidth,
          behavior: "smooth",
        });
      }
    } else {
      // Last product - go to final review
      setStage("final");
    }
  };

  const goToPrevProduct = () => {
    if (currentProductIndex > 0) {
      setCurrentProductIndex((prev) => prev - 1);
      setShowDetails(false);
      // Scroll carousel
      if (carouselRef.current) {
        const prevIndex = currentProductIndex - 1;
        carouselRef.current.scrollTo({
          left: prevIndex * carouselRef.current.offsetWidth,
          behavior: "smooth",
        });
      }
    }
  };

  const deleteProduct = (groupId: string) => {
    setProducts((prev) => prev.filter((p) => p.groupId !== groupId));
    if (currentProductIndex >= products.length - 1) {
      setCurrentProductIndex(Math.max(0, currentProductIndex - 1));
    }
  };

  const editProduct = (index: number) => {
    setCurrentProductIndex(index);
    setStage("reviewing");
  };

  // ============================================================
  // Publish Handler
  // ============================================================

  const handlePublish = async () => {
    setStage("publishing");

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("You must be logged in");
      }

      // Build listing data for each product
      const listings = products.map((product) => {
        const imageData = product.imageUrls.map((url, index) => ({
          id: `${product.groupId}-${index}`,
          url,
          order: index,
          isPrimary: index === 0,
        }));

        // Map item type to marketplace category
        const categoryMap: { [key: string]: string } = {
          bike: "Bicycles",
          part: "Parts",
          apparel: "Apparel",
        };

        return {
          title: product.formData.title || product.suggestedName,
          description: product.formData.description,
          brand: product.formData.brand,
          model: product.formData.model,
          modelYear: product.formData.modelYear,
          bikeType: product.formData.bikeType,
          frameSize: product.formData.frameSize,
          frameMaterial: product.formData.frameMaterial,
          groupset: product.formData.groupset,
          wheelSize: product.formData.wheelSize,
          colorPrimary: product.formData.colorPrimary,
          partTypeDetail: product.formData.partTypeDetail,
          compatibilityNotes: product.formData.compatibilityNotes,
          size: product.formData.size,
          genderFit: product.formData.genderFit,
          conditionRating: product.formData.conditionRating,
          conditionDetails: product.formData.conditionDetails,
          price: product.formData.price,
          originalRrp: product.formData.originalRrp,
          images: imageData,
          primaryImageUrl: product.imageUrls[0],
          marketplace_category:
            categoryMap[product.formData.itemType] || "Bicycles",
          isNegotiable: true,
          shippingAvailable: true,
          pickupLocation: null,
        };
      });

      // Call bulk create API
      const response = await fetch("/api/marketplace/listings/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ listings }),
      });

      if (!response.ok) {
        throw new Error("Failed to create listings");
      }

      const result = await response.json();
      console.log("✅ [BULK SHEET] Listings created:", result);

      setSuccessListingIds(result.created || []);
      setStage("success");

      // Call completion callback
      onComplete?.(result.created || []);

      // Auto-close and navigate after delay
      setTimeout(() => {
        onClose();
        router.push("/marketplace");
      }, 3000);
    } catch (err) {
      console.error("❌ [BULK SHEET] Publishing error:", err);
      setError(err instanceof Error ? err.message : "Failed to publish listings");
      setStage("final");
    }
  };

  // ============================================================
  // Render Helpers
  // ============================================================

  const canClose =
    stage === "photos" ||
    stage === "success" ||
    (stage === "final" && !error);

  const currentProduct = products[currentProductIndex];
  const totalValue = products.reduce((sum, p) => sum + (p.formData?.price || 0), 0);
  const validProducts = products.filter((p) => p.isValid);

  // ============================================================
  // Render
  // ============================================================

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => !open && canClose && onClose()}
    >
      <SheetContent
        side="bottom"
        className="rounded-t-2xl p-0 overflow-hidden gap-0 max-h-[95vh] flex flex-col"
        showCloseButton={false}
      >
        {/* Handle Bar */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* ============================================================ */}
        {/* STAGE: Photo Selection */}
        {/* ============================================================ */}
        {stage === "photos" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Header */}
            <div className="px-5 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Upload className="h-5 w-5 text-gray-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Bulk Upload
                  </h2>
                  <p className="text-xs text-gray-500">
                    Upload photos of multiple items
                  </p>
                </div>
              </div>
            </div>

            {/* Photo Grid - Scrollable */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {photos.length === 0 ? (
                /* Empty state - upload buttons */
                <div className="space-y-3">
                  {/* Camera */}
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="w-full active:scale-[0.98] transition-transform"
                  >
                    <div className="bg-white border border-gray-300 rounded-xl p-5 flex items-center gap-4">
                      <div className="h-14 w-14 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Camera className="h-7 w-7 text-gray-700" />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-base font-semibold text-gray-900">
                          Take Photos
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Capture multiple items
                        </p>
                      </div>
                    </div>
                  </button>
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {/* Gallery */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full active:scale-[0.98] transition-transform"
                  >
                    <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4 active:bg-gray-50">
                      <div className="h-14 w-14 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <ImageIcon className="h-7 w-7 text-gray-600" />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-base font-semibold text-gray-900">
                          Choose from Gallery
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Select existing photos
                        </p>
                      </div>
                    </div>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  <p className="text-center text-xs text-gray-400 pt-2">
                    Upload photos of all items you want to list
                  </p>
                </div>
              ) : (
                /* Photo previews */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">
                      {photos.length} photo{photos.length !== 1 ? "s" : ""}{" "}
                      selected
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-sm font-medium text-gray-900 flex items-center gap-1"
                    >
                      <Plus className="h-4 w-4" />
                      Add more
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {photos.map((photo, index) => (
                      <div
                        key={index}
                        className="relative aspect-square rounded-xl overflow-hidden bg-gray-100"
                      >
                        <img
                          src={photo.preview}
                          alt={`Photo ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => removePhoto(index)}
                          className="absolute top-1.5 right-1.5 h-6 w-6 bg-black/60 rounded-full flex items-center justify-center z-10"
                        >
                          <X className="h-3.5 w-3.5 text-white" />
                        </button>
                        <div className="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-white font-medium">
                          {index + 1}
                        </div>
                      </div>
                    ))}

                    {/* Add more button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 active:bg-gray-100"
                    >
                      <Plus className="h-6 w-6 text-gray-400" />
                    </button>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="px-4 pb-8 pt-3 border-t border-gray-100 flex-shrink-0 bg-white">
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 h-12 rounded-xl border-gray-200"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={photos.length === 0}
                  className="flex-1 h-12 rounded-xl bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-semibold disabled:opacity-40"
                >
                  Continue with {photos.length} Photo
                  {photos.length !== 1 ? "s" : ""}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* STAGE: Uploading */}
        {/* ============================================================ */}
        {stage === "uploading" && (
          <div className="px-5 py-12 flex flex-col items-center">
            <div className="relative mb-6">
              <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
                <Upload className="h-7 w-7 text-gray-600" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#FFC72C] animate-spin" />
            </div>

            <p className="text-base font-medium text-gray-900 mb-1">
              {isCompressing ? "Optimising photos..." : "Uploading photos..."}
            </p>
            <p className="text-sm text-gray-500">
              {uploadProgress.current} of {uploadProgress.total}
            </p>

            <div className="w-48 h-1.5 bg-gray-200 rounded-full mt-4 overflow-hidden">
              <div
                className="h-full bg-[#FFC72C] rounded-full transition-all duration-300"
                style={{
                  width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* STAGE: Grouping */}
        {/* ============================================================ */}
        {stage === "grouping" && (
          <div className="px-5 py-12 flex flex-col items-center">
            <div className="relative mb-6">
              <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
                <Sparkles className="h-7 w-7 text-gray-600" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#FFC72C] animate-spin" />
            </div>

            <p className="text-base font-medium text-gray-900 mb-1">
              Yellow Jersey is analysing...
            </p>
            <p className="text-sm text-gray-500 text-center">
              Grouping photos and detecting products
            </p>
          </div>
        )}

        {/* ============================================================ */}
        {/* STAGE: Product Review */}
        {/* ============================================================ */}
        {stage === "reviewing" && currentProduct && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Header with progress */}
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <button
                onClick={goToPrevProduct}
                disabled={currentProductIndex === 0}
                className={cn(
                  "p-2 rounded-lg",
                  currentProductIndex === 0
                    ? "text-gray-300"
                    : "text-gray-700 active:bg-gray-100"
                )}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">
                  Product {currentProductIndex + 1}
                </span>
                <span className="text-sm text-gray-400">of</span>
                <span className="text-sm text-gray-600">{products.length}</span>
              </div>

              <button
                onClick={() => deleteProduct(currentProduct.groupId)}
                className="p-2 rounded-lg text-red-500 active:bg-red-50"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>

            {/* Progress dots */}
            <div className="flex justify-center gap-1.5 py-2 flex-shrink-0">
              {products.map((_, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-200",
                    idx === currentProductIndex
                      ? "w-6 bg-[#FFC72C]"
                      : idx < currentProductIndex
                        ? "w-1.5 bg-gray-400"
                        : "w-1.5 bg-gray-200"
                  )}
                />
              ))}
            </div>

            {/* Product Form - Scrollable */}
            <div className="flex-1 overflow-y-auto">
              {/* Photo */}
              <div className="relative aspect-square bg-gray-100">
                <Image
                  src={currentProduct.imageUrls[0]}
                  alt="Product"
                  fill
                  className="object-contain"
                  priority
                />
                {currentProduct.imageUrls.length > 1 && (
                  <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5">
                    <span className="text-xs font-medium text-white">
                      {currentProduct.imageUrls.length} photos
                    </span>
                  </div>
                )}
              </div>

              {/* Thumbnail Strip */}
              {currentProduct.imageUrls.length > 1 && (
                <div className="flex gap-2 p-3 overflow-x-auto border-b border-gray-100">
                  {currentProduct.imageUrls.map((url, index) => (
                    <div
                      key={index}
                      className={cn(
                        "relative flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2",
                        index === 0 ? "border-[#FFC72C]" : "border-gray-200"
                      )}
                    >
                      <Image
                        src={url}
                        alt={`Photo ${index + 1}`}
                        fill
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Form Fields */}
              <div className="p-4 space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Title
                  </label>
                  <Input
                    value={currentProduct.formData.title}
                    onChange={(e) => updateProductField("title", e.target.value)}
                    placeholder="Product name"
                    className="h-11 text-base rounded-xl"
                  />
                </div>

                {/* Price & Condition */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Price (AUD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        $
                      </span>
                      <Input
                        type="number"
                        value={currentProduct.formData.price}
                        onChange={(e) =>
                          updateProductField(
                            "price",
                            parseFloat(e.target.value) || 0
                          )
                        }
                        placeholder="0"
                        className="pl-7 h-11 text-base rounded-xl"
                        min="0"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Condition
                    </label>
                    <Select
                      value={currentProduct.formData.conditionRating}
                      onValueChange={(value) =>
                        updateProductField("conditionRating", value)
                      }
                    >
                      <SelectTrigger className="h-11 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITION_RATINGS.map((rating) => (
                          <SelectItem key={rating} value={rating}>
                            {rating}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Brand & Model */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Brand
                    </label>
                    <Input
                      value={currentProduct.formData.brand}
                      onChange={(e) =>
                        updateProductField("brand", e.target.value)
                      }
                      placeholder="Brand"
                      className="h-11 text-base rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Model
                    </label>
                    <Input
                      value={currentProduct.formData.model}
                      onChange={(e) =>
                        updateProductField("model", e.target.value)
                      }
                      placeholder="Model"
                      className="h-11 text-base rounded-xl"
                    />
                  </div>
                </div>

                {/* Type */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Type
                  </label>
                  <Select
                    value={currentProduct.formData.itemType}
                    onValueChange={(value) =>
                      updateProductField("itemType", value)
                    }
                  >
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bike">Bike</SelectItem>
                      <SelectItem value="part">Part/Component</SelectItem>
                      <SelectItem value="apparel">Apparel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Expandable Details */}
                <div className="border-t border-gray-100 pt-3">
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="w-full flex items-center justify-between py-2"
                  >
                    <span className="text-sm font-medium text-gray-900">
                      More Details
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-5 w-5 text-gray-400 transition-transform duration-200",
                        showDetails && "rotate-180"
                      )}
                    />
                  </button>

                  <div
                    className={cn(
                      "overflow-hidden transition-all duration-300",
                      showDetails ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
                    )}
                  >
                    <div className="space-y-3 pt-2 pb-4">
                      {/* Description */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Description
                        </label>
                        <Textarea
                          value={currentProduct.formData.description}
                          onChange={(e) =>
                            updateProductField("description", e.target.value)
                          }
                          placeholder="Describe your product..."
                          className="text-base rounded-xl resize-none"
                          rows={3}
                        />
                      </div>

                      {/* Bike-specific fields */}
                      {currentProduct.formData.itemType === "bike" && (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Year
                              </label>
                              <Input
                                value={currentProduct.formData.modelYear}
                                onChange={(e) =>
                                  updateProductField("modelYear", e.target.value)
                                }
                                placeholder="2023"
                                className="h-11 text-base rounded-xl"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Frame Size
                              </label>
                              <Input
                                value={currentProduct.formData.frameSize}
                                onChange={(e) =>
                                  updateProductField("frameSize", e.target.value)
                                }
                                placeholder="Medium"
                                className="h-11 text-base rounded-xl"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Material
                              </label>
                              <Input
                                value={currentProduct.formData.frameMaterial}
                                onChange={(e) =>
                                  updateProductField(
                                    "frameMaterial",
                                    e.target.value
                                  )
                                }
                                placeholder="Carbon"
                                className="h-11 text-base rounded-xl"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Groupset
                              </label>
                              <Input
                                value={currentProduct.formData.groupset}
                                onChange={(e) =>
                                  updateProductField("groupset", e.target.value)
                                }
                                placeholder="Shimano"
                                className="h-11 text-base rounded-xl"
                              />
                            </div>
                          </div>
                        </>
                      )}

                      {/* Part-specific fields */}
                      {currentProduct.formData.itemType === "part" && (
                        <>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Part Type
                            </label>
                            <Input
                              value={currentProduct.formData.partTypeDetail}
                              onChange={(e) =>
                                updateProductField(
                                  "partTypeDetail",
                                  e.target.value
                                )
                              }
                              placeholder="e.g., Rear Derailleur"
                              className="h-11 text-base rounded-xl"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Compatibility
                            </label>
                            <Textarea
                              value={currentProduct.formData.compatibilityNotes}
                              onChange={(e) =>
                                updateProductField(
                                  "compatibilityNotes",
                                  e.target.value
                                )
                              }
                              placeholder="Compatible with..."
                              className="text-base rounded-xl resize-none"
                              rows={2}
                            />
                          </div>
                        </>
                      )}

                      {/* Apparel-specific fields */}
                      {currentProduct.formData.itemType === "apparel" && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Size
                            </label>
                            <Input
                              value={currentProduct.formData.size}
                              onChange={(e) =>
                                updateProductField("size", e.target.value)
                              }
                              placeholder="Medium"
                              className="h-11 text-base rounded-xl"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Fit
                            </label>
                            <Select
                              value={currentProduct.formData.genderFit}
                              onValueChange={(value) =>
                                updateProductField("genderFit", value)
                              }
                            >
                              <SelectTrigger className="h-11 rounded-xl">
                                <SelectValue placeholder="Select..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Men's">Men's</SelectItem>
                                <SelectItem value="Women's">Women's</SelectItem>
                                <SelectItem value="Unisex">Unisex</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="px-4 pb-8 pt-3 border-t border-gray-100 flex-shrink-0 bg-white">
              <Button
                onClick={goToNextProduct}
                className="w-full h-12 rounded-xl bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-semibold"
              >
                {currentProductIndex < products.length - 1 ? (
                  <>
                    Next Product
                    <ChevronRight className="h-5 w-5 ml-1" />
                  </>
                ) : (
                  "Review All"
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* STAGE: Final Review */}
        {/* ============================================================ */}
        {stage === "final" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStage("reviewing")}
                  className="p-2 -ml-2 rounded-lg text-gray-600 active:bg-gray-100"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <h2 className="text-lg font-semibold text-gray-900">
                  Review & Publish
                </h2>
                <div className="w-9" />
              </div>
            </div>

            {/* Summary Stats */}
            <div className="flex gap-2 px-4 py-3 overflow-x-auto border-b border-gray-100 flex-shrink-0">
              <div className="bg-white rounded-xl px-4 py-2.5 border border-gray-200 flex-shrink-0">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">
                  Products
                </p>
                <p className="text-lg font-bold text-gray-900">
                  {products.length}
                </p>
              </div>
              <div className="bg-white rounded-xl px-4 py-2.5 border border-gray-200 flex-shrink-0">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">
                  Ready
                </p>
                <p className="text-lg font-bold text-green-600">
                  {validProducts.length}
                </p>
              </div>
              <div className="bg-white rounded-xl px-4 py-2.5 border border-gray-200 flex-shrink-0">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">
                  Total Value
                </p>
                <p className="text-lg font-bold text-gray-900">
                  ${totalValue.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Products List - Scrollable */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <div className="space-y-3">
                {products.map((product, index) => (
                  <div
                    key={product.groupId}
                    className={cn(
                      "bg-white rounded-xl border-2 overflow-hidden",
                      product.isValid ? "border-gray-200" : "border-yellow-300"
                    )}
                  >
                    <div className="flex gap-3 p-3">
                      {/* Thumbnail */}
                      <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                        <Image
                          src={
                            product.thumbnailUrls[0] || product.imageUrls[0]
                          }
                          alt={product.formData.title}
                          fill
                          className="object-cover"
                        />
                        {product.imageUrls.length > 1 && (
                          <div className="absolute bottom-1 right-1 bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-white font-medium">
                            +{product.imageUrls.length - 1}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {product.formData.title || "Untitled"}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {product.formData.brand} {product.formData.model}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-sm font-bold text-gray-900">
                            ${product.formData.price.toLocaleString()}
                          </span>
                          <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            {product.formData.conditionRating}
                          </span>
                        </div>
                      </div>

                      {/* Edit Button */}
                      <button
                        onClick={() => editProduct(index)}
                        className="p-2 rounded-lg text-gray-400 active:bg-gray-100 flex-shrink-0 self-center"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Validation warning */}
                    {!product.isValid && (
                      <div className="px-3 pb-3">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 flex items-center gap-2">
                          <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                          <p className="text-xs text-yellow-800">
                            Missing required fields
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Error Message */}
              {error && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="px-4 pb-8 pt-3 border-t border-gray-100 flex-shrink-0 bg-white">
              <Button
                onClick={handlePublish}
                disabled={validProducts.length === 0}
                className="w-full h-12 rounded-xl bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-semibold disabled:opacity-40"
              >
                Publish {validProducts.length} Listing
                {validProducts.length !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* STAGE: Publishing */}
        {/* ============================================================ */}
        {stage === "publishing" && (
          <div className="px-5 py-12 flex flex-col items-center">
            <div className="relative mb-6">
              <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
                <Loader2 className="h-7 w-7 text-gray-600 animate-spin" />
              </div>
            </div>

            <p className="text-base font-medium text-gray-900 mb-1">
              Publishing your listings...
            </p>
            <p className="text-sm text-gray-500 text-center">
              {products.length} product{products.length !== 1 ? "s" : ""} going
              live
            </p>
          </div>
        )}

        {/* ============================================================ */}
        {/* STAGE: Success */}
        {/* ============================================================ */}
        {stage === "success" && (
          <div className="px-5 py-10 flex flex-col items-center">
            {/* Success Icon */}
            <div className="h-20 w-20 rounded-full bg-[#FFC72C] flex items-center justify-center mb-6 animate-in zoom-in-50 duration-300">
              <CheckCircle2 className="h-10 w-10 text-gray-900" />
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-gray-900 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-100">
              {successListingIds.length === 1
                ? "Listing Published!"
                : "Listings Published!"}
            </h2>

            {/* Subtitle */}
            <p className="text-base text-gray-600 mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-150">
              {successListingIds.length}{" "}
              {successListingIds.length === 1 ? "item is" : "items are"} now
              live
            </p>

            {/* Stats */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 w-full max-w-xs mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-200">
              <div className="flex justify-between items-center">
                <div className="text-left">
                  <p className="text-xs text-gray-500 mb-1">Total Items</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {successListingIds.length}
                  </p>
                </div>
                <div className="h-10 w-px bg-gray-200" />
                <div className="text-right">
                  <p className="text-xs text-gray-500 mb-1">Total Value</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${totalValue.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3 w-full max-w-xs animate-in fade-in slide-in-from-bottom-2 duration-300 delay-300">
              <Button
                onClick={() => {
                  onClose();
                  router.push("/marketplace");
                }}
                className="w-full h-12 rounded-xl bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-semibold"
              >
                View on Marketplace
              </Button>
              <Button
                onClick={() => {
                  onClose();
                  router.push("/settings/my-listings");
                }}
                variant="outline"
                className="w-full h-12 rounded-xl"
              >
                Manage My Listings
              </Button>
            </div>

            {/* Auto-redirect notice */}
            <p className="text-xs text-gray-400 mt-6 animate-in fade-in duration-500 delay-500">
              Redirecting to marketplace in 3 seconds...
            </p>
          </div>
        )}

        {/* Safe area padding for iOS */}
        <div className="h-safe-area-inset-bottom flex-shrink-0" />
      </SheetContent>
    </Sheet>
  );
}

