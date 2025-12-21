"use client";

import * as React from "react";
import {
  Upload,
  Camera,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  Calendar,
  Clock,
  User,
  Trash2,
  Play,
  X,
  ChevronDown,
  Search,
  Plus,
  Sparkles,
  AlertCircle,
  Edit,
  MoreHorizontal,
  Wand2,
  Layers,
  Zap,
  ChevronLeft,
} from "lucide-react";
import Image from "next/image";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  compressImage,
  compressedToFile,
  shouldCompress,
} from "@/lib/utils/image-compression";
import { CONDITION_RATINGS, type ConditionRating } from "@/lib/types/listing";
import { motion, AnimatePresence } from "framer-motion";
import { useUserProfile } from "@/lib/hooks/use-user-profile";
import { ShieldAlert } from "lucide-react";

// ============================================================
// Admin Scheduled Uploads Page
// ============================================================

const ADMIN_EMAIL = "tom@lidgett.net";
const UPLOAD_CONCURRENCY = 3;

type PageTab = "create" | "queue";
type UploadMode = "quick" | "bulk";
type UploadStage = "idle" | "photos" | "enhance-options" | "uploading" | "enhancing" | "analysing" | "scheduling" | "saving" | "bulk-grouping" | "bulk-analysing" | "bulk-reviewing";

interface UploadedPhoto {
  id: string;
  url: string;
  cardUrl: string;
  thumbnailUrl: string;
  galleryUrl?: string;
  detailUrl?: string;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  businessName?: string;
  accountType?: string;
}

interface ScheduledListing {
  id: string;
  target_user_id: string;
  scheduled_for: string;
  status: string;
  form_data: any;
  images: any[];
  created_at: string;
  targetUser: { name: string; email: string };
  title: string;
  primaryImage: string | null;
}

interface FormData {
  title: string;
  productDescription: string;
  sellerNotes: string;
  wearNotes: string;
  usageEstimate: string;
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
  colorSecondary: string;
  suspensionType: string;
  partTypeDetail: string;
  compatibilityNotes: string;
  material: string;
  size: string;
  genderFit: string;
  apparelMaterial: string;
  conditionRating: ConditionRating;
  conditionDetails: string;
  price: number;
  originalRrp: number;
}

const defaultFormData: FormData = {
  title: "",
  productDescription: "",
  sellerNotes: "",
  wearNotes: "",
  usageEstimate: "",
  brand: "",
  model: "",
  modelYear: "",
  itemType: "bike",
  bikeType: "",
  frameSize: "",
  frameMaterial: "",
  groupset: "",
  wheelSize: "",
  colorPrimary: "",
  colorSecondary: "",
  suspensionType: "",
  partTypeDetail: "",
  compatibilityNotes: "",
  material: "",
  size: "",
  genderFit: "",
  apparelMaterial: "",
  conditionRating: "Good",
  conditionDetails: "",
  price: 0,
  originalRrp: 0,
};

export default function ScheduledUploadsPage() {
  // Check if user is admin
  const { profile, loading: profileLoading } = useUserProfile();
  const isAdmin = profile?.email === ADMIN_EMAIL;

  // Tab state
  const [activeTab, setActiveTab] = React.useState<PageTab>("create");

  // Create tab state
  const [uploadMode, setUploadMode] = React.useState<UploadMode>("quick");
  const [stage, setStage] = React.useState<UploadStage>("idle");
  const [photos, setPhotos] = React.useState<{ file: File; preview: string }[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = React.useState<UploadedPhoto[]>([]);
  const [uploadProgress, setUploadProgress] = React.useState({ current: 0, total: 0 });
  const [formData, setFormData] = React.useState<FormData>(defaultFormData);
  const [selectedUserId, setSelectedUserId] = React.useState<string>("");
  const [scheduledDate, setScheduledDate] = React.useState<string>("");
  const [scheduledTime, setScheduledTime] = React.useState<string>("09:00");
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [removeBackground, setRemoveBackground] = React.useState(false);

  // Bulk upload state
  interface PhotoGroup {
    id: string;
    photoIndexes: number[];
    suggestedName: string;
    confidence: number;
  }
  interface BulkProduct {
    groupId: string;
    imageUrls: string[];
    formData: FormData;
    selectedUserId: string;
    scheduledDate: string;
    scheduledTime: string;
  }
  const [bulkGroups, setBulkGroups] = React.useState<PhotoGroup[]>([]);
  const [bulkProducts, setBulkProducts] = React.useState<BulkProduct[]>([]);
  const [currentBulkIndex, setCurrentBulkIndex] = React.useState(0);

  // Users for dropdown
  const [users, setUsers] = React.useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = React.useState(false);
  const [userSearch, setUserSearch] = React.useState("");

  // Queue tab state
  const [scheduledListings, setScheduledListings] = React.useState<ScheduledListing[]>([]);
  const [queueLoading, setQueueLoading] = React.useState(false);
  const [queueFilter, setQueueFilter] = React.useState<string>("pending");

  // File input ref
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Show loading state while checking auth
  if (profileLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Show access denied if not admin
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="bg-white rounded-md max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <ShieldAlert className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Access Denied
            </h2>
            <p className="text-gray-600 mb-4">
              This page is restricted to administrators only.
            </p>
            <p className="text-sm text-gray-500">
              Logged in as: {profile?.email || "Unknown"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================================
  // Fetch Users
  // ============================================================
  const fetchUsers = React.useCallback(async (search?: string) => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);

      const response = await fetch(`/api/admin/scheduled-uploads/users?${params}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Fetch users error:", response.status, errorData);
        throw new Error(errorData.error || "Failed to fetch users");
      }

      const data = await response.json();
      setUsers(data.users || []);
    } catch (err: any) {
      console.error("Error fetching users:", err);
      setError(err.message || "Failed to fetch users");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // ============================================================
  // Fetch Scheduled Listings
  // ============================================================
  const fetchScheduledListings = React.useCallback(async () => {
    setQueueLoading(true);
    try {
      const params = new URLSearchParams();
      if (queueFilter !== "all") params.append("status", queueFilter);

      const response = await fetch(`/api/admin/scheduled-uploads?${params}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Fetch listings error:", response.status, errorData);
        throw new Error(errorData.error || "Failed to fetch listings");
      }

      const data = await response.json();
      setScheduledListings(data.listings || []);
    } catch (err: any) {
      console.error("Error fetching scheduled listings:", err);
      // Don't set error for queue - it will show empty state
    } finally {
      setQueueLoading(false);
    }
  }, [queueFilter]);

  // Load users and queue on mount
  React.useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  React.useEffect(() => {
    if (activeTab === "queue") {
      fetchScheduledListings();
    }
  }, [activeTab, fetchScheduledListings]);

  // Debounced user search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (userSearch) {
        fetchUsers(userSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch, fetchUsers]);

  // ============================================================
  // Photo Handlers
  // ============================================================
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newPhotos = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));

    setPhotos((prev) => [...prev, ...newPhotos]);
    setStage("photos");
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const photo = prev[index];
      if (photo?.preview) URL.revokeObjectURL(photo.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  // ============================================================
  // Upload & Analyse Handler
  // ============================================================
  const handleUploadAndAnalyse = async () => {
    if (photos.length === 0) return;

    setError(null);

    try {
      // Get Supabase session
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("You must be logged in to upload photos");
      }

      // Phase 0: Enhance cover image if requested
      let enhancedCover: UploadedPhoto | null = null;

      if (removeBackground) {
        setStage("enhancing");
        console.log("✨ [SCHEDULED] Enhancing cover image...");

        try {
          // Compress cover first
          const coverPhoto = photos[0];
          let coverFile: File;
          if (shouldCompress(coverPhoto.file)) {
            const compressed = await compressImage(coverPhoto.file, {
              maxDimension: 1920,
              quality: 0.8,
            });
            coverFile = compressedToFile(compressed, coverPhoto.file.name);
          } else {
            coverFile = coverPhoto.file;
          }

          // Upload to Cloudinary first
          const uploadFormData = new FormData();
          uploadFormData.append("file", coverFile);
          uploadFormData.append("listingId", `enhance-${Date.now()}`);
          uploadFormData.append("index", "0");

          const uploadResponse = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/upload-to-cloudinary`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
              body: uploadFormData,
            }
          );

          if (!uploadResponse.ok) {
            throw new Error("Failed to upload cover for enhancement");
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
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                imageUrl,
                listingId: `scheduled-${Date.now()}`,
              }),
            }
          );

          if (!enhanceResponse.ok) {
            throw new Error("Enhancement failed");
          }

          const enhanceResult = await enhanceResponse.json();
          enhancedCover = {
            id: `enhanced-cover`,
            url: enhanceResult.data.url,
            cardUrl: enhanceResult.data.cardUrl,
            thumbnailUrl: enhanceResult.data.thumbnailUrl,
            galleryUrl: enhanceResult.data.galleryUrl,
            detailUrl: enhanceResult.data.detailUrl,
          };
          console.log("✅ [SCHEDULED] Cover enhanced:", enhancedCover.cardUrl);
        } catch (err) {
          console.error("⚠️ [SCHEDULED] Enhancement failed, continuing without:", err);
          // Continue without enhancement if it fails
        }
      }

      // Phase 1: Compress images
      setStage("uploading");
      setUploadProgress({ current: 0, total: photos.length });
      console.log("🗜️ [SCHEDULED] Compressing", photos.length, "photos...");

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

      // Phase 2: Upload to Cloudinary
      // If we enhanced the cover, start from index 1
      const startIndex = enhancedCover ? 1 : 0;
      const filesToUpload = enhancedCover ? compressedFiles.slice(1) : compressedFiles;

      setUploadProgress({ current: 0, total: filesToUpload.length });
      console.log("📤 [SCHEDULED] Uploading to Cloudinary...");

      const uploaded: UploadedPhoto[] = [];
      const listingId = `scheduled-${Date.now()}`;

      // If we have an enhanced cover, add it first
      if (enhancedCover) {
        uploaded.push(enhancedCover);
      }

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
              }
            );

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || "Upload failed");
            }

            const result = await response.json();
            return {
              id: result.data.id,
              url: result.data.url,
              cardUrl: result.data.cardUrl,
              thumbnailUrl: result.data.thumbnailUrl,
              galleryUrl: result.data.galleryUrl,
              detailUrl: result.data.detailUrl,
            };
          })
        );

        uploaded.push(...batchResults);
        setUploadProgress({ current: Math.min(i + UPLOAD_CONCURRENCY, filesToUpload.length), total: filesToUpload.length });
      }

      setUploadedPhotos(uploaded);
      console.log("✅ [SCHEDULED] All photos uploaded");

      // Phase 3: AI Analysis
      setStage("analysing");
      console.log("🤖 [SCHEDULED] Starting AI analysis...");

      const urls = uploaded.map((p) => p.url);
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
        }
      );

      if (!analysisResponse.ok) {
        const errorData = await analysisResponse.json();
        throw new Error(errorData.error || "AI analysis failed");
      }

      const analysisResult = await analysisResponse.json();
      console.log("✅ [SCHEDULED] Analysis received");

      if (analysisResult.analysis) {
        const analysis = analysisResult.analysis;
        const bikeDetails = analysis.bike_details || {};
        const partDetails = analysis.part_details || {};
        const apparelDetails = analysis.apparel_details || {};
        const priceEstimate = analysis.price_estimate || {};

        // Map analysis to form data - include ALL fields from AI
        // - productDescription: product info (from web search enrichment) -> saves to product_description column
        // - seller_notes: condition assessment in first person (from image analysis)
        // - condition_details is the legacy field, used as fallback
        setFormData({
          title: [analysis.brand, analysis.model].filter(Boolean).join(" ") || "",
          productDescription: analysis.description || "",
          sellerNotes: analysis.seller_notes || analysis.condition_details || "",
          wearNotes: analysis.wear_notes || "",
          usageEstimate: analysis.usage_estimate || "",
          brand: analysis.brand || "",
          model: analysis.model || "",
          modelYear: analysis.model_year || "",
          itemType: analysis.item_type || "bike",
          bikeType: bikeDetails.bike_type || "",
          frameSize: bikeDetails.frame_size || "",
          frameMaterial: bikeDetails.frame_material || "",
          groupset: bikeDetails.groupset || "",
          wheelSize: bikeDetails.wheel_size || "",
          colorPrimary: bikeDetails.color_primary || "",
          colorSecondary: bikeDetails.color_secondary || "",
          suspensionType: bikeDetails.suspension_type || "",
          partTypeDetail: partDetails.part_type || partDetails.part_category || "",
          compatibilityNotes: partDetails.compatibility || "",
          material: partDetails.material || "",
          size: apparelDetails.size || "",
          genderFit: apparelDetails.gender_fit || "",
          apparelMaterial: apparelDetails.material || "",
          conditionRating: analysis.condition_rating || "Good",
          conditionDetails: analysis.wear_notes || "",
          price: priceEstimate.min_aud
            ? Math.round((priceEstimate.min_aud + priceEstimate.max_aud) / 2)
            : 0,
          originalRrp: priceEstimate.max_aud || 0,
        });

        console.log("📝 [SCHEDULED] Mapped form data with description:", analysis.description?.substring(0, 50));
      }

      // Move to scheduling stage
      setStage("scheduling");
    } catch (err: any) {
      console.error("❌ [SCHEDULED] Error:", err);
      setError(err.message || "Upload failed");
      setStage("photos");
    }
  };

  // ============================================================
  // Bulk Upload Handler
  // ============================================================
  const handleBulkUpload = async () => {
    if (photos.length === 0) return;

    setError(null);
    setStage("uploading");
    setUploadProgress({ current: 0, total: photos.length });

    try {
      // Get Supabase session
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("You must be logged in to upload photos");
      }

      // Phase 1: Compress all images
      console.log("🗜️ [BULK SCHEDULED] Compressing", photos.length, "photos...");

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

      // Phase 2: Upload to Cloudinary
      setUploadProgress({ current: 0, total: compressedFiles.length });
      console.log("📤 [BULK SCHEDULED] Uploading to Cloudinary...");

      const uploaded: UploadedPhoto[] = [];
      const listingId = `bulk-scheduled-${Date.now()}`;

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
            return {
              id: result.data.id,
              url: result.data.url,
              cardUrl: result.data.cardUrl,
              thumbnailUrl: result.data.thumbnailUrl,
              galleryUrl: result.data.galleryUrl,
              detailUrl: result.data.detailUrl,
            };
          })
        );

        uploaded.push(...batchResults);
        setUploadProgress({ current: uploaded.length, total: compressedFiles.length });
      }

      setUploadedPhotos(uploaded);
      console.log("✅ [BULK SCHEDULED] All photos uploaded");

      // Phase 3: Group photos with AI
      setStage("bulk-grouping");
      console.log("🔀 [BULK SCHEDULED] Grouping photos with AI...");

      const groupResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/group-photos-ai`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            imageUrls: uploaded.map((p) => p.url),
          }),
        }
      );

      if (!groupResponse.ok) {
        const errorData = await groupResponse.json();
        throw new Error(errorData.error || "Photo grouping failed");
      }

      const groupResult = await groupResponse.json();
      console.log("✅ [BULK SCHEDULED] Grouped into", groupResult.groups?.length || 0, "products");

      if (!groupResult.groups || groupResult.groups.length === 0) {
        // Fallback: create one group per photo
        const fallbackGroups = uploaded.map((_, index) => ({
          id: `group-${index}`,
          photoIndexes: [index],
          suggestedName: `Product ${index + 1}`,
          confidence: 1,
        }));
        setBulkGroups(fallbackGroups);
      } else {
        setBulkGroups(groupResult.groups);
      }

      // Phase 4: Enhance cover images if requested
      const groups = groupResult.groups || bulkGroups;
      const enhancedCovers: Map<string, UploadedPhoto> = new Map();

      if (removeBackground && groups.length > 0) {
        setStage("enhancing");
        console.log("✨ [BULK SCHEDULED] Enhancing cover images for", groups.length, "products...");

        for (let i = 0; i < groups.length; i++) {
          const group = groups[i];
          const coverIndex = group.photoIndexes[0];
          const coverPhoto = uploaded[coverIndex];

          if (coverPhoto) {
            try {
              console.log(`✨ [BULK SCHEDULED] Enhancing cover for group ${i + 1}/${groups.length}...`);
              
              const enhanceResponse = await fetch(
                `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/enhance-product-image`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({
                    imageUrl: coverPhoto.url,
                    listingId: `bulk-scheduled-${Date.now()}-${i}`,
                  }),
                }
              );

              if (enhanceResponse.ok) {
                const enhanceResult = await enhanceResponse.json();
                enhancedCovers.set(group.id, {
                  id: `enhanced-cover-${i}`,
                  url: enhanceResult.data.url,
                  cardUrl: enhanceResult.data.cardUrl,
                  thumbnailUrl: enhanceResult.data.thumbnailUrl,
                  galleryUrl: enhanceResult.data.galleryUrl,
                  detailUrl: enhanceResult.data.detailUrl,
                });
                console.log(`✅ [BULK SCHEDULED] Enhanced cover for group ${i + 1}`);
              }
            } catch (err) {
              console.error(`⚠️ [BULK SCHEDULED] Failed to enhance cover for group ${i + 1}:`, err);
              // Continue without enhancement
            }
          }
        }
      }

      // Phase 5: Analyse each group
      setStage("bulk-analysing");
      console.log("🤖 [BULK SCHEDULED] Analysing products...");

      const products: BulkProduct[] = [];

      for (const group of groups) {
        // Get image URLs, replacing cover with enhanced version if available
        let imageUrls = group.photoIndexes.map((idx: number) => uploaded[idx]?.url).filter(Boolean);
        
        // Replace the cover image with enhanced version if available
        const enhancedCover = enhancedCovers.get(group.id);
        if (enhancedCover && imageUrls.length > 0) {
          imageUrls = [enhancedCover.url, ...imageUrls.slice(1)];
        }

        try {
          const analysisResponse = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analyze-listing-ai`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                imageUrls,
                userHints: {},
              }),
            }
          );

          let analysisData: FormData = { ...defaultFormData };

          if (analysisResponse.ok) {
            const analysisResult = await analysisResponse.json();
            if (analysisResult.analysis) {
              const analysis = analysisResult.analysis;
              const bikeDetails = analysis.bike_details || {};
              const partDetails = analysis.part_details || {};
              const apparelDetails = analysis.apparel_details || {};
              const priceEstimate = analysis.price_estimate || {};

              analysisData = {
                title: [analysis.brand, analysis.model].filter(Boolean).join(" ") || group.suggestedName,
                productDescription: analysis.description || "",
                sellerNotes: analysis.seller_notes || analysis.condition_details || "",
                wearNotes: analysis.wear_notes || "",
                usageEstimate: analysis.usage_estimate || "",
                brand: analysis.brand || "",
                model: analysis.model || "",
                modelYear: analysis.model_year || "",
                itemType: analysis.item_type || "bike",
                bikeType: bikeDetails.bike_type || "",
                frameSize: bikeDetails.frame_size || "",
                frameMaterial: bikeDetails.frame_material || "",
                groupset: bikeDetails.groupset || "",
                wheelSize: bikeDetails.wheel_size || "",
                colorPrimary: bikeDetails.color_primary || "",
                colorSecondary: bikeDetails.color_secondary || "",
                suspensionType: bikeDetails.suspension_type || "",
                partTypeDetail: partDetails.part_type || partDetails.part_category || "",
                compatibilityNotes: partDetails.compatibility || "",
                material: partDetails.material || "",
                size: apparelDetails.size || "",
                genderFit: apparelDetails.gender_fit || "",
                apparelMaterial: apparelDetails.material || "",
                conditionRating: analysis.condition_rating || "Good",
                conditionDetails: analysis.wear_notes || "",
                price: priceEstimate.min_aud
                  ? Math.round((priceEstimate.min_aud + priceEstimate.max_aud) / 2)
                  : 0,
                originalRrp: priceEstimate.max_aud || 0,
              };
            }
          }

          products.push({
            groupId: group.id,
            imageUrls,
            formData: analysisData,
            selectedUserId: "",
            scheduledDate: "",
            scheduledTime: "09:00",
          });
        } catch (err) {
          console.error(`Failed to analyse group ${group.id}:`, err);
          products.push({
            groupId: group.id,
            imageUrls,
            formData: { ...defaultFormData, title: group.suggestedName },
            selectedUserId: "",
            scheduledDate: "",
            scheduledTime: "09:00",
          });
        }
      }

      setBulkProducts(products);
      setCurrentBulkIndex(0);
      setStage("bulk-reviewing");
      console.log("✅ [BULK SCHEDULED] Ready to review", products.length, "products");
    } catch (err: any) {
      console.error("❌ [BULK SCHEDULED] Error:", err);
      setError(err.message || "Bulk upload failed");
      setStage("photos");
    }
  };

  // ============================================================
  // Save Scheduled Listing
  // ============================================================
  const handleSaveScheduledListing = async () => {
    if (!selectedUserId) {
      setError("Please select a user");
      return;
    }
    if (!scheduledDate) {
      setError("Please select a date");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Combine date and time - interpret as user's browser local timezone
      // The date/time picker uses the browser's local timezone
      // This will be converted to UTC for storage, and displayed in Australian timezone in the queue
      const scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();

      // Build complete form data for the listing
      const completeFormData = {
        ...formData,
        images: uploadedPhotos.map((photo, index) => ({
          id: photo.id,
          url: photo.url,
          cardUrl: photo.cardUrl,
          thumbnailUrl: photo.thumbnailUrl,
          galleryUrl: photo.galleryUrl,
          detailUrl: photo.detailUrl,
          order: index,
          isPrimary: index === 0,
        })),
        primaryImageUrl: uploadedPhotos[0]?.cardUrl || uploadedPhotos[0]?.url,
      };

      const response = await fetch("/api/admin/scheduled-uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: selectedUserId,
          scheduledFor,
          formData: completeFormData,
          images: uploadedPhotos,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error("❌ [SCHEDULED] API Error:", response.status, data);
        throw new Error(data.error || `Failed to save (${response.status})`);
      }

      console.log("✅ [SCHEDULED] Saved scheduled listing");

      // Reset form and show success
      setStage("idle");
      setPhotos([]);
      setUploadedPhotos([]);
      setFormData(defaultFormData);
      setSelectedUserId("");
      setScheduledDate("");
      setScheduledTime("09:00");

      // Switch to queue tab
      setActiveTab("queue");
      fetchScheduledListings();
    } catch (err: any) {
      console.error("❌ [SCHEDULED] Error saving:", err);
      setError(err.message || "Failed to save scheduled listing");
    } finally {
      setIsSaving(false);
    }
  };

  // ============================================================
  // Queue Actions
  // ============================================================
  const handleCancelListing = async (id: string) => {
    try {
      const response = await fetch("/api/admin/scheduled-uploads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "cancelled" }),
      });

      if (!response.ok) throw new Error("Failed to cancel");
      fetchScheduledListings();
    } catch (err) {
      console.error("Error cancelling:", err);
    }
  };

  const handleDeleteListing = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/scheduled-uploads?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete");
      fetchScheduledListings();
    } catch (err) {
      console.error("Error deleting:", err);
    }
  };

  const handlePublishNow = async (id: string) => {
    try {
      const response = await fetch("/api/admin/scheduled-uploads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          scheduledFor: new Date().toISOString(),
        }),
      });

      if (!response.ok) throw new Error("Failed to update");
      fetchScheduledListings();
    } catch (err) {
      console.error("Error publishing:", err);
    }
  };

  // ============================================================
  // Reset Handler
  // ============================================================
  const handleReset = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.preview));
    setStage("idle");
    setPhotos([]);
    setUploadedPhotos([]);
    setFormData(defaultFormData);
    setError(null);
    setRemoveBackground(false);
    setBulkGroups([]);
    setBulkProducts([]);
    setCurrentBulkIndex(0);
  };

  // ============================================================
  // Bulk Product Handlers
  // ============================================================
  const handleBulkProductUpdate = (index: number, updates: Partial<BulkProduct>) => {
    setBulkProducts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...updates } : p))
    );
  };

  const handleBulkProductFormUpdate = (index: number, formUpdates: Partial<FormData>) => {
    setBulkProducts((prev) =>
      prev.map((p, i) =>
        i === index ? { ...p, formData: { ...p.formData, ...formUpdates } } : p
      )
    );
  };

  const handleSaveBulkProduct = async (index: number) => {
    const product = bulkProducts[index];
    if (!product.selectedUserId || !product.scheduledDate) {
      setError("Please select a user and date for this product");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const scheduledFor = new Date(`${product.scheduledDate}T${product.scheduledTime}`).toISOString();

      const completeFormData = {
        ...product.formData,
        images: product.imageUrls.map((url, idx) => ({
          id: `${product.groupId}-${idx}`,
          url,
          cardUrl: url, // Use same URL for now
          thumbnailUrl: url,
          order: idx,
          isPrimary: idx === 0,
        })),
        primaryImageUrl: product.imageUrls[0],
      };

      const response = await fetch("/api/admin/scheduled-uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: product.selectedUserId,
          scheduledFor,
          formData: completeFormData,
          images: product.imageUrls.map((url, idx) => ({
            id: `${product.groupId}-${idx}`,
            url,
            cardUrl: url,
            thumbnailUrl: url,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }

      console.log("✅ [BULK SCHEDULED] Saved product", index + 1);

      // Move to next product or finish
      if (index < bulkProducts.length - 1) {
        setCurrentBulkIndex(index + 1);
      } else {
        // All done
        handleReset();
        setActiveTab("queue");
        fetchScheduledListings();
      }
    } catch (err: any) {
      console.error("❌ [BULK SCHEDULED] Error saving product:", err);
      setError(err.message || "Failed to save product");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkipBulkProduct = () => {
    if (currentBulkIndex < bulkProducts.length - 1) {
      setCurrentBulkIndex(currentBulkIndex + 1);
    } else {
      // All done
      handleReset();
      setActiveTab("queue");
      fetchScheduledListings();
    }
  };

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Scheduled Uploads</h1>
          <p className="text-gray-600 mt-1">
            Upload and schedule listings to be published at a future date for any user
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit mb-6">
          <button
            onClick={() => setActiveTab("create")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "create"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70"
            )}
          >
            <Plus size={15} />
            Create
          </button>
          <button
            onClick={() => setActiveTab("queue")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "queue"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70"
            )}
          >
            <Calendar size={15} />
            Queue
            {scheduledListings.filter((l) => l.status === "pending").length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-md">
                {scheduledListings.filter((l) => l.status === "pending").length}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {activeTab === "create" && (
            <motion.div
              key="create"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {/* Create Tab Content */}
              {stage === "idle" || stage === "photos" ? (
                <Card className="bg-white rounded-md">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Camera className="h-5 w-5" />
                        Upload Photos
                      </CardTitle>
                      {/* Upload Mode Toggle */}
                      <div className="flex items-center bg-gray-100 p-0.5 rounded-md">
                        <button
                          onClick={() => setUploadMode("quick")}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                            uploadMode === "quick"
                              ? "text-gray-800 bg-white shadow-sm"
                              : "text-gray-600 hover:bg-gray-200/70"
                          )}
                        >
                          <Zap className="h-3.5 w-3.5" />
                          Quick
                        </button>
                        <button
                          onClick={() => setUploadMode("bulk")}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                            uploadMode === "bulk"
                              ? "text-gray-800 bg-white shadow-sm"
                              : "text-gray-600 hover:bg-gray-200/70"
                          )}
                        >
                          <Layers className="h-3.5 w-3.5" />
                          Bulk
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {uploadMode === "quick"
                        ? "Upload photos for a single product"
                        : "Upload photos for multiple products - AI will group them"}
                    </p>
                  </CardHeader>
                  <CardContent>
                    {/* Photo Upload Area */}
                    <div
                      className={cn(
                        "border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-colors",
                        photos.length > 0
                          ? "border-gray-300 bg-gray-50"
                          : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
                      )}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                      <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
                      <p className="text-gray-600 font-medium">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-gray-400 text-sm mt-1">
                        PNG, JPG, HEIC up to 15MB each
                      </p>
                    </div>

                    {/* Photo Previews */}
                    {photos.length > 0 && (
                      <div className="mt-6">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-gray-700">
                            {photos.length} photo{photos.length !== 1 ? "s" : ""} selected
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleReset}
                            className="text-gray-500"
                          >
                            Clear all
                          </Button>
                        </div>
                        <p className="text-xs text-gray-500 mb-2">First photo is the cover image</p>
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                          {photos.map((photo, index) => (
                            <div key={index} className="relative aspect-square group">
                              <Image
                                src={photo.preview}
                                alt={`Photo ${index + 1}`}
                                fill
                                className={cn(
                                  "object-cover rounded-md",
                                  index === 0 && "ring-2 ring-[#FFC72C]"
                                )}
                              />
                              {index === 0 && (
                                <span className="absolute bottom-1 left-1 bg-[#FFC72C] text-gray-900 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                  COVER
                                </span>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removePhoto(index);
                                }}
                                className="absolute -top-1 -right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="aspect-square border-2 border-dashed border-gray-300 rounded-md flex items-center justify-center hover:border-gray-400 hover:bg-gray-50 transition-colors"
                          >
                            <Plus className="h-6 w-6 text-gray-400" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Enhance Cover Toggle - Available for both Quick and Bulk modes */}
                    {photos.length > 0 && (
                      <div className="mt-6 pt-6 border-t border-gray-200">
                        <button
                          onClick={() => setRemoveBackground(!removeBackground)}
                          className={cn(
                            "w-full flex items-center justify-between p-4 rounded-md border-2 transition-all duration-200",
                            removeBackground
                              ? "border-gray-900 bg-gray-900"
                              : "border-gray-200 bg-white hover:border-gray-300"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "h-10 w-10 rounded-md flex items-center justify-center transition-colors duration-200",
                                removeBackground ? "bg-white/10" : "bg-gray-100"
                              )}
                            >
                              <Wand2
                                className={cn(
                                  "h-5 w-5 transition-colors duration-200",
                                  removeBackground ? "text-white" : "text-gray-600"
                                )}
                              />
                            </div>
                            <div className="text-left">
                              <p
                                className={cn(
                                  "text-sm font-semibold transition-colors duration-200",
                                  removeBackground ? "text-white" : "text-gray-900"
                                )}
                              >
                                Remove Background
                              </p>
                              <p
                                className={cn(
                                  "text-xs transition-colors duration-200",
                                  removeBackground ? "text-gray-300" : "text-gray-500"
                                )}
                              >
                                {uploadMode === "quick"
                                  ? "Studio-quality white backdrop for cover image"
                                  : "Studio-quality white backdrop for each product's cover"}
                              </p>
                            </div>
                          </div>
                          <div
                            className={cn(
                              "h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all duration-200",
                              removeBackground
                                ? "border-white bg-white"
                                : "border-gray-300 bg-white"
                            )}
                          >
                            {removeBackground && (
                              <CheckCircle2 className="h-5 w-5 text-gray-900" />
                            )}
                          </div>
                        </button>
                      </div>
                    )}

                    {/* Error Display */}
                    {error && (
                      <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm">{error}</span>
                      </div>
                    )}

                    {/* Upload Button */}
                    {photos.length > 0 && (
                      <Button
                        className="w-full mt-6 bg-gray-900 hover:bg-gray-800"
                        onClick={uploadMode === "quick" ? handleUploadAndAnalyse : handleBulkUpload}
                        disabled={photos.length === 0}
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        {uploadMode === "quick"
                          ? removeBackground
                            ? "Enhance & Analyse with AI"
                            : "Upload & Analyse with AI"
                          : removeBackground
                          ? `Enhance & Process ${photos.length} Photos`
                          : `Process ${photos.length} Photos with AI`}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : stage === "enhancing" || stage === "uploading" || stage === "analysing" ? (
                <Card className="bg-white rounded-md">
                  <CardContent className="py-12 text-center">
                    <Loader2 className="h-10 w-10 mx-auto text-gray-900 animate-spin mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {stage === "enhancing"
                        ? "Enhancing Cover Image..."
                        : stage === "uploading"
                        ? "Uploading Photos..."
                        : "Analysing with AI..."}
                    </h3>
                    {stage === "enhancing" && (
                      <p className="text-gray-500">
                        Removing background for a studio-quality cover photo
                      </p>
                    )}
                    {stage === "uploading" && (
                      <div className="max-w-xs mx-auto">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gray-900 transition-all duration-300"
                            style={{
                              width: `${uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <p className="text-sm text-gray-500 mt-2">
                          {uploadProgress.current} of {uploadProgress.total}
                        </p>
                      </div>
                    )}
                    {stage === "analysing" && (
                      <p className="text-gray-500">
                        Detecting brand, model, condition and suggesting a price...
                      </p>
                    )}
                  </CardContent>
                </Card>
              ) : stage === "bulk-grouping" || stage === "bulk-analysing" ? (
                <Card className="bg-white rounded-md">
                  <CardContent className="py-12 text-center">
                    <Loader2 className="h-10 w-10 mx-auto text-gray-900 animate-spin mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {stage === "bulk-grouping"
                        ? "Grouping Photos..."
                        : "Analysing Products..."}
                    </h3>
                    <p className="text-gray-500">
                      {stage === "bulk-grouping"
                        ? "AI is identifying which photos belong to each product"
                        : `Detecting details for ${bulkGroups.length} products`}
                    </p>
                  </CardContent>
                </Card>
              ) : stage === "bulk-reviewing" && bulkProducts.length > 0 ? (
                <div className="space-y-6">
                  {/* Progress indicator */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">
                        Product {currentBulkIndex + 1} of {bulkProducts.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {bulkProducts.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentBulkIndex(idx)}
                          className={cn(
                            "w-3 h-3 rounded-full transition-colors",
                            idx === currentBulkIndex
                              ? "bg-gray-900"
                              : idx < currentBulkIndex
                              ? "bg-green-500"
                              : "bg-gray-300"
                          )}
                        />
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleReset}
                      className="text-gray-500"
                    >
                      Cancel All
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: Form for current product */}
                    <Card className="bg-white rounded-md">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Edit className="h-5 w-5" />
                          Product {currentBulkIndex + 1} Details
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Title
                          </label>
                          <Input
                            value={bulkProducts[currentBulkIndex]?.formData.title || ""}
                            onChange={(e) =>
                              handleBulkProductFormUpdate(currentBulkIndex, { title: e.target.value })
                            }
                            className="rounded-md"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Brand
                            </label>
                            <Input
                              value={bulkProducts[currentBulkIndex]?.formData.brand || ""}
                              onChange={(e) =>
                                handleBulkProductFormUpdate(currentBulkIndex, { brand: e.target.value })
                              }
                              className="rounded-md"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Model
                            </label>
                            <Input
                              value={bulkProducts[currentBulkIndex]?.formData.model || ""}
                              onChange={(e) =>
                                handleBulkProductFormUpdate(currentBulkIndex, { model: e.target.value })
                              }
                              className="rounded-md"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Year
                            </label>
                            <Input
                              value={bulkProducts[currentBulkIndex]?.formData.modelYear || ""}
                              onChange={(e) =>
                                handleBulkProductFormUpdate(currentBulkIndex, { modelYear: e.target.value })
                              }
                              className="rounded-md"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Price ($)
                            </label>
                            <Input
                              type="number"
                              value={bulkProducts[currentBulkIndex]?.formData.price || ""}
                              onChange={(e) =>
                                handleBulkProductFormUpdate(currentBulkIndex, {
                                  price: parseInt(e.target.value) || 0,
                                })
                              }
                              className="rounded-md"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Item Type
                          </label>
                          <Select
                            value={bulkProducts[currentBulkIndex]?.formData.itemType || "bike"}
                            onValueChange={(value) =>
                              handleBulkProductFormUpdate(currentBulkIndex, { itemType: value })
                            }
                          >
                            <SelectTrigger className="rounded-md">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="bike">Bike</SelectItem>
                              <SelectItem value="part">Part</SelectItem>
                              <SelectItem value="apparel">Apparel</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Condition
                          </label>
                          <Select
                            value={bulkProducts[currentBulkIndex]?.formData.conditionRating || "Good"}
                            onValueChange={(value) =>
                              handleBulkProductFormUpdate(currentBulkIndex, {
                                conditionRating: value as ConditionRating,
                              })
                            }
                          >
                            <SelectTrigger className="rounded-md">
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

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Product Description
                          </label>
                          <Textarea
                            value={bulkProducts[currentBulkIndex]?.formData.productDescription || ""}
                            onChange={(e) =>
                              handleBulkProductFormUpdate(currentBulkIndex, { productDescription: e.target.value })
                            }
                            rows={3}
                            className="rounded-md"
                            placeholder="AI-generated product description..."
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Seller Notes
                          </label>
                          <Textarea
                            value={bulkProducts[currentBulkIndex]?.formData.sellerNotes || ""}
                            onChange={(e) =>
                              handleBulkProductFormUpdate(currentBulkIndex, { sellerNotes: e.target.value })
                            }
                            rows={2}
                            className="rounded-md"
                            placeholder="Notes about condition, history, etc."
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Wear Notes
                            </label>
                            <Input
                              value={bulkProducts[currentBulkIndex]?.formData.wearNotes || ""}
                              onChange={(e) =>
                                handleBulkProductFormUpdate(currentBulkIndex, { wearNotes: e.target.value })
                              }
                              className="rounded-md"
                              placeholder="E.g. Minor scratches"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Usage Estimate
                            </label>
                            <Input
                              value={bulkProducts[currentBulkIndex]?.formData.usageEstimate || ""}
                              onChange={(e) =>
                                handleBulkProductFormUpdate(currentBulkIndex, { usageEstimate: e.target.value })
                              }
                              className="rounded-md"
                              placeholder="E.g. 500km"
                            />
                          </div>
                        </div>

                        {/* Bike-specific fields */}
                        {bulkProducts[currentBulkIndex]?.formData.itemType === "bike" && (
                          <>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Bike Type
                                </label>
                                <Input
                                  value={bulkProducts[currentBulkIndex]?.formData.bikeType || ""}
                                  onChange={(e) =>
                                    handleBulkProductFormUpdate(currentBulkIndex, { bikeType: e.target.value })
                                  }
                                  className="rounded-md"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Frame Size
                                </label>
                                <Input
                                  value={bulkProducts[currentBulkIndex]?.formData.frameSize || ""}
                                  onChange={(e) =>
                                    handleBulkProductFormUpdate(currentBulkIndex, { frameSize: e.target.value })
                                  }
                                  className="rounded-md"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Frame Material
                                </label>
                                <Input
                                  value={bulkProducts[currentBulkIndex]?.formData.frameMaterial || ""}
                                  onChange={(e) =>
                                    handleBulkProductFormUpdate(currentBulkIndex, { frameMaterial: e.target.value })
                                  }
                                  className="rounded-md"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Groupset
                                </label>
                                <Input
                                  value={bulkProducts[currentBulkIndex]?.formData.groupset || ""}
                                  onChange={(e) =>
                                    handleBulkProductFormUpdate(currentBulkIndex, { groupset: e.target.value })
                                  }
                                  className="rounded-md"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Wheel Size
                                </label>
                                <Input
                                  value={bulkProducts[currentBulkIndex]?.formData.wheelSize || ""}
                                  onChange={(e) =>
                                    handleBulkProductFormUpdate(currentBulkIndex, { wheelSize: e.target.value })
                                  }
                                  className="rounded-md"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Primary Colour
                                </label>
                                <Input
                                  value={bulkProducts[currentBulkIndex]?.formData.colorPrimary || ""}
                                  onChange={(e) =>
                                    handleBulkProductFormUpdate(currentBulkIndex, { colorPrimary: e.target.value })
                                  }
                                  className="rounded-md"
                                />
                              </div>
                            </div>
                          </>
                        )}

                        {/* Part-specific fields */}
                        {bulkProducts[currentBulkIndex]?.formData.itemType === "part" && (
                          <>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Part Type
                                </label>
                                <Input
                                  value={bulkProducts[currentBulkIndex]?.formData.partTypeDetail || ""}
                                  onChange={(e) =>
                                    handleBulkProductFormUpdate(currentBulkIndex, { partTypeDetail: e.target.value })
                                  }
                                  className="rounded-md"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Material
                                </label>
                                <Input
                                  value={bulkProducts[currentBulkIndex]?.formData.material || ""}
                                  onChange={(e) =>
                                    handleBulkProductFormUpdate(currentBulkIndex, { material: e.target.value })
                                  }
                                  className="rounded-md"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Compatibility Notes
                              </label>
                              <Input
                                value={bulkProducts[currentBulkIndex]?.formData.compatibilityNotes || ""}
                                onChange={(e) =>
                                  handleBulkProductFormUpdate(currentBulkIndex, { compatibilityNotes: e.target.value })
                                }
                                className="rounded-md"
                                placeholder="E.g. Shimano 11-speed compatible"
                              />
                            </div>
                          </>
                        )}

                        {/* Apparel-specific fields */}
                        {bulkProducts[currentBulkIndex]?.formData.itemType === "apparel" && (
                          <>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Size
                                </label>
                                <Input
                                  value={bulkProducts[currentBulkIndex]?.formData.size || ""}
                                  onChange={(e) =>
                                    handleBulkProductFormUpdate(currentBulkIndex, { size: e.target.value })
                                  }
                                  className="rounded-md"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Gender Fit
                                </label>
                                <Input
                                  value={bulkProducts[currentBulkIndex]?.formData.genderFit || ""}
                                  onChange={(e) =>
                                    handleBulkProductFormUpdate(currentBulkIndex, { genderFit: e.target.value })
                                  }
                                  className="rounded-md"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Material
                              </label>
                              <Input
                                value={bulkProducts[currentBulkIndex]?.formData.apparelMaterial || ""}
                                onChange={(e) =>
                                  handleBulkProductFormUpdate(currentBulkIndex, { apparelMaterial: e.target.value })
                                }
                                className="rounded-md"
                              />
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>

                    {/* Right: Images and Scheduling */}
                    <div className="space-y-6">
                      {/* Images */}
                      <Card className="bg-white rounded-md">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <ImageIcon className="h-5 w-5" />
                            Images ({bulkProducts[currentBulkIndex]?.imageUrls.length || 0})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-4 gap-2">
                            {bulkProducts[currentBulkIndex]?.imageUrls.slice(0, 8).map((url, index) => (
                              <div key={index} className="relative aspect-square">
                                <Image
                                  src={url}
                                  alt={`Photo ${index + 1}`}
                                  fill
                                  className="object-cover rounded-md"
                                />
                                {index === 0 && (
                                  <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-[#FFC72C] text-gray-900 text-xs font-bold rounded">
                                    Cover
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      {/* User Selection */}
                      <Card className="bg-white rounded-md">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <User className="h-5 w-5" />
                            Select User
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Select
                            value={bulkProducts[currentBulkIndex]?.selectedUserId || ""}
                            onValueChange={(value) =>
                              handleBulkProductUpdate(currentBulkIndex, { selectedUserId: value })
                            }
                          >
                            <SelectTrigger className="rounded-md">
                              <SelectValue placeholder="Select a user..." />
                            </SelectTrigger>
                            <SelectContent>
                              {usersLoading ? (
                                <div className="p-4 text-center">
                                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                                </div>
                              ) : (
                                users.map((user) => (
                                  <SelectItem key={user.id} value={user.id}>
                                    <div className="flex flex-col">
                                      <span>{user.name}</span>
                                      <span className="text-xs text-gray-500">
                                        {user.email}
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </CardContent>
                      </Card>

                      {/* Schedule */}
                      <Card className="bg-white rounded-md">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5" />
                            Schedule
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Date
                            </label>
                            <Input
                              type="date"
                              value={bulkProducts[currentBulkIndex]?.scheduledDate || ""}
                              onChange={(e) =>
                                handleBulkProductUpdate(currentBulkIndex, { scheduledDate: e.target.value })
                              }
                              className="rounded-md"
                              min={new Date().toISOString().split("T")[0]}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Time
                            </label>
                            <Input
                              type="time"
                              value={bulkProducts[currentBulkIndex]?.scheduledTime || "09:00"}
                              onChange={(e) =>
                                handleBulkProductUpdate(currentBulkIndex, { scheduledTime: e.target.value })
                              }
                              className="rounded-md"
                            />
                          </div>
                        </CardContent>
                      </Card>

                      {/* Error Display */}
                      {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
                          <AlertCircle className="h-4 w-4" />
                          <span className="text-sm">{error}</span>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={handleSkipBulkProduct}
                        >
                          Skip
                        </Button>
                        <Button
                          className="flex-1 bg-gray-900 hover:bg-gray-800"
                          onClick={() => handleSaveBulkProduct(currentBulkIndex)}
                          disabled={
                            isSaving ||
                            !bulkProducts[currentBulkIndex]?.selectedUserId ||
                            !bulkProducts[currentBulkIndex]?.scheduledDate
                          }
                        >
                          {isSaving ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                          )}
                          {currentBulkIndex < bulkProducts.length - 1
                            ? "Save & Next"
                            : "Save & Finish"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : stage === "scheduling" ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: Form */}
                  <Card className="bg-white rounded-md">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Edit className="h-5 w-5" />
                        Listing Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Title
                        </label>
                        <Input
                          value={formData.title}
                          onChange={(e) =>
                            setFormData({ ...formData, title: e.target.value })
                          }
                          className="rounded-md"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Brand
                          </label>
                          <Input
                            value={formData.brand}
                            onChange={(e) =>
                              setFormData({ ...formData, brand: e.target.value })
                            }
                            className="rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Model
                          </label>
                          <Input
                            value={formData.model}
                            onChange={(e) =>
                              setFormData({ ...formData, model: e.target.value })
                            }
                            className="rounded-md"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Year
                          </label>
                          <Input
                            value={formData.modelYear}
                            onChange={(e) =>
                              setFormData({ ...formData, modelYear: e.target.value })
                            }
                            className="rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Price ($)
                          </label>
                          <Input
                            type="number"
                            value={formData.price || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                price: parseInt(e.target.value) || 0,
                              })
                            }
                            className="rounded-md"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Item Type
                        </label>
                        <Select
                          value={formData.itemType}
                          onValueChange={(value) =>
                            setFormData({ ...formData, itemType: value })
                          }
                        >
                          <SelectTrigger className="rounded-md">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bike">Bike</SelectItem>
                            <SelectItem value="part">Part</SelectItem>
                            <SelectItem value="apparel">Apparel</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Condition
                        </label>
                        <Select
                          value={formData.conditionRating}
                          onValueChange={(value) =>
                            setFormData({
                              ...formData,
                              conditionRating: value as ConditionRating,
                            })
                          }
                        >
                          <SelectTrigger className="rounded-md">
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

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Product Description
                        </label>
                        <Textarea
                          value={formData.productDescription}
                          onChange={(e) =>
                            setFormData({ ...formData, productDescription: e.target.value })
                          }
                          rows={4}
                          className="rounded-md"
                          placeholder="AI-generated product description..."
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Seller Notes
                        </label>
                        <Textarea
                          value={formData.sellerNotes}
                          onChange={(e) =>
                            setFormData({ ...formData, sellerNotes: e.target.value })
                          }
                          rows={2}
                          className="rounded-md"
                          placeholder="Notes about condition, history, etc."
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Wear Notes
                          </label>
                          <Input
                            value={formData.wearNotes}
                            onChange={(e) =>
                              setFormData({ ...formData, wearNotes: e.target.value })
                            }
                            className="rounded-md"
                            placeholder="E.g. Minor scratches"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Usage Estimate
                          </label>
                          <Input
                            value={formData.usageEstimate}
                            onChange={(e) =>
                              setFormData({ ...formData, usageEstimate: e.target.value })
                            }
                            className="rounded-md"
                            placeholder="E.g. 500km"
                          />
                        </div>
                      </div>

                      {formData.itemType === "bike" && (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Bike Type
                              </label>
                              <Input
                                value={formData.bikeType}
                                onChange={(e) =>
                                  setFormData({ ...formData, bikeType: e.target.value })
                                }
                                className="rounded-md"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Frame Size
                              </label>
                              <Input
                                value={formData.frameSize}
                                onChange={(e) =>
                                  setFormData({ ...formData, frameSize: e.target.value })
                                }
                                className="rounded-md"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Frame Material
                              </label>
                              <Input
                                value={formData.frameMaterial}
                                onChange={(e) =>
                                  setFormData({ ...formData, frameMaterial: e.target.value })
                                }
                                className="rounded-md"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Groupset
                              </label>
                              <Input
                                value={formData.groupset}
                                onChange={(e) =>
                                  setFormData({ ...formData, groupset: e.target.value })
                                }
                                className="rounded-md"
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  {/* Right: Scheduling */}
                  <div className="space-y-6">
                    {/* Image Preview */}
                    <Card className="bg-white rounded-md">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <ImageIcon className="h-5 w-5" />
                          Images ({uploadedPhotos.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-4 gap-2">
                          {uploadedPhotos.slice(0, 8).map((photo, index) => (
                            <div key={photo.id} className="relative aspect-square">
                              <Image
                                src={photo.thumbnailUrl || photo.url}
                                alt={`Photo ${index + 1}`}
                                fill
                                className="object-cover rounded-md"
                              />
                              {index === 0 && (
                                <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-[#FFC72C] text-gray-900 text-xs font-bold rounded">
                                  Cover
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* User Selection */}
                    <Card className="bg-white rounded-md">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <User className="h-5 w-5" />
                          Select User
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Select
                          value={selectedUserId}
                          onValueChange={setSelectedUserId}
                        >
                          <SelectTrigger className="rounded-md">
                            <SelectValue placeholder="Select a user..." />
                          </SelectTrigger>
                          <SelectContent>
                            {usersLoading ? (
                              <div className="p-4 text-center">
                                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                              </div>
                            ) : (
                              users.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  <div className="flex flex-col">
                                    <span>{user.name}</span>
                                    <span className="text-xs text-gray-500">
                                      {user.email}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </CardContent>
                    </Card>

                    {/* Schedule Time */}
                    <Card className="bg-white rounded-md">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Calendar className="h-5 w-5" />
                          Schedule Publication
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Date
                          </label>
                          <Input
                            type="date"
                            value={scheduledDate}
                            onChange={(e) => setScheduledDate(e.target.value)}
                            min={new Date().toISOString().split("T")[0]}
                            className="rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Time
                          </label>
                          <Input
                            type="time"
                            value={scheduledTime}
                            onChange={(e) => setScheduledTime(e.target.value)}
                            className="rounded-md"
                          />
                          <p className="text-xs text-gray-500 mt-1.5">
                            Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone} (your browser timezone)
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Error Display */}
                    {error && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm">{error}</span>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={handleReset}
                        className="flex-1 rounded-md"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSaveScheduledListing}
                        disabled={isSaving || !selectedUserId || !scheduledDate}
                        className="flex-1 rounded-md"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Schedule Listing
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </motion.div>
          )}

          {activeTab === "queue" && (
            <motion.div
              key="queue"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {/* Queue Filters */}
              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
                  {["pending", "published", "cancelled", "all"].map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setQueueFilter(filter)}
                      className={cn(
                        "px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors capitalize",
                        queueFilter === filter
                          ? "text-gray-800 bg-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70"
                      )}
                    >
                      {filter}
                    </button>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchScheduledListings()}
                  className="rounded-md"
                >
                  Refresh
                </Button>
              </div>

              {/* Queue Table */}
              <Card className="bg-white rounded-md">
                <CardContent className="p-0">
                  {queueLoading ? (
                    <div className="p-12 text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                    </div>
                  ) : scheduledListings.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                      <Calendar className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                      <p>No scheduled listings found</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {scheduledListings.map((listing) => (
                        <div
                          key={listing.id}
                          className="flex items-center gap-4 p-4 hover:bg-gray-50"
                        >
                          {/* Thumbnail */}
                          <div className="relative h-16 w-16 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
                            {listing.primaryImage ? (
                              <Image
                                src={listing.primaryImage}
                                alt={listing.title}
                                fill
                                className="object-cover"
                              />
                            ) : (
                              <ImageIcon className="h-6 w-6 m-auto text-gray-300" />
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 truncate">
                              {listing.title}
                            </h4>
                            <p className="text-sm text-gray-500">
                              For: {listing.targetUser.name}
                            </p>
                            <p className="text-xs text-gray-400">
                              {new Date(listing.scheduled_for).toLocaleString("en-AU", {
                                dateStyle: "medium",
                                timeStyle: "short",
                                timeZone: "Australia/Sydney",
                              })}{" "}
                              <span className="text-gray-300">AEST/AEDT</span>
                            </p>
                          </div>

                          {/* Status Badge */}
                          <span
                            className={cn(
                              "px-2 py-1 text-xs font-medium rounded-md",
                              listing.status === "pending" &&
                                "bg-yellow-100 text-yellow-700",
                              listing.status === "published" &&
                                "bg-green-100 text-green-700",
                              listing.status === "cancelled" &&
                                "bg-gray-100 text-gray-500",
                              listing.status === "failed" && "bg-red-100 text-red-700"
                            )}
                          >
                            {listing.status}
                          </span>

                          {/* Actions */}
                          {listing.status === "pending" && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="rounded-md">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => handlePublishNow(listing.id)}
                                >
                                  <Play className="h-4 w-4 mr-2" />
                                  Publish Now
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleCancelListing(listing.id)}
                                >
                                  <X className="h-4 w-4 mr-2" />
                                  Cancel
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDeleteListing(listing.id)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

