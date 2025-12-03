"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, Loader2, CheckCircle2, Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ListingAnalysisResult } from "@/lib/ai/schemas";
import { QrUploadSection } from "./qr-upload-section";
import { compressImage, compressedToFile, shouldCompress } from "@/lib/utils/image-compression";

// ============================================================
// Smart Upload Modal - Enterprise Optimized
// Features:
// - Client-side image compression (5MB → 200KB)
// - Parallel uploads (3 concurrent)
// - Supports both computer upload and mobile QR code upload
// ============================================================

const UPLOAD_CONCURRENCY = 3;

type FlowStage = "upload" | "compressing" | "uploading" | "analyzing" | "success" | "error";
type UploadTab = "computer" | "phone";

interface SmartUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (formData: any, imageUrls: string[]) => void;
}

export function SmartUploadModal({ isOpen, onClose, onComplete }: SmartUploadModalProps) {
  const [stage, setStage] = React.useState<FlowStage>("upload");
  const [activeTab, setActiveTab] = React.useState<UploadTab>("computer");
  const [photos, setPhotos] = React.useState<{ file: File; preview: string }[]>([]);
  const [uploadedUrls, setUploadedUrls] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState({ current: 0, total: 0 });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (isOpen) {
      setStage("upload");
      setActiveTab("computer");
      setPhotos([]);
      setUploadedUrls([]);
      setError(null);
      setUploadProgress({ current: 0, total: 0 });
    }
  }, [isOpen]);

  // Cleanup preview URLs on unmount
  React.useEffect(() => {
    return () => {
      photos.forEach(p => URL.revokeObjectURL(p.preview));
    };
  }, [photos]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addPhotos(files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    addPhotos(files);
  };

  const addPhotos = (files: File[]) => {
    const newPhotos = files.slice(0, 10 - photos.length).map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setPhotos(prev => [...prev, ...newPhotos]);
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Handle photos received from QR mobile upload
  const handleQrPhotosReady = async (images: { id: string; url: string; uploadedAt: string }[]) => {
    if (images.length === 0) return;

    // Set the uploaded URLs from mobile
    const urls = images.map(img => img.url);
    setUploadedUrls(urls);
    
    // Proceed directly to AI analysis
    await runAiAnalysis(urls);
  };

  const handleAnalyze = async () => {
    if (photos.length === 0) return;

    setError(null);

    try {
      // Get Supabase session
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('You must be logged in to use AI analysis');
      }

      // Phase 1: Compress images
      setStage("compressing");
      setUploadProgress({ current: 0, total: photos.length });
      
      console.log('🗜️ [SMART UPLOAD] Compressing', photos.length, 'photos...');
      
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
          console.log(`[SMART UPLOAD] Compressed: ${(photo.file.size / 1024).toFixed(0)}KB → ${(fileToUpload.size / 1024).toFixed(0)}KB`);
        } else {
          fileToUpload = photo.file;
        }
        
        compressedFiles.push(fileToUpload);
        setUploadProgress({ current: i + 1, total: photos.length });
      }

      // Phase 2: Upload to Cloudinary via Edge Function (ultra-fast CDN)
      setStage("uploading");
      setUploadProgress({ current: 0, total: compressedFiles.length });
      
      console.log('📤 [SMART UPLOAD] Uploading to Cloudinary...');
      
      const uploadedImages: Array<{ url: string; cardUrl: string; thumbnailUrl: string }> = [];
      const listingId = `smart-${Date.now()}`;
      
      for (let i = 0; i < compressedFiles.length; i += UPLOAD_CONCURRENCY) {
        const batch = compressedFiles.slice(i, i + UPLOAD_CONCURRENCY);
        
        const batchResults = await Promise.all(
          batch.map(async (file, batchIndex) => {
            const globalIndex = i + batchIndex;
            
            // Upload to Cloudinary via Edge Function
            const formData = new FormData();
            formData.append('file', file);
            formData.append('listingId', listingId);
            formData.append('index', globalIndex.toString());
            
            const response = await fetch(
              `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/upload-to-cloudinary`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                },
                body: formData,
              }
            );
            
            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || 'Upload failed');
            }
            
            const result = await response.json();
            console.log(`✅ [SMART UPLOAD] Image ${globalIndex + 1} uploaded to Cloudinary`);
            return {
              url: result.data.url,
              cardUrl: result.data.cardUrl,
              thumbnailUrl: result.data.thumbnailUrl,
            };
          })
        );
        
        uploadedImages.push(...batchResults);
        setUploadProgress({ current: Math.min(i + UPLOAD_CONCURRENCY, compressedFiles.length), total: compressedFiles.length });
      }

      console.log('✅ [SMART UPLOAD] All photos uploaded to Cloudinary');
      const urls = uploadedImages.map(img => img.url);
      setUploadedUrls(urls);
      await runAiAnalysis(urls, uploadedImages);

    } catch (err: any) {
      console.error('❌ [SMART UPLOAD MODAL] Error:', err);
      setError(err.message || "Failed to upload photos");
      setStage("error");
    }
  };

  const runAiAnalysis = async (
    urls: string[], 
    uploadedImages?: Array<{ url: string; cardUrl: string; thumbnailUrl: string }>
  ) => {
    setStage("analyzing");

    try {
      // Get Supabase session
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('You must be logged in to use AI analysis');
      }

      console.log('🤖 [SMART UPLOAD MODAL] Starting AI analysis...');

      // Call AI analysis
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analyze-listing-ai`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            imageUrls: urls,
            userHints: {},
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "AI analysis failed");
      }

      const result = await response.json();
      console.log('✅ [SMART UPLOAD MODAL] Analysis received:', result);

      const analysis = result.analysis as ListingAnalysisResult;

      // Map analysis to form data
      // Generate title from brand + model
      const generatedTitle = [analysis.brand, analysis.model].filter(Boolean).join(' ');
      
      const formData: any = {
        itemType: analysis.item_type,
        title: generatedTitle || undefined,
        brand: analysis.brand,
        model: analysis.model,
        modelYear: analysis.model_year,
        conditionRating: analysis.condition_rating,
        conditionDetails: analysis.condition_details,
        wearNotes: analysis.wear_notes,
        usageEstimate: analysis.usage_estimate,
        price: analysis.price_estimate 
          ? Math.round((analysis.price_estimate.min_aud + analysis.price_estimate.max_aud) / 2)
          : undefined,
      };

      // Add bike-specific fields
      if (analysis.item_type === 'bike' && analysis.bike_details) {
        formData.bikeType = analysis.bike_details.bike_type;
        formData.frameSize = analysis.bike_details.frame_size;
        formData.frameMaterial = analysis.bike_details.frame_material;
        formData.groupset = analysis.bike_details.groupset;
        formData.wheelSize = analysis.bike_details.wheel_size;
        formData.suspensionType = analysis.bike_details.suspension_type;
        formData.colorPrimary = analysis.bike_details.color_primary;
        formData.colorSecondary = analysis.bike_details.color_secondary;
        formData.bikeWeight = analysis.bike_details.approximate_weight;
      }

      // Add part-specific fields
      if (analysis.item_type === 'part' && analysis.part_details) {
        formData.marketplace_subcategory = analysis.part_details.category;
        formData.partTypeDetail = analysis.part_details.part_type;
        formData.compatibilityNotes = analysis.part_details.compatibility;
        formData.material = analysis.part_details.material;
        formData.weight = analysis.part_details.weight;
      }

      // Add apparel-specific fields
      if (analysis.item_type === 'apparel' && analysis.apparel_details) {
        formData.marketplace_subcategory = analysis.apparel_details.category;
        formData.size = analysis.apparel_details.size;
        formData.genderFit = analysis.apparel_details.gender_fit;
        formData.apparelMaterial = analysis.apparel_details.material;
      }

      // Add images to form data with variants (for instant loading)
      formData.images = urls.map((url, index) => ({
        id: `ai-${index}`,
        url,
        cardUrl: uploadedImages?.[index]?.cardUrl,
        thumbnailUrl: uploadedImages?.[index]?.thumbnailUrl,
        order: index,
        isPrimary: index === 0,
      }));
      
      // Set the primary image URL explicitly (use cardUrl for faster loading)
      formData.primaryImageUrl = uploadedImages?.[0]?.cardUrl || urls[0];

      setStage("success");

      // Brief success state then complete
      setTimeout(() => {
        onComplete(formData, urls);
        onClose();
      }, 800);

    } catch (err: any) {
      console.error('❌ [SMART UPLOAD MODAL] Error:', err);
      setError(err.message || "Failed to analyze photos");
      setStage("error");
    }
  };

  const handleRetry = () => {
    setStage("upload");
    setError(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px] rounded-md animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">
            Smart Upload
          </DialogTitle>
          <DialogDescription className="text-sm">
            AI will detect product details from your photos
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          <AnimatePresence mode="wait">
            {/* Upload Stage */}
            {stage === "upload" && (
              <motion.div
                key="upload"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                {/* Tab Switcher */}
                <div className="flex bg-gray-100 p-0.5 rounded-md">
                  <button
                    onClick={() => setActiveTab("computer")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-sm font-medium rounded-md transition-colors",
                      activeTab === "computer"
                        ? "bg-white text-gray-800 shadow-sm"
                        : "text-gray-600 hover:bg-gray-200/70"
                    )}
                  >
                    <Monitor className="h-3.5 w-3.5" />
                    Computer
                  </button>
                  <button
                    onClick={() => setActiveTab("phone")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-sm font-medium rounded-md transition-colors",
                      activeTab === "phone"
                        ? "bg-white text-gray-800 shadow-sm"
                        : "text-gray-600 hover:bg-gray-200/70"
                    )}
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    Phone
                  </button>
                </div>

                {/* Computer Upload Tab */}
                {activeTab === "computer" && (
                  <div className="space-y-3">
                    {/* Drop Zone */}
                    <div
                      onDrop={handleDrop}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => fileInputRef.current?.click()}
                      className="border border-dashed border-gray-300 rounded-md p-5 text-center cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <Upload className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">
                        Drop photos or click to upload
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Up to 10 photos
                      </p>
                    </div>

                    {/* Photo Previews */}
                    {photos.length > 0 && (
                      <div className="grid grid-cols-5 gap-1.5">
                        {photos.map((photo, index) => (
                          <div key={index} className="relative aspect-square rounded-md overflow-hidden border border-gray-200 group">
                            <img
                              src={photo.preview}
                              alt={`Photo ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removePhoto(index);
                              }}
                              className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3 text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        className="text-gray-500"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAnalyze}
                        disabled={photos.length === 0}
                        size="sm"
                        className="rounded-md bg-gray-900 hover:bg-gray-800 text-white"
                      >
                        Analyse
                      </Button>
                    </div>
                  </div>
                )}

                {/* Phone QR Upload Tab */}
                {activeTab === "phone" && (
                  <QrUploadSection
                    onPhotosReady={handleQrPhotosReady}
                    onCancel={() => setActiveTab("computer")}
                  />
                )}
              </motion.div>
            )}

            {/* Compressing Stage */}
            {stage === "compressing" && (
              <motion.div
                key="compressing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-12"
              >
                <Loader2 className="h-6 w-6 animate-spin text-gray-400 mb-3" />
                <p className="text-gray-600 text-sm">
                  Optimising {uploadProgress.current}/{uploadProgress.total}...
                </p>
              </motion.div>
            )}

            {/* Uploading Stage */}
            {stage === "uploading" && (
              <motion.div
                key="uploading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-12"
              >
                <Loader2 className="h-6 w-6 animate-spin text-gray-400 mb-3" />
                <p className="text-gray-600 text-sm">
                  Uploading {uploadProgress.current}/{uploadProgress.total}...
                </p>
              </motion.div>
            )}

            {/* Analyzing Stage */}
            {stage === "analyzing" && (
              <motion.div
                key="analyzing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-12"
              >
                <Loader2 className="h-6 w-6 animate-spin text-gray-400 mb-3" />
                <p className="text-gray-600 text-sm">Analysing photos...</p>
              </motion.div>
            )}

            {/* Success Stage */}
            {stage === "success" && (
              <motion.div
                key="success"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-12"
              >
                <CheckCircle2 className="h-6 w-6 text-green-500 mb-3" />
                <p className="text-gray-600 text-sm">Done!</p>
              </motion.div>
            )}

            {/* Error Stage */}
            {stage === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-12"
              >
                <X className="h-6 w-6 text-red-500 mb-3" />
                <p className="text-gray-600 text-sm mb-1">Something went wrong</p>
                <p className="text-gray-400 text-xs mb-4">{error}</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="text-gray-500"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleRetry}
                    className="rounded-md"
                  >
                    Retry
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
