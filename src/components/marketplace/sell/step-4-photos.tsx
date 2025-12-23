"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, Image as ImageIcon, GripVertical, CheckCircle2 } from "lucide-react";
import { PhotosFormData, ListingImage } from "@/lib/types/listing";
import { SectionHeader, InfoBox } from "./form-elements";
import { ValidationError, getFieldError } from "@/lib/validation/listing-validation";
import { cn } from "@/lib/utils";
import { compressImage, compressedToFile, shouldCompress } from "@/lib/utils/image-compression";

// ============================================================
// Step 4: Photo Upload
// Includes client-side compression for faster uploads & loading
// ============================================================

interface Step4PhotosProps {
  data: PhotosFormData;
  onChange: (data: PhotosFormData) => void;
  errors?: ValidationError[];
  itemType?: string;
}

export function Step4Photos({ data, onChange, errors = [], itemType = "bike" }: Step4PhotosProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const currentCount = data.images.length;
    const remaining = 15 - currentCount;

    if (remaining <= 0) {
      alert("Maximum 15 photos allowed");
      return;
    }

    const filesToAdd = Array.from(files).slice(0, remaining);

    // Validate file types and sizes
    const validFiles = filesToAdd.filter((file) => {
      if (!file.type.startsWith("image/")) {
        alert(`${file.name} is not an image file`);
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert(`${file.name} is larger than 10MB`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    setUploading(true);

    try {
      // Compress and upload each file with progress tracking
      const uploadedImages: ListingImage[] = [];
      const total = validFiles.length;

      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        setUploadProgress(Math.round(((i + 1) / total) * 100));

        // Compress image before upload (1200px max, 0.8 quality = ~80% reduction)
        let fileToUpload: File = file;
        if (shouldCompress(file)) {
          try {
            const compressed = await compressImage(file, {
              maxDimension: 1200, // Optimal for web display
              quality: 0.8,
            });
            fileToUpload = compressedToFile(compressed, file.name);
            console.log(`[Upload] Compressed ${file.name}: ${(file.size / 1024).toFixed(0)}KB → ${(fileToUpload.size / 1024).toFixed(0)}KB`);
          } catch (err) {
            console.warn(`[Upload] Compression failed for ${file.name}, using original`);
          }
        }

        // Get session for auth
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          throw new Error("Not authenticated");
        }

        // Upload to Cloudinary via Edge Function
        const formData = new FormData();
        formData.append("file", fileToUpload);
        formData.append("listingId", "manual-" + Date.now());
        formData.append("index", i.toString());

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/upload-to-cloudinary`,
          {
            method: "POST",
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: formData,
          }
        );

        if (!response.ok) {
          const error = await response.json();
          console.error(`Failed to upload ${file.name}:`, error);
          continue; // Skip failed uploads
        }

        const result = await response.json();
        console.log(`✅ [MANUAL UPLOAD] Image uploaded to Cloudinary`);
        
        // Include variant URLs for instant loading
        uploadedImages.push({
          id: result.data.id,
          url: result.data.url,
          cardUrl: result.data.cardUrl,
          thumbnailUrl: result.data.thumbnailUrl,
          order: currentCount + i,
          isPrimary: currentCount === 0 && i === 0,
        });
      }

      onChange({
        ...data,
        images: [...data.images, ...uploadedImages],
        primaryImageUrl: data.primaryImageUrl || uploadedImages[0]?.url,
      });
    } catch (error) {
      console.error("Error uploading images:", error);
      alert("Failed to upload some images. Please try again.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const removeImage = (id: string) => {
    const filtered = data.images.filter((img) => img.id !== id);
    const reordered = filtered.map((img, index) => ({ ...img, order: index }));

    // If removed image was primary, set first image as primary
    const removedWasPrimary = data.images.find((img) => img.id === id)?.isPrimary;
    if (removedWasPrimary && reordered.length > 0) {
      reordered[0].isPrimary = true;
      const primary = reordered[0];
      onChange({
        images: reordered,
        primaryImageUrl: primary.cardUrl || primary.url,
      });
    } else {
      const primary = reordered.find((img) => img.isPrimary);
      onChange({
        images: reordered,
        primaryImageUrl: primary?.cardUrl || primary?.url,
      });
    }
  };

  const setPrimaryImage = (id: string) => {
    // Find the image to make primary
    const primaryIndex = data.images.findIndex((img) => img.id === id);
    if (primaryIndex === -1) return;
    
    // Reorder array: move primary to front, update order fields
    const primaryImage = data.images[primaryIndex];
    const otherImages = data.images.filter((_, i) => i !== primaryIndex);
    const reordered = [primaryImage, ...otherImages].map((img, index) => ({
      ...img,
      order: index,
      isPrimary: index === 0,
    }));
    
    const primary = reordered[0];
    onChange({
      images: reordered,
      // Use cardUrl for faster loading, fallback to url
      primaryImageUrl: primary?.cardUrl || primary?.url,
    });
  };

  const photoGuidelines = {
    bike: [
      "Full drive side view (showing chain and gears)",
      "Full non-drive side view",
      "Cockpit/handlebar view",
      "Drivetrain close-up",
      "Any damage, wear, or unique features",
    ],
    part: [
      "Multiple angles showing all sides",
      "Brand/model markings clearly visible",
      "Mounting points or attachment areas",
      "Any wear or damage areas",
      "Size or specification labels",
    ],
    apparel: [
      "Front view laid flat or on hanger",
      "Back view",
      "Brand and size tags/labels",
      "Any wear, stains, or damage",
      "Close-up of special features",
    ],
  };

  const guidelines = photoGuidelines[itemType as keyof typeof photoGuidelines] || photoGuidelines.bike;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Add Photos</h2>
        <p className="text-gray-600">
          Great photos sell faster - add at least 3, up to 15 images
        </p>
      </div>

      {/* Photo Guidelines */}
      <InfoBox>
        <div className="space-y-2">
          <p className="font-semibold">📸 Photo tips for best results:</p>
          <ul className="space-y-1 text-sm">
            {guidelines.map((guideline, index) => (
              <li key={index} className="flex gap-2">
                <span className="text-gray-400">•</span>
                {guideline}
              </li>
            ))}
          </ul>
        </div>
      </InfoBox>

      {/* Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 transition-colors",
          isDragging
            ? "border-gray-900 bg-gray-50"
            : "border-gray-300 bg-white hover:border-gray-400"
        )}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <Upload className="h-8 w-8 text-gray-600" />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900">
              Drop photos here or click to browse
            </h3>
            <p className="text-sm text-gray-600">
              JPG, PNG, or WebP • Max 10MB per image • {15 - data.images.length} remaining
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || data.images.length >= 15}
            className="px-6 py-2 bg-gray-900 text-white font-medium rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? `Uploading... ${uploadProgress}%` : "Choose Files"}
          </button>
          {uploading && (
            <div className="w-full max-w-xs h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gray-900 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
          />
        </div>
      </div>

      {/* Error Display */}
      {getFieldError(errors, "images") && (
        <p className="text-sm text-red-600 text-center">{getFieldError(errors, "images")}</p>
      )}

      {/* Image Grid */}
      {data.images.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              Your Photos ({data.images.length}/15)
            </h3>
            <p className="text-xs text-gray-600">Click an image to set as primary</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <AnimatePresence>
              {data.images.map((image) => (
                <motion.div
                  key={image.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative group aspect-square"
                >
                  <button
                    type="button"
                    onClick={() => setPrimaryImage(image.id)}
                    className={cn(
                      "w-full h-full rounded-md overflow-hidden border-2 transition-all",
                      image.isPrimary
                        ? "border-gray-900 ring-2 ring-gray-900 ring-offset-2"
                        : "border-gray-200 hover:border-gray-400"
                    )}
                  >
                    <img
                      src={image.url}
                      alt={`Photo ${image.order + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>

                  {/* Primary Badge */}
                  {image.isPrimary && (
                    <div className="absolute top-2 left-2 px-2 py-1 bg-gray-900 text-white text-xs font-medium rounded-md flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Primary
                    </div>
                  )}

                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(image.id);
                    }}
                    className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                  >
                    <X className="h-4 w-4 text-red-600" />
                  </button>

                  {/* Order Number */}
                  <div className="absolute bottom-2 right-2 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center text-xs font-medium text-gray-900">
                    {image.order + 1}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <p className="text-xs text-gray-600 text-center">
            The primary photo (marked with a badge) will be the main image shown in search
            results
          </p>
        </div>
      )}

      {/* No Photos State */}
      {data.images.length === 0 && (
        <div className="text-center py-8">
          <ImageIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">No photos added yet</p>
          <p className="text-sm text-gray-500">Add at least 3 photos to continue</p>
        </div>
      )}
    </div>
  );
}

