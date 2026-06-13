"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Camera,
  Image as ImageIcon,
  Plus,
  Loader2,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Trash2,
  Sparkles,
  Truck,
  MapPin,
  RotateCw,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
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
import { ShimmerText } from "@/app/marketplace/sell-redesign/_components/ui";
import { AiRedoDialog } from "@/app/marketplace/sell-redesign/_components/ai-redo-dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  compressImage,
  compressedToFile,
  shouldCompress,
} from "@/lib/utils/image-compression";
import { rotateCloudinaryUrlClockwise } from "@/lib/utils/cloudinary-rotation";
import { CONDITION_RATINGS, type ConditionRating } from "@/lib/types/listing";

// ============================================================
// Bulk Upload Sheet — "Guided" mobile flow
// One task per full screen with a 3-step progress bar:
//   Photos → (uploading + analysing) → Review (one item per screen)
//   → Publish (summary) → success
// ============================================================

const UPLOAD_CONCURRENCY = 3;
const BRAND = "#ffde59";
const BRAND_INK = "#1c1c1e";
const STEP_LABELS = ["Photos", "Review", "Publish"];

type BulkUploadStage =
  | "photos"
  | "uploading"
  | "grouping"
  | "review"
  | "summary"
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
  sellerNotes: string;
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
  shippingAvailable: boolean;
  shippingCost: number;
  pickupLocation: string;
  pickupAvailable: boolean;
}

function productFormDataFromAnalysis(
  analysis: any,
  fallbackName: string,
): ProductFormData {
  const titleParts = [
    analysis?.brand,
    analysis?.model,
    analysis?.model_year,
  ].filter(Boolean);
  const generatedTitle =
    analysis?.clean_title ||
    analysis?.title ||
    (titleParts.length > 0 ? titleParts.join(" ") : fallbackName);
  const bikeDetails = analysis?.bike_details || {};
  const partDetails = analysis?.part_details || {};
  const apparelDetails = analysis?.apparel_details || {};
  const priceEstimate = analysis?.price_estimate || {};

  return {
    title: generatedTitle,
    description: analysis?.description || "",
    sellerNotes: analysis?.seller_notes || "",
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
    partTypeDetail: partDetails.part_category || partDetails.part_type || "",
    compatibilityNotes: partDetails.compatibility || "",
    size: apparelDetails.size || "",
    genderFit: apparelDetails.gender_fit || "",
    conditionRating: (analysis?.condition_rating || "Good") as ConditionRating,
    conditionDetails:
      analysis?.condition_details || analysis?.condition_notes || "",
    price: priceEstimate.min_aud
      ? Math.round(
          priceEstimate.target_aud ||
            (priceEstimate.min_aud + priceEstimate.max_aud) / 2
        )
      : 0,
    originalRrp: priceEstimate.max_aud || 0,
    shippingAvailable: false,
    shippingCost: 0,
    pickupLocation: "",
    pickupAvailable: true,
  };
}

interface BulkUploadSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (listingIds: string[]) => void;
  /** Hydrate photos from an iMessage / Nest text upload session */
  textUploadToken?: string;
}

export function BulkUploadSheet({
  isOpen,
  onClose,
  onComplete,
  textUploadToken,
}: BulkUploadSheetProps) {
  const router = useRouter();

  const [stage, setStage] = React.useState<BulkUploadStage>("photos");

  const [photos, setPhotos] = React.useState<{ file: File; preview: string }[]>(
    []
  );

  const [uploadedPhotos, setUploadedPhotos] = React.useState<UploadedPhoto[]>(
    []
  );
  const [uploadProgress, setUploadProgress] = React.useState({
    current: 0,
    total: 0,
  });
  const [isCompressing, setIsCompressing] = React.useState(false);

  const [groups, setGroups] = React.useState<PhotoGroup[]>([]);
  const [products, setProducts] = React.useState<ProductData[]>([]);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [generatingId, setGeneratingId] = React.useState<string | null>(null);
  const [redoProductIndex, setRedoProductIndex] = React.useState<number | null>(null);
  const [redoingProduct, setRedoingProduct] = React.useState(false);
  const [redoProductError, setRedoProductError] = React.useState<string | null>(null);

  const [successListingIds, setSuccessListingIds] = React.useState<string[]>(
    []
  );
  const [error, setError] = React.useState<string | null>(null);
  const [showExitConfirm, setShowExitConfirm] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const blobUrlsRef = React.useRef<Set<string>>(new Set());
  const loadedTextUploadTokenRef = React.useRef<string | null>(null);

  // Reset on open (manual flow only — text upload sessions hydrate below)
  React.useEffect(() => {
    if (!isOpen) return;

    setSuccessListingIds([]);
    setShowExitConfirm(false);
    setUploadProgress({ current: 0, total: 0 });
    setGeneratingId(null);
    setCurrentIndex(0);

    if (textUploadToken) return;

    setStage("photos");
    setPhotos([]);
    setUploadedPhotos([]);
    setGroups([]);
    setProducts([]);
    setError(null);
    loadedTextUploadTokenRef.current = null;
  }, [isOpen, textUploadToken]);

  React.useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current.clear();
    };
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  // ============================================================
  // Photo selection
  // ============================================================

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addPhotos(files);
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
  // Upload → Group → Analyse
  // ============================================================

  const handleUpload = async () => {
    if (photos.length === 0) return;

    setError(null);
    setStage("uploading");
    setIsCompressing(true);
    setUploadProgress({ current: 0, total: photos.length });

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("You must be logged in to upload photos");
      }

      // Compress
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
        setUploadProgress({ current: i + 1, total: photos.length });
      }

      // Upload to Cloudinary
      setIsCompressing(false);
      setUploadProgress({ current: 0, total: compressedFiles.length });

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
                headers: { Authorization: `Bearer ${session.access_token}` },
                body: formData,
              }
            );

            if (!response.ok) {
              const err = await response.json();
              throw new Error(err.error || "Upload failed");
            }

            const result = await response.json();
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

      setUploadedPhotos(uploaded);
      await handleGrouping(uploaded, session.access_token);
    } catch (err) {
      console.error("❌ [BULK SHEET] Upload error:", err);
      setError(err instanceof Error ? err.message : "Upload failed");
      setStage("photos");
      setIsCompressing(false);
    }
  };

  const handleGrouping = async (
    uploaded: UploadedPhoto[],
    accessToken: string
  ) => {
    setStage("grouping");

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/group-photos-ai`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ imageUrls: uploaded.map((p) => p.url) }),
        }
      );

      if (!response.ok) throw new Error("Failed to group photos");

      const data = await response.json();
      setGroups(data.groups);
      await handleAnalysis(uploaded, data.groups, accessToken);
    } catch (err) {
      console.error("❌ [BULK SHEET] Grouping error:", err);
      const fallbackGroups: PhotoGroup[] = uploaded.map((_, index) => ({
        id: `group-${index + 1}`,
        photoIndexes: [index],
        suggestedName: `Product ${index + 1}`,
        confidence: 50,
      }));
      setGroups(fallbackGroups);
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        await handleAnalysis(uploaded, fallbackGroups, session.access_token);
      }
    }
  };

  const handleAnalysis = async (
    uploaded: UploadedPhoto[],
    photoGroups: PhotoGroup[],
    accessToken: string
  ) => {
    try {
      const analysisPromises = photoGroups.map(async (group) => {
        const imageUrls = group.photoIndexes.map((idx) => uploaded[idx].url);
        try {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analyze-listing-ai`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ imageUrls, userHints: {} }),
            }
          );
          if (!response.ok) throw new Error("Analysis failed");
          const result = await response.json();
          return { groupId: group.id, success: true, analysis: result.analysis };
        } catch (err) {
          console.error(`Failed to analyse group ${group.id}:`, err);
          return { groupId: group.id, success: false, analysis: null };
        }
      });

      const results = await Promise.all(analysisPromises);

      const analysedProducts: ProductData[] = photoGroups.map((group) => {
        const result = results.find((r) => r.groupId === group.id);
        const analysis = result?.success ? result.analysis : null;

        const titleParts = [
          analysis?.brand,
          analysis?.model,
          analysis?.model_year,
        ].filter(Boolean);
        const generatedTitle =
          analysis?.clean_title ||
          analysis?.title ||
          (titleParts.length > 0 ? titleParts.join(" ") : group.suggestedName);

        const bikeDetails = analysis?.bike_details || {};
        const partDetails = analysis?.part_details || {};
        const apparelDetails = analysis?.apparel_details || {};
        const priceEstimate = analysis?.price_estimate || {};

        const groupPhotos = group.photoIndexes.map((idx) => uploaded[idx]);

        const formData: ProductFormData = {
          title: generatedTitle,
          description: analysis?.description || "",
          sellerNotes: analysis?.seller_notes || "",
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
          conditionDetails:
            analysis?.condition_details || analysis?.condition_notes || "",
          price: priceEstimate.min_aud
            ? Math.round(
                priceEstimate.target_aud ||
                  (priceEstimate.min_aud + priceEstimate.max_aud) / 2
              )
            : 0,
          originalRrp: priceEstimate.max_aud || 0,
          shippingAvailable: false,
          shippingCost: 0,
          pickupLocation: "",
          pickupAvailable: true,
        };

        return {
          groupId: group.id,
          imageUrls: groupPhotos.map((p) => p.url),
          thumbnailUrls: groupPhotos.map((p) => p.thumbnailUrl || p.cardUrl),
          suggestedName: generatedTitle,
          aiData: analysis,
          formData,
          isValid: validateProduct(formData),
        };
      });

      setProducts(analysedProducts);
      setCurrentIndex(0);
      setStage("review");
    } catch (err) {
      console.error("❌ [BULK SHEET] Analysis error:", err);
      setError(err instanceof Error ? err.message : "Failed to analyse products");
      setStage("photos");
    }
  };

  // Hydrate photos from an iMessage / Nest text upload link
  React.useEffect(() => {
    if (!isOpen || !textUploadToken) return;
    if (loadedTextUploadTokenRef.current === textUploadToken) return;
    loadedTextUploadTokenRef.current = textUploadToken;

    let cancelled = false;

    const loadSessionPhotos = async () => {
      setError(null);
      setStage("grouping");

      try {
        const response = await fetch(
          `/api/marketplace/text-upload/sessions/${encodeURIComponent(textUploadToken)}`,
          { cache: "no-store" },
        );
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "Could not load this text upload.",
          );
        }

        const uploadedImages = Array.isArray(data?.uploadedImages)
          ? data.uploadedImages
          : [];
        const sessionPhotos: UploadedPhoto[] = uploadedImages
          .filter(
            (image: { url?: string }) => image && typeof image.url === "string",
          )
          .map((image: Record<string, string>, index: number) => ({
            id: image.publicId || `text-upload-${index}`,
            url: image.url,
            cardUrl: image.cardUrl || image.url,
            thumbnailUrl: image.thumbnailUrl || image.url,
            mobileCardUrl: image.mobileCardUrl || image.url,
          }));

        if (cancelled) return;
        if (sessionPhotos.length === 0) {
          throw new Error("This text upload has no photos.");
        }

        setUploadedPhotos(sessionPhotos);

        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          throw new Error("You must be logged in to continue");
        }

        await handleGrouping(sessionPhotos, session.access_token);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load this text upload.",
          );
          setStage("photos");
        }
      }
    };

    void loadSessionPhotos();

    return () => {
      cancelled = true;
    };
  }, [isOpen, textUploadToken]);

  // ============================================================
  // Per-product editing
  // ============================================================

  const validateProduct = (data: ProductFormData): boolean => {
    return !!(
      data.title &&
      data.title.trim().length > 0 &&
      data.brand &&
      data.model &&
      data.price > 0
    );
  };

  const updateProductFieldAt = (
    index: number,
    field: keyof ProductFormData,
    value: any
  ) => {
    setProducts((prev) =>
      prev.map((p, i) =>
        i === index
          ? {
              ...p,
              formData: { ...p.formData, [field]: value },
              isValid: validateProduct({ ...p.formData, [field]: value }),
            }
          : p
      )
    );
  };

  const rotateProductPhotoAt = (productIndex: number, photoIndex: number) => {
    setProducts((prev) =>
      prev.map((p, i) =>
        i !== productIndex
          ? p
          : {
              ...p,
              imageUrls: p.imageUrls.map((url, idx) =>
                idx === photoIndex
                  ? rotateCloudinaryUrlClockwise(url) || url
                  : url
              ),
              thumbnailUrls: p.thumbnailUrls.map((url, idx) =>
                idx === photoIndex
                  ? rotateCloudinaryUrlClockwise(url) || url
                  : url
              ),
            }
      )
    );
  };

  const setCoverPhotoAt = (productIndex: number, photoIndex: number) => {
    if (photoIndex === 0) return;
    const reorder = <T,>(arr: T[]): T[] => {
      const copy = [...arr];
      const [picked] = copy.splice(photoIndex, 1);
      copy.unshift(picked);
      return copy;
    };
    setProducts((prev) =>
      prev.map((p, i) =>
        i !== productIndex
          ? p
          : {
              ...p,
              imageUrls: reorder(p.imageUrls),
              thumbnailUrls: reorder(p.thumbnailUrls),
            }
      )
    );
  };

  const deleteProduct = (groupId: string) => {
    const next = products.filter((p) => p.groupId !== groupId);
    setProducts(next);
    if (next.length === 0) {
      setCurrentIndex(0);
      setStage("photos");
      return;
    }
    setCurrentIndex((i) => Math.min(i, next.length - 1));
  };

  const handleGenerateDescriptionAt = async (index: number) => {
    const product = products[index];
    if (!product) return;
    const fd = product.formData;
    if (!fd.title && !fd.brand && !fd.model) return;

    setGeneratingId(product.groupId);
    try {
      const response = await fetch("/api/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fd.title || `${fd.brand || ""} ${fd.model || ""}`.trim(),
          brand: fd.brand,
          model: fd.model,
          itemType: fd.itemType,
          bikeType: fd.bikeType,
          frameSize: fd.frameSize,
          frameMaterial: fd.frameMaterial,
          groupset: fd.groupset,
          wheelSize: fd.wheelSize,
          conditionRating: fd.conditionRating,
          partTypeDetail: fd.partTypeDetail,
          size: fd.size,
          genderFit: fd.genderFit,
        }),
      });
      const data = await response.json();
      if (data.success && data.description) {
        setProducts((prev) =>
          prev.map((p) =>
            p.groupId === product.groupId
              ? {
                  ...p,
                  formData: { ...p.formData, description: data.description },
                  isValid: validateProduct({
                    ...p.formData,
                    description: data.description,
                  }),
                }
              : p
          )
        );
      }
    } catch (err) {
      console.error("Error generating description:", err);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleRedoProductAt = async (index: number, hint: string) => {
    const product = products[index];
    if (!product) return;

    setRedoingProduct(true);
    setRedoProductError(null);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) throw new Error("You must be logged in to use AI analysis");

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analyze-listing-ai`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            imageUrls: product.imageUrls,
            userHints: {
              itemType: product.formData.itemType,
              text: `The previous AI result was for the wrong product. The seller says this item is: ${hint}`,
            },
          }),
        }
      );

      if (!response.ok) throw new Error("Analysis failed");

      const result = await response.json();
      const analysis = result.analysis;
      const formData = productFormDataFromAnalysis(analysis, product.suggestedName);

      setProducts((prev) =>
        prev.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                suggestedName: formData.title || item.suggestedName,
                aiData: analysis,
                formData,
                isValid: validateProduct(formData),
              }
            : item
        )
      );
      setRedoProductIndex(null);
    } catch (error) {
      setRedoProductError(
        error instanceof Error ? error.message : "Could not redo this item.",
      );
    } finally {
      setRedoingProduct(false);
    }
  };

  // ============================================================
  // Navigation
  // ============================================================

  const goNext = () => {
    if (currentIndex < products.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setStage("summary");
    }
  };

  const goPrev = () => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  };

  const editProduct = (index: number) => {
    setCurrentIndex(index);
    setStage("review");
  };

  // ============================================================
  // Publish
  // ============================================================

  const handlePublish = async () => {
    setStage("publishing");

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) throw new Error("You must be logged in");

      const listings = products.map((product) => {
        const imageData = product.imageUrls.map((url, index) => ({
          id: `${product.groupId}-${index}`,
          url,
          order: index,
          isPrimary: index === 0,
        }));

        const categoryMap: { [key: string]: string } = {
          bike: "Bicycles",
          part: "Parts",
          apparel: "Apparel",
        };

        return {
          title: product.formData.title || product.suggestedName,
          productDescription: product.formData.description,
          sellerNotes: product.formData.sellerNotes,
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
          shippingAvailable: product.formData.shippingAvailable,
          shippingCost: product.formData.shippingAvailable
            ? product.formData.shippingCost
            : null,
          pickupLocation: product.formData.pickupAvailable
            ? product.formData.pickupLocation
            : null,
          pickupOnly:
            !product.formData.shippingAvailable &&
            product.formData.pickupAvailable,
        };
      });

      const response = await fetch("/api/marketplace/listings/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listings }),
      });

      if (!response.ok) throw new Error("Failed to create listings");

      const result = await response.json();
      setSuccessListingIds(result.created || []);
      setStage("success");
      onComplete?.(result.created || []);

      setTimeout(() => {
        onClose();
        router.push("/marketplace");
      }, 3000);
    } catch (err) {
      console.error("❌ [BULK SHEET] Publishing error:", err);
      setError(err instanceof Error ? err.message : "Failed to publish listings");
      setStage("summary");
    }
  };

  // ============================================================
  // Close handling (with exit confirmation)
  // ============================================================

  const isBusy =
    stage === "uploading" || stage === "grouping" || stage === "publishing";

  const requestClose = () => {
    if (stage === "success") {
      onClose();
      return;
    }
    if (isBusy) return; // can't interrupt an in-flight operation
    if (
      stage === "photos" &&
      photos.length === 0 &&
      uploadedPhotos.length === 0
    ) {
      onClose();
      return;
    }
    setShowExitConfirm(true);
  };

  const confirmExit = () => {
    setShowExitConfirm(false);
    onClose();
  };

  const stepNumber =
    stage === "photos"
      ? 0
      : stage === "uploading" || stage === "grouping" || stage === "review"
        ? 1
        : 2;

  const totalValue = products.reduce(
    (sum, p) => sum + (p.formData?.price || 0),
    0
  );
  const current = products[currentIndex];

  // ============================================================
  // Render
  // ============================================================

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="flex max-h-[96dvh] flex-col gap-0 overflow-hidden rounded-t-xl p-0 sm:mx-auto sm:max-w-[480px]"
        style={{ height: "96dvh" }}
        showCloseButton={false}
      >
        {/* Handle bar */}
        <div className="flex flex-shrink-0 justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        {/* Progress header for the interactive steps */}
        {(stage === "photos" ||
          stage === "uploading" ||
          stage === "grouping" ||
          stage === "review" ||
          stage === "summary") && (
          <ProgressHeader
            step={stepNumber}
            onClose={requestClose}
            closeable={!isBusy}
          />
        )}

        {/* ---------------- PHOTOS ---------------- */}
        {stage === "photos" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <h1 className="px-1 text-[24px] font-bold leading-tight text-gray-900">
                Add your photos
              </h1>
              <p className="mb-4 mt-1.5 px-1 text-[15px] leading-relaxed text-gray-500">
                Snap or upload everything you want to sell. We&apos;ll sort them
                into separate listings for you.
              </p>

              {photos.length === 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex h-28 flex-col items-center justify-center gap-2 rounded-md border border-gray-200 bg-white text-gray-700 transition-transform active:scale-[0.98]"
                  >
                    <Camera className="h-7 w-7" />
                    <span className="text-[14px] font-semibold">Camera</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-28 flex-col items-center justify-center gap-2 rounded-md border border-gray-200 bg-white text-gray-700 transition-transform active:scale-[0.98]"
                  >
                    <ImageIcon className="h-7 w-7" />
                    <span className="text-[14px] font-semibold">
                      Photo library
                    </span>
                  </button>
                </div>
              ) : (
                <div>
                  <div className="mb-3 flex items-center justify-between px-1">
                    <p className="text-[14px] font-semibold text-gray-900">
                      {photos.length} photo{photos.length !== 1 ? "s" : ""} added
                    </p>
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1 text-[12px] font-medium text-gray-600">
                      <Sparkles className="h-3.5 w-3.5" />
                      Auto-sorted next
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((photo, index) => (
                      <div
                        key={index}
                        className="relative aspect-square overflow-hidden rounded-md bg-gray-100"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.preview}
                          alt={`Photo ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(index)}
                          className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60"
                          aria-label="Remove photo"
                        >
                          <X className="h-3.5 w-3.5 text-white" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="grid aspect-square place-items-center rounded-md border-2 border-dashed border-gray-300 bg-gray-50 active:bg-gray-100"
                    >
                      <Plus className="h-6 w-6 text-gray-400" />
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <p className="mt-3 px-1 text-[12px] text-rose-600">{error}</p>
              )}

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            <BottomBar>
              <BrandButton
                onClick={handleUpload}
                disabled={photos.length === 0}
              >
                <Sparkles className="h-5 w-5" />
                {photos.length === 0
                  ? "Add photos to continue"
                  : `Analyse ${photos.length} photo${photos.length !== 1 ? "s" : ""}`}
              </BrandButton>
            </BottomBar>
          </div>
        )}

        {/* ---------------- UPLOADING ---------------- */}
        {stage === "uploading" && (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <ShimmerText className="text-[17px] font-semibold tracking-tight">
              {isCompressing ? "Optimising photos…" : "Uploading photos…"}
            </ShimmerText>
            <p className="mt-1 text-[13px] text-gray-500">
              {uploadProgress.current} of {uploadProgress.total}
            </p>
            <div className="mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${
                    uploadProgress.total
                      ? (uploadProgress.current / uploadProgress.total) * 100
                      : 0
                  }%`,
                  backgroundColor: BRAND,
                }}
              />
            </div>
          </div>
        )}

        {/* ---------------- GROUPING / ANALYSING ---------------- */}
        {stage === "grouping" && (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <ShimmerText className="text-[17px] font-semibold tracking-tight">
              Analysing your photos…
            </ShimmerText>
            <p className="mt-1 text-[13px] text-gray-500">
              Grouping items and identifying makes, models &amp; prices
            </p>
          </div>
        )}

        {/* ---------------- REVIEW (one item per screen) ---------------- */}
        {stage === "review" && current && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex flex-shrink-0 items-center justify-between px-4 pb-2">
              <h2 className="text-[18px] font-bold text-gray-900">
                Item {currentIndex + 1} of {products.length}
              </h2>
              <div className="flex gap-1.5">
                {products.map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === currentIndex ? "w-5" : "w-1.5 bg-gray-200"
                    )}
                    style={
                      i === currentIndex ? { backgroundColor: BRAND } : undefined
                    }
                  />
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.groupId}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.25 }}
                >
                  <ProductEditorFields
                    product={current}
                    isGenerating={generatingId === current.groupId}
                    onPatch={(field, value) =>
                      updateProductFieldAt(currentIndex, field, value)
                    }
                    onRotate={(photoIndex) =>
                      rotateProductPhotoAt(currentIndex, photoIndex)
                    }
                    onSetCover={(photoIndex) =>
                      setCoverPhotoAt(currentIndex, photoIndex)
                    }
                    onGenerate={() => handleGenerateDescriptionAt(currentIndex)}
                    onRedo={() => setRedoProductIndex(currentIndex)}
                    onDelete={() => deleteProduct(current.groupId)}
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            <BottomBar>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={currentIndex === 0}
                  className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-md border border-gray-200 bg-white text-gray-700 transition-all active:scale-[0.97] disabled:opacity-40"
                  aria-label="Previous item"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <BrandButton onClick={goNext}>
                  {currentIndex < products.length - 1
                    ? "Looks good · Next"
                    : "Review all"}
                  <ChevronRight className="h-5 w-5" />
                </BrandButton>
              </div>
            </BottomBar>
          </div>
        )}

        {/* ---------------- SUMMARY ---------------- */}
        {stage === "summary" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-shrink-0 px-4 pb-2">
              <h2 className="text-[22px] font-bold text-gray-900">
                Ready to publish
              </h2>
              <p className="mt-0.5 text-[14px] text-gray-500">
                {products.length} listing{products.length !== 1 ? "s" : ""} · $
                {totalValue.toLocaleString()} total value
              </p>
            </div>

            <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-2">
              {products.map((product, index) => (
                <div
                  key={product.groupId}
                  className="flex items-center gap-3 rounded-md border border-gray-200 bg-white p-2.5"
                >
                  <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.thumbnailUrls[0] || product.imageUrls[0]}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-gray-900">
                      {product.formData.title || "Untitled item"}
                    </p>
                    <p className="text-[13px] text-gray-500">
                      ${(product.formData.price || 0).toLocaleString()} ·{" "}
                      {product.formData.conditionRating}
                    </p>
                    {!product.isValid && (
                      <span className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-[12px] font-medium text-amber-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Add details
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => editProduct(index)}
                    className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteProduct(product.groupId)}
                    className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-rose-600"
                    aria-label="Delete item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              {error && (
                <div className="rounded-xl border border-gray-200 bg-white p-3 text-center text-[13px] text-rose-600">
                  {error}
                </div>
              )}
            </div>

            <BottomBar>
              <BrandButton
                onClick={handlePublish}
                disabled={products.length === 0}
              >
                Publish {products.length} listing
                {products.length !== 1 ? "s" : ""} · $
                {totalValue.toLocaleString()}
              </BrandButton>
            </BottomBar>
          </div>
        )}

        {/* ---------------- PUBLISHING ---------------- */}
        {stage === "publishing" && (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <ShimmerText className="text-[17px] font-semibold tracking-tight">
              Publishing your listings…
            </ShimmerText>
            <p className="mt-1 text-[13px] text-gray-500">
              {products.length} item{products.length !== 1 ? "s" : ""} going live
            </p>
          </div>
        )}

        {/* ---------------- SUCCESS ---------------- */}
        {stage === "success" && (
          <div className="flex flex-1 flex-col items-center px-6 py-10">
            <div
              className="grid h-20 w-20 animate-in zoom-in-50 place-items-center rounded-full duration-300"
              style={{ backgroundColor: BRAND }}
            >
              <CheckCircle2 className="h-10 w-10 text-gray-900" />
            </div>
            <h2 className="mt-6 text-[24px] font-bold text-gray-900">
              {successListingIds.length === 1
                ? "Listing published!"
                : "You're live!"}
            </h2>
            <p className="mt-1.5 text-[15px] text-gray-600">
              {successListingIds.length}{" "}
              {successListingIds.length === 1 ? "item is" : "items are"} now live
            </p>

            <div className="mt-6 w-full max-w-xs rounded-md border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <p className="mb-1 text-[12px] text-gray-500">Total items</p>
                  <p className="text-[22px] font-bold text-gray-900">
                    {successListingIds.length}
                  </p>
                </div>
                <div className="h-10 w-px bg-gray-200" />
                <div className="text-right">
                  <p className="mb-1 text-[12px] text-gray-500">Total value</p>
                  <p className="text-[22px] font-bold text-gray-900">
                    ${totalValue.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 w-full max-w-xs space-y-3">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push("/marketplace");
                }}
                className="flex h-12 w-full items-center justify-center rounded-md text-[15px] font-semibold"
                style={{ backgroundColor: BRAND, color: BRAND_INK }}
              >
                View on marketplace
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push("/settings/my-listings");
                }}
                className="flex h-12 w-full items-center justify-center rounded-md border border-gray-200 bg-white text-[15px] font-semibold text-gray-900"
              >
                Manage my listings
              </button>
            </div>

            <p className="mt-6 text-[12px] text-gray-400">
              Redirecting to marketplace…
            </p>
          </div>
        )}

        {/* ---------------- EXIT CONFIRMATION ---------------- */}
        <ExitConfirmDialog
          open={showExitConfirm}
          onKeepEditing={() => setShowExitConfirm(false)}
          onExit={confirmExit}
        />
        <AiRedoDialog
          open={redoProductIndex !== null}
          isSubmitting={redoingProduct}
          error={redoProductError}
          onClose={() => {
            if (!redoingProduct) setRedoProductIndex(null);
          }}
          onSubmit={(hint) =>
            redoProductIndex !== null
              ? handleRedoProductAt(redoProductIndex, hint)
              : undefined
          }
        />
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// Shared bits
// ============================================================

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
      {children}
    </div>
  );
}

function BrandButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-12 w-full items-center justify-center gap-1.5 rounded-md text-[15px] font-semibold transition-all active:scale-[0.99] disabled:opacity-40"
      style={{ backgroundColor: BRAND, color: BRAND_INK }}
    >
      {children}
    </button>
  );
}

function ProgressHeader({
  step,
  onClose,
  closeable,
}: {
  step: number;
  onClose: () => void;
  closeable: boolean;
}) {
  return (
    <div className="flex-shrink-0 px-4 pb-3 pt-1">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-1.5">
          {STEP_LABELS.map((label, i) => (
            <div
              key={label}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i <= step ? "" : "bg-gray-200"
              )}
              style={i <= step ? { backgroundColor: BRAND } : undefined}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={!closeable}
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-30"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <p className="mt-1.5 text-[12px] font-medium text-gray-500">
        Step {step + 1} of 3 · {STEP_LABELS[step]}
      </p>
    </div>
  );
}

// ============================================================
// Exit confirmation dialog (popup animation per project conventions)
// ============================================================

function ExitConfirmDialog({
  open,
  onKeepEditing,
  onExit,
}: {
  open: boolean;
  onKeepEditing: () => void;
  onExit: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onKeepEditing}
            className="absolute inset-0 z-40 bg-black/40"
          />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="absolute left-1/2 top-1/2 z-50 w-[88%] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5"
          >
            <h3 className="text-[17px] font-bold text-gray-900">
              Are you sure you want to exit?
            </h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-gray-500">
              Your photos and the details you&apos;ve added won&apos;t be saved.
            </p>
            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                onClick={onKeepEditing}
                className="flex h-12 w-full items-center justify-center rounded-md text-[15px] font-semibold transition-all active:scale-[0.99]"
                style={{ backgroundColor: BRAND, color: BRAND_INK }}
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={onExit}
                className="flex h-12 w-full items-center justify-center rounded-md text-[15px] font-semibold text-rose-600 transition-colors hover:bg-rose-50"
              >
                Discard &amp; exit
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================================
// Full product editor (used by the Review step)
// ============================================================

interface ProductEditorFieldsProps {
  product: ProductData;
  isGenerating: boolean;
  onPatch: (field: keyof ProductFormData, value: any) => void;
  onRotate: (photoIndex: number) => void;
  onSetCover: (photoIndex: number) => void;
  onGenerate: () => void;
  onRedo: () => void;
  onDelete: () => void;
}

function ProductEditorFields({
  product,
  isGenerating,
  onPatch,
  onRotate,
  onSetCover,
  onGenerate,
  onRedo,
  onDelete,
}: ProductEditorFieldsProps) {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const fd = product.formData;
  const itemType = fd.itemType;
  const inputCls = "h-12 rounded-md text-[16px]";

  return (
    <div className="space-y-4">
      {/* Cover photo + rotate */}
      <div className="relative overflow-hidden rounded-md bg-gray-100">
        <div className="relative aspect-[4/3] w-full">
          <Image
            src={product.imageUrls[0]}
            alt="Cover"
            fill
            className="object-contain"
          />
        </div>
        <button
          type="button"
          onClick={() => onRotate(0)}
          className="absolute bottom-3 left-3 grid h-10 w-10 place-items-center rounded-full border border-gray-200 bg-white text-gray-800 shadow-sm active:bg-gray-100"
          aria-label="Rotate cover photo"
        >
          <RotateCw className="h-5 w-5" />
        </button>
      </div>

      {/* Thumbnail strip */}
      {product.imageUrls.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {product.imageUrls.map((url, photoIndex) => (
            <div
              key={`${url}-${photoIndex}`}
              className={cn(
                "relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md border-2",
                photoIndex === 0 ? "border-gray-900" : "border-transparent"
              )}
            >
              <button
                type="button"
                onClick={() => onSetCover(photoIndex)}
                className="absolute inset-0"
                aria-label={`Use photo ${photoIndex + 1} as cover`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
              <button
                type="button"
                onClick={() => onRotate(photoIndex)}
                className="absolute bottom-0.5 left-0.5 grid h-6 w-6 place-items-center rounded-full border border-gray-200 bg-white/95 text-gray-800 shadow-sm"
                aria-label={`Rotate photo ${photoIndex + 1}`}
              >
                <RotateCw className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Title */}
      <div className="rounded-md border border-gray-200 bg-white p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-gray-900">AI recognised this item</p>
            <p className="mt-0.5 truncate text-[12px] text-gray-500">
              {fd.title || product.suggestedName || "Review the generated details"}
            </p>
          </div>
          <button
            type="button"
            onClick={onRedo}
            className="flex-shrink-0 rounded-md bg-gray-100 px-2.5 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-200"
          >
            Wrong product?
          </button>
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="mb-1 block text-[13px] font-medium text-gray-700">
          Title
        </label>
        <Input
          value={fd.title}
          onChange={(e) => onPatch("title", e.target.value)}
          placeholder="Product name"
          className={inputCls}
        />
      </div>

      {/* Price + Condition */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[13px] font-medium text-gray-700">
            Price (AUD)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              $
            </span>
            <Input
              type="number"
              inputMode="numeric"
              value={fd.price}
              onChange={(e) => onPatch("price", parseFloat(e.target.value) || 0)}
              placeholder="0"
              min="0"
              className={cn(inputCls, "pl-7")}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-medium text-gray-700">
            Condition
          </label>
          <Select
            value={fd.conditionRating}
            onValueChange={(v) => onPatch("conditionRating", v)}
          >
            <SelectTrigger className="!h-12 w-full rounded-md py-1 text-[16px]">
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

      {/* Brand + Model */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[13px] font-medium text-gray-700">
            Brand
          </label>
          <Input
            value={fd.brand}
            onChange={(e) => onPatch("brand", e.target.value)}
            placeholder="Brand"
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-medium text-gray-700">
            Model
          </label>
          <Input
            value={fd.model}
            onChange={(e) => onPatch("model", e.target.value)}
            placeholder="Model"
            className={inputCls}
          />
        </div>
      </div>

      {/* Type */}
      <div>
        <label className="mb-1 block text-[13px] font-medium text-gray-700">
          Type
        </label>
        <Select value={fd.itemType} onValueChange={(v) => onPatch("itemType", v)}>
          <SelectTrigger className="!h-12 w-full rounded-md py-1 text-[16px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bike">Bike</SelectItem>
            <SelectItem value="part">Part/Component</SelectItem>
            <SelectItem value="apparel">Apparel</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Description + generate */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-[13px] font-medium text-gray-700">
            Description
          </label>
          <button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating || (!fd.title && !fd.brand && !fd.model)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" />
                Generate
              </>
            )}
          </button>
        </div>
        <div className="relative">
          <Textarea
            value={fd.description}
            onChange={(e) => onPatch("description", e.target.value)}
            placeholder="Describe your product…"
            rows={3}
            className="resize-none rounded-md pr-10 text-[16px]"
          />
          {fd.description && (
            <button
              type="button"
              onClick={() => onPatch("description", "")}
              className="absolute right-2 top-2 rounded-md p-1 hover:bg-gray-100"
              aria-label="Clear description"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Seller notes */}
      <div>
        <label className="mb-1 block text-[13px] font-medium text-gray-700">
          Seller notes
        </label>
        <Textarea
          value={fd.sellerNotes}
          onChange={(e) => onPatch("sellerNotes", e.target.value)}
          placeholder="Your notes about condition, wear, why selling…"
          rows={2}
          className="resize-none rounded-md text-[16px]"
        />
      </div>

      {/* More details */}
      <div className="rounded-md border border-gray-200">
        <button
          type="button"
          onClick={() => setDetailsOpen((s) => !s)}
          className="flex w-full items-center justify-between px-3 py-3 text-left"
        >
          <span className="text-[14px] font-medium text-gray-900">
            {itemType === "bike"
              ? "Bike details"
              : itemType === "part"
                ? "Part details"
                : "Apparel details"}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-gray-400 transition-transform duration-200",
              detailsOpen && "rotate-180"
            )}
          />
        </button>
        <AnimatePresence initial={false}>
          {detailsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
              className="overflow-hidden"
            >
              <div className="space-y-3 px-3 pb-3">
                {itemType === "bike" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[13px] font-medium text-gray-700">
                          Year
                        </label>
                        <Input
                          value={fd.modelYear}
                          onChange={(e) => onPatch("modelYear", e.target.value)}
                          placeholder="2023"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[13px] font-medium text-gray-700">
                          Frame size
                        </label>
                        <Input
                          value={fd.frameSize}
                          onChange={(e) => onPatch("frameSize", e.target.value)}
                          placeholder="Medium"
                          className={inputCls}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[13px] font-medium text-gray-700">
                          Material
                        </label>
                        <Input
                          value={fd.frameMaterial}
                          onChange={(e) =>
                            onPatch("frameMaterial", e.target.value)
                          }
                          placeholder="Carbon"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[13px] font-medium text-gray-700">
                          Groupset
                        </label>
                        <Input
                          value={fd.groupset}
                          onChange={(e) => onPatch("groupset", e.target.value)}
                          placeholder="Shimano"
                          className={inputCls}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[13px] font-medium text-gray-700">
                          Wheels
                        </label>
                        <Input
                          value={fd.wheelSize}
                          onChange={(e) => onPatch("wheelSize", e.target.value)}
                          placeholder={'29"'}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[13px] font-medium text-gray-700">
                          Colour
                        </label>
                        <Input
                          value={fd.colorPrimary}
                          onChange={(e) =>
                            onPatch("colorPrimary", e.target.value)
                          }
                          placeholder="Black"
                          className={inputCls}
                        />
                      </div>
                    </div>
                  </>
                )}

                {itemType === "part" && (
                  <>
                    <div>
                      <label className="mb-1 block text-[13px] font-medium text-gray-700">
                        Part type
                      </label>
                      <Input
                        value={fd.partTypeDetail}
                        onChange={(e) =>
                          onPatch("partTypeDetail", e.target.value)
                        }
                        placeholder="e.g. Rear Derailleur"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[13px] font-medium text-gray-700">
                        Compatibility
                      </label>
                      <Textarea
                        value={fd.compatibilityNotes}
                        onChange={(e) =>
                          onPatch("compatibilityNotes", e.target.value)
                        }
                        placeholder="Compatible with…"
                        rows={2}
                        className="resize-none rounded-md text-[16px]"
                      />
                    </div>
                  </>
                )}

                {itemType === "apparel" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[13px] font-medium text-gray-700">
                        Size
                      </label>
                      <Input
                        value={fd.size}
                        onChange={(e) => onPatch("size", e.target.value)}
                        placeholder="Medium"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[13px] font-medium text-gray-700">
                        Fit
                      </label>
                      <Select
                        value={fd.genderFit}
                        onValueChange={(v) => onPatch("genderFit", v)}
                      >
                        <SelectTrigger className="!h-12 w-full rounded-md py-1 text-[16px]">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Men's">Men&apos;s</SelectItem>
                          <SelectItem value="Women's">Women&apos;s</SelectItem>
                          <SelectItem value="Unisex">Unisex</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-[13px] font-medium text-gray-700">
                    Condition notes
                  </label>
                  <Textarea
                    value={fd.conditionDetails}
                    onChange={(e) => onPatch("conditionDetails", e.target.value)}
                    placeholder="Any wear or damage…"
                    rows={2}
                    className="resize-none rounded-md text-[16px]"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Delivery options */}
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-3">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-gray-500" />
            <span className="text-[14px] text-gray-700">Shipping</span>
          </div>
          <Switch
            checked={fd.shippingAvailable}
            onCheckedChange={(c) => onPatch("shippingAvailable", c)}
          />
        </div>
        {fd.shippingAvailable && (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              $
            </span>
            <Input
              type="number"
              inputMode="numeric"
              value={fd.shippingCost || ""}
              onChange={(e) =>
                onPatch("shippingCost", parseFloat(e.target.value) || 0)
              }
              placeholder="Postage cost (0 for free)"
              className={cn(inputCls, "pl-7")}
            />
          </div>
        )}
        <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-gray-500" />
            <span className="text-[14px] text-gray-700">Local pickup</span>
          </div>
          <Switch
            checked={fd.pickupAvailable}
            onCheckedChange={(c) => onPatch("pickupAvailable", c)}
          />
        </div>
        {fd.pickupAvailable && (
          <Input
            value={fd.pickupLocation || ""}
            onChange={(e) => onPatch("pickupLocation", e.target.value)}
            placeholder="Suburb or area"
            className={inputCls}
          />
        )}
        {!fd.shippingAvailable && !fd.pickupAvailable && (
          <p className="text-[12px] text-rose-600">
            Select at least one delivery option
          </p>
        )}
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-rose-600"
      >
        <Trash2 className="h-4 w-4" />
        Remove this item
      </button>
    </div>
  );
}
