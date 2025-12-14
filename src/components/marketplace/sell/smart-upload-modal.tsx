"use client";

import * as React from "react";
import { Upload, X, Loader2, CheckCircle2, Monitor, Smartphone, Camera, ImageIcon, Plus } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
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
// - Native mobile bottom sheet design
// ============================================================

const UPLOAD_CONCURRENCY = 3;

type FlowStage = "upload" | "compressing" | "uploading" | "analyzing" | "searching" | "success" | "error";
type UploadTab = "computer" | "phone";

interface SmartUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (formData: any, imageUrls: string[]) => void;
}

export function SmartUploadModal({ isOpen, onClose, onComplete }: SmartUploadModalProps) {
  const [stage, setStage] = React.useState<FlowStage>("upload");
  const [activeTab, setActiveTab] = React.useState<UploadTab>("computer");
  const [photos, setPhotos] = React.useState<{ id: string; file: File; preview: string }[]>([]);
  const [uploadedUrls, setUploadedUrls] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState({ current: 0, total: 0 });
  const [isMobile, setIsMobile] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);

  // Detect if on mobile
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Prevent body scroll when modal is open on mobile
  React.useEffect(() => {
    if (isOpen && isMobile) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, isMobile]);

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

  // Track blob URLs for cleanup on unmount only
  const blobUrlsRef = React.useRef<Set<string>>(new Set());
  
  // Cleanup preview URLs on unmount only
  React.useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      blobUrlsRef.current.clear();
    };
  }, []); // Empty deps - only run cleanup on unmount

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
    const newPhotos = files.slice(0, 10 - photos.length).map(file => {
      const preview = URL.createObjectURL(file);
      blobUrlsRef.current.add(preview); // Track for cleanup
      return {
        id: crypto.randomUUID(), // Unique ID for stable React keys
        file,
        preview,
      };
    });
    setPhotos(prev => [...prev, ...newPhotos]);
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => {
      const url = prev[index].preview;
      URL.revokeObjectURL(url);
      blobUrlsRef.current.delete(url); // Remove from tracking
      return prev.filter((_, i) => i !== index);
    });
  };

  const setPrimaryPhoto = (index: number) => {
    if (index === 0) return; // Already primary
    console.log('🖼️ [SMART UPLOAD MODAL] Setting primary photo to index:', index);
    setPhotos(prev => {
      const newPhotos = [...prev];
      const [primaryPhoto] = newPhotos.splice(index, 1);
      console.log('🖼️ [SMART UPLOAD MODAL] Reordered photos - new first photo:', primaryPhoto.file.name);
      return [primaryPhoto, ...newPhotos];
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

    console.log('🚀 [SMART UPLOAD] handleAnalyze called');
    console.log('🖼️ [SMART UPLOAD] Photos at start of handleAnalyze:', photos.map((p, i) => `${i}: ${p.file.name} (id: ${p.id})`));
    
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
      console.log('🖼️ [SMART UPLOAD] Photos order for compression:', photos.map((p, i) => `${i}: ${p.file.name}`));
      
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
            console.log(`🖼️ [SMART UPLOAD] Image ${globalIndex}: url=${result.data.url?.substring(0, 80)}...`);
            console.log(`🖼️ [SMART UPLOAD] Image ${globalIndex}: cardUrl=${result.data.cardUrl?.substring(0, 80)}...`);
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
        console.log(`🖼️ [SMART UPLOAD] Batch complete. uploadedImages order:`, uploadedImages.map((img, idx) => `${idx}: ${img.cardUrl?.substring(70, 100)}`));
        setUploadProgress({ current: Math.min(i + UPLOAD_CONCURRENCY, compressedFiles.length), total: compressedFiles.length });
      }

      console.log('✅ [SMART UPLOAD] All photos uploaded to Cloudinary');
      console.log('🖼️ [SMART UPLOAD] Final uploadedImages[0] cardUrl:', uploadedImages[0]?.cardUrl);
      console.log('🖼️ [SMART UPLOAD] Final uploadedImages[1] cardUrl:', uploadedImages[1]?.cardUrl);
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
      console.log('🔍 [SMART UPLOAD MODAL] Item type:', result.analysis?.item_type);
      console.log('🚴 [SMART UPLOAD MODAL] Bike details from AI:', result.analysis?.bike_details);
      console.log('🔍 [SMART UPLOAD MODAL] Web enrichment data:', result.analysis?.web_enrichment);
      console.log('🔍 [SMART UPLOAD MODAL] Search URLs:', result.analysis?.search_urls);
      console.log('🔍 [SMART UPLOAD MODAL] Data sources:', result.analysis?.data_sources);
      console.log('🔍 [SMART UPLOAD MODAL] Meta info:', result.meta);

      const analysis = result.analysis as ListingAnalysisResult;

      // Map analysis to form data
      // Generate title from brand + model
      const generatedTitle = [analysis.brand, analysis.model].filter(Boolean).join(' ');
      
      console.log('📝 [SMART UPLOAD MODAL] analysis.description:', analysis.description);
      console.log('📝 [SMART UPLOAD MODAL] analysis.description LENGTH:', analysis.description?.length);
      console.log('📝 [SMART UPLOAD MODAL] analysis.seller_notes:', analysis.seller_notes);
      console.log('📝 [SMART UPLOAD MODAL] analysis.condition_details:', analysis.condition_details);
      
      const formData: any = {
        itemType: analysis.item_type,
        title: generatedTitle || undefined,
        brand: analysis.brand,
        model: analysis.model,
        modelYear: analysis.model_year,
        conditionRating: analysis.condition_rating,
        // description is the product description (from web search or fallback)
        description: analysis.description,
        // sellerNotes is the seller's personal notes about condition
        sellerNotes: analysis.seller_notes,
        // Keep conditionDetails for backwards compat (use description)
        conditionDetails: analysis.description,
        wearNotes: analysis.wear_notes,
        usageEstimate: analysis.usage_estimate,
        price: analysis.price_estimate 
          ? Math.round((analysis.price_estimate.min_aud + analysis.price_estimate.max_aud) / 2)
          : undefined,
      };

      // Helper function to clean AI-generated text
      const cleanAiText = (text: string | undefined | null): string | undefined => {
        if (!text) return undefined;
        
        // Remove uncertainty phrases and clean up
        let cleaned = text
          .replace(/^(maybe|possibly|likely|probably|perhaps|approximately|about|around)\s+/gi, '')
          .replace(/\s+(or so|ish|roughly)\s*$/gi, '')
          .replace(/\s+or\s+/gi, '/') // Convert "Small or Medium" to "Small/Medium"
          .trim();
        
        // Capitalize first letter of each word (for materials, colors, etc.)
        cleaned = cleaned
          .split(' ')
          .map(word => {
            // Handle hyphenated words and slashes
            if (word.includes('-') || word.includes('/')) {
              return word.split(/[-/]/).map(part => 
                part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
              ).join(word.includes('-') ? '-' : '/');
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          })
          .join(' ');
        
        return cleaned || undefined;
      };

      // Add bike-specific fields
      if (analysis.item_type === 'bike') {
        console.log('🚴 [SMART UPLOAD MODAL] Processing bike details...');
        console.log('🚴 [SMART UPLOAD MODAL] analysis.bike_details exists:', !!analysis.bike_details);
        
        if (analysis.bike_details) {
          formData.bikeType = cleanAiText(analysis.bike_details.bike_type);
          formData.frameSize = cleanAiText(analysis.bike_details.frame_size);
          formData.frameMaterial = cleanAiText(analysis.bike_details.frame_material);
          formData.groupset = cleanAiText(analysis.bike_details.groupset);
          formData.wheelSize = cleanAiText(analysis.bike_details.wheel_size);
          formData.suspensionType = cleanAiText(analysis.bike_details.suspension_type);
          formData.colorPrimary = cleanAiText(analysis.bike_details.color_primary);
          formData.colorSecondary = cleanAiText(analysis.bike_details.color_secondary);
          formData.bikeWeight = cleanAiText(analysis.bike_details.approximate_weight);
          
          console.log('🚴 [SMART UPLOAD MODAL] Mapped bike fields:', {
            bikeType: formData.bikeType,
            frameSize: formData.frameSize,
            frameMaterial: formData.frameMaterial,
            groupset: formData.groupset,
            wheelSize: formData.wheelSize,
            colorPrimary: formData.colorPrimary,
          });
        } else {
          console.warn('⚠️ [SMART UPLOAD MODAL] No bike_details in analysis response!');
        }
      }

      // Add part-specific fields
      if (analysis.item_type === 'part' && analysis.part_details) {
        formData.marketplace_subcategory = analysis.part_details.category;
        formData.partTypeDetail = cleanAiText(analysis.part_details.part_type);
        formData.compatibilityNotes = analysis.part_details.compatibility;
        formData.material = cleanAiText(analysis.part_details.material);
        formData.weight = cleanAiText(analysis.part_details.weight);
      }

      // Add apparel-specific fields
      if (analysis.item_type === 'apparel' && analysis.apparel_details) {
        formData.marketplace_subcategory = analysis.apparel_details.category;
        formData.size = cleanAiText(analysis.apparel_details.size);
        formData.genderFit = cleanAiText(analysis.apparel_details.gender_fit);
        formData.apparelMaterial = cleanAiText(analysis.apparel_details.material);
      }

      // Add smart upload metadata (for database JSONB storage)
      if (analysis.structured_metadata) {
        formData.structuredMetadata = analysis.structured_metadata;
      }

      // Add web search sources
      if (analysis.search_urls) {
        formData.searchUrls = analysis.search_urls;
      }

      // Add AI confidence scores
      if (analysis.field_confidence) {
        formData.fieldConfidence = analysis.field_confidence;
      }

      // Add images to form data with variants (for instant loading)
      console.log('🖼️ [SMART UPLOAD MODAL] uploadedImages:', uploadedImages);
      console.log('🖼️ [SMART UPLOAD MODAL] urls:', urls);
      
      formData.images = urls.map((url, index) => ({
        id: `ai-${index}`,
        url,
        cardUrl: uploadedImages?.[index]?.cardUrl,
        thumbnailUrl: uploadedImages?.[index]?.thumbnailUrl,
        order: index,
        isPrimary: index === 0,
      }));
      
      console.log('🖼️ [SMART UPLOAD MODAL] formData.images with cardUrls:', formData.images?.map((img: any, i: number) => ({
        index: i,
        isPrimary: img.isPrimary,
        cardUrl: img.cardUrl?.substring(70, 110),
      })));
      
      // Set the primary image URL explicitly (use cardUrl for faster loading)
      formData.primaryImageUrl = uploadedImages?.[0]?.cardUrl || urls[0];
      console.log('🖼️ [SMART UPLOAD MODAL] primaryImageUrl set to:', formData.primaryImageUrl);

      console.log('🎯 [SMART UPLOAD MODAL] Final formData being sent:', formData);
      console.log('🎯 [SMART UPLOAD MODAL] Final formData bike fields:', {
        bikeType: formData.bikeType,
        frameSize: formData.frameSize,
        frameMaterial: formData.frameMaterial,
        groupset: formData.groupset,
        wheelSize: formData.wheelSize,
      });
      console.log('🖼️ [SMART UPLOAD MODAL] primaryImageUrl:', formData.primaryImageUrl);
      console.log('🖼️ [SMART UPLOAD MODAL] images array:', formData.images);
      console.log('🖼️ [SMART UPLOAD MODAL] First image URL:', formData.images?.[0]?.url);

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

  // Mobile Bottom Sheet Render
  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && (stage === "upload" || stage === "error") && onClose()}>
        <SheetContent 
          side="bottom" 
          className="rounded-t-2xl p-0 overflow-hidden gap-0 max-h-[90vh] flex flex-col"
          showCloseButton={false}
        >
          {/* Handle Bar */}
          <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          {/* Upload Stage */}
          {stage === "upload" && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Header */}
              <div className="px-5 pb-3 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Quick Upload</h2>
                    <p className="text-xs text-gray-500">AI will detect product details</p>
                  </div>
                </div>
              </div>
              
              {/* Photo Grid - Scrollable */}
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                {photos.length === 0 ? (
                  /* Empty state - upload buttons */
                  <div className="space-y-3">
                    {/* Camera - Primary action */}
                    <button
                      onClick={() => cameraInputRef.current?.click()}
                      className="w-full active:scale-[0.98] transition-transform"
                    >
                      <div className="bg-white border border-gray-300 rounded-xl p-5 flex items-center gap-4">
                        <div className="h-14 w-14 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <Camera className="h-7 w-7 text-gray-700" />
                        </div>
                        <div className="flex-1 text-left">
                          <h3 className="text-base font-semibold text-gray-900">Take Photos</h3>
                          <p className="text-xs text-gray-500 mt-0.5">Best for items nearby</p>
                        </div>
                      </div>
                    </button>
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileSelect}
                      className="hidden"
                    />

                    {/* Gallery - Secondary action */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full active:scale-[0.98] transition-transform"
                    >
                      <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4 active:bg-gray-50">
                        <div className="h-14 w-14 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <ImageIcon className="h-7 w-7 text-gray-600" />
                        </div>
                        <div className="flex-1 text-left">
                          <h3 className="text-base font-semibold text-gray-900">Choose from Gallery</h3>
                          <p className="text-xs text-gray-500 mt-0.5">Select existing photos</p>
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
                      Add up to 10 photos for best results
                    </p>
                  </div>
                ) : (
                  /* Photo previews */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-700">{photos.length} photo{photos.length !== 1 ? 's' : ''} selected</p>
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
                    
                    <p className="text-xs text-gray-500">Tap a photo to set as cover image</p>
                    
                    <div className="grid grid-cols-3 gap-2">
                      {photos.map((photo, index) => (
                        <button
                          key={photo.id}
                          onClick={() => setPrimaryPhoto(index)}
                          className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 active:scale-95 transition-transform"
                        >
                          <img
                            src={photo.preview}
                            alt={`Photo ${index + 1}`}
                            className={cn(
                              "w-full h-full object-cover",
                              index === 0 && "ring-2 ring-[#FFC72C] ring-inset"
                            )}
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removePhoto(index);
                            }}
                            className="absolute top-1.5 right-1.5 h-6 w-6 bg-black/60 rounded-full flex items-center justify-center z-10"
                          >
                            <X className="h-3.5 w-3.5 text-white" />
                          </button>
                          {index === 0 && (
                            <div className="absolute bottom-1.5 left-1.5 bg-[#FFC72C] px-2 py-0.5 rounded text-[10px] text-gray-900 font-bold">
                              COVER
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Actions - Fixed */}
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
                    onClick={handleAnalyze}
                    disabled={photos.length === 0}
                    className="flex-1 h-12 rounded-xl bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-semibold disabled:opacity-40"
                  >
                    Continue
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Processing States */}
          {(stage === "compressing" || stage === "uploading" || stage === "analyzing" || stage === "searching") && (
            <div className="px-5 py-12 flex flex-col items-center">
              {/* Animated progress indicator */}
              <div className="relative mb-6">
                <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
                  <img 
                    src="/icons/noun-fast-4767027.svg" 
                    alt="Processing" 
                    className="w-7 h-7"
                  />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-gray-900 animate-spin" />
              </div>
              
              <p className="text-base font-medium text-gray-900 mb-1">
                {stage === "compressing" && "Optimising photos..."}
                {stage === "uploading" && "Uploading photos..."}
                {stage === "analyzing" && "Yellow Jersey is analysing..."}
                {stage === "searching" && "Finding details..."}
              </p>
              <p className="text-sm text-gray-500">
                {(stage === "compressing" || stage === "uploading") && (
                  `${uploadProgress.current} of ${uploadProgress.total}`
                )}
                {stage === "analyzing" && "This won't take long"}
                {stage === "searching" && "Almost done"}
              </p>
              
              {/* Progress bar for upload stages */}
              {(stage === "compressing" || stage === "uploading") && uploadProgress.total > 0 && (
                <div className="w-48 h-1.5 bg-gray-200 rounded-full mt-4 overflow-hidden">
                  <div
                    className="h-full bg-[#FFC72C] rounded-full transition-all duration-300"
                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Success Stage */}
          {stage === "success" && (
            <div className="px-5 py-12 flex flex-col items-center">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-base font-medium text-gray-900">All done!</p>
              <p className="text-sm text-gray-500 mt-1">Preparing your listing...</p>
            </div>
          )}

          {/* Error Stage */}
          {stage === "error" && (
            <div className="px-5 py-8 flex flex-col items-center">
              <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <X className="h-8 w-8 text-red-600" />
              </div>
              <p className="text-base font-medium text-gray-900 mb-1">Something went wrong</p>
              <p className="text-sm text-gray-500 text-center mb-6 max-w-[240px]">{error}</p>
              
              <div className="flex gap-3 w-full max-w-xs">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 h-12 rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleRetry}
                  className="flex-1 h-12 rounded-xl bg-gray-900 hover:bg-gray-800"
                >
                  Try Again
                </Button>
              </div>
            </div>
          )}
          
          {/* Safe area padding for iOS */}
          <div className="h-safe-area-inset-bottom flex-shrink-0" />
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop Dialog Render
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px] rounded-md animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">
            Quick Upload
          </DialogTitle>
          <DialogDescription className="text-sm">
            Yellow Jersey will detect product details from your photos
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          {/* Upload Stage */}
          {stage === "upload" && (
            <div className="space-y-3">
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
                  {/* Desktop: Drop Zone */}
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
                    <Upload className="text-gray-400 mx-auto mb-2 h-6 w-6" />
                    <p className="text-sm text-gray-600">
                      Drop photos or click to upload
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Up to 10 photos
                    </p>
                  </div>

                  {/* Photo Previews */}
                  {photos.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">Click a photo to set as cover image</p>
                      <div className="grid grid-cols-5 gap-1.5">
                        {photos.map((photo, index) => (
                          <button
                            key={photo.id}
                            onClick={() => setPrimaryPhoto(index)}
                            className="relative aspect-square rounded-md overflow-hidden border border-gray-200 group hover:scale-105 transition-transform"
                          >
                            <img
                              src={photo.preview}
                              alt={`Photo ${index + 1}`}
                              className={cn(
                                "w-full h-full object-cover",
                                index === 0 && "ring-2 ring-[#FFC72C] ring-inset"
                              )}
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removePhoto(index);
                              }}
                              className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            >
                              <X className="h-3 w-3 text-white" />
                            </button>
                            {index === 0 && (
                              <div className="absolute bottom-0.5 left-0.5 bg-[#FFC72C] px-1.5 py-0.5 rounded text-[9px] text-gray-900 font-bold">
                                COVER
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1 justify-end">
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
                      Upload
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
            </div>
          )}

          {/* Compressing Stage */}
          {stage === "compressing" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400 mb-3" />
              <p className="text-sm text-gray-600">
                Optimising {uploadProgress.current}/{uploadProgress.total}...
              </p>
            </div>
          )}

          {/* Uploading Stage */}
          {stage === "uploading" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400 mb-3" />
              <p className="text-sm text-gray-600">
                Uploading {uploadProgress.current}/{uploadProgress.total}...
              </p>
            </div>
          )}

          {/* Analyzing Stage */}
          {stage === "analyzing" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400 mb-3" />
              <p className="text-sm text-gray-600">Analysing photos...</p>
            </div>
          )}

          {/* Searching Web Stage */}
          {stage === "searching" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400 mb-3" />
              <p className="text-sm text-gray-600">Searching web for details...</p>
            </div>
          )}

          {/* Success Stage */}
          {stage === "success" && (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle2 className="h-6 w-6 text-green-500 mb-3" />
              <p className="text-sm text-gray-600">Done!</p>
            </div>
          )}

          {/* Error Stage */}
          {stage === "error" && (
            <div className="flex flex-col items-center justify-center py-12">
              <X className="h-6 w-6 text-red-500 mb-3" />
              <p className="text-sm text-gray-600 mb-1">Something went wrong</p>
              <p className="text-xs text-gray-400 mb-4">{error}</p>
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
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
