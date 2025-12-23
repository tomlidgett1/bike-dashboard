"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Upload, X, Loader2, Camera, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { compressImage, compressedToFile, shouldCompress } from "@/lib/utils/image-compression";

// ============================================================
// Bulk Photo Upload Step
// Multi-photo upload with compression and progress tracking
// ============================================================

const UPLOAD_CONCURRENCY = 3;

interface UploadedPhoto {
  id: string;
  url: string;
  cardUrl: string;
  thumbnailUrl: string;
  mobileCardUrl: string;
  galleryUrl?: string;
  detailUrl?: string;
  file: File;
}

interface BulkPhotoUploadStepProps {
  onComplete: (photos: UploadedPhoto[]) => void;
  onBack?: () => void;
}

export function BulkPhotoUploadStep({ onComplete, onBack }: BulkPhotoUploadStepProps) {
  const [photos, setPhotos] = React.useState<{ file: File; preview: string }[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = React.useState<UploadedPhoto[]>([]);
  const [isCompressing, setIsCompressing] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState({ current: 0, total: 0 });
  const [error, setError] = React.useState<string | null>(null);
  const [dragActive, setDragActive] = React.useState(false);
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
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    addPhotos(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const addPhotos = (files: File[]) => {
    const newPhotos = files.map(file => ({
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

  const handleUpload = async () => {
    if (photos.length === 0) return;

    setError(null);
    setIsCompressing(true);
    setUploadProgress({ current: 0, total: photos.length });

    try {
      // Get Supabase session
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('You must be logged in to upload photos');
      }

      // Phase 1: Compress images
      console.log('🗜️ [BULK UPLOAD] Compressing', photos.length, 'photos...');
      
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
          console.log(`[BULK UPLOAD] Compressed: ${(photo.file.size / 1024).toFixed(0)}KB → ${(fileToUpload.size / 1024).toFixed(0)}KB`);
        } else {
          fileToUpload = photo.file;
        }
        
        compressedFiles.push(fileToUpload);
        setUploadProgress({ current: i + 1, total: photos.length });
      }

      // Phase 2: Upload to Cloudinary (parallel batches)
      setIsCompressing(false);
      setIsUploading(true);
      setUploadProgress({ current: 0, total: compressedFiles.length });
      
      console.log('📤 [BULK UPLOAD] Uploading to Cloudinary...');
      
      const uploaded: UploadedPhoto[] = [];
      const listingId = `bulk-${Date.now()}`;
      
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
            console.log(`✅ [BULK UPLOAD] Image ${globalIndex + 1} uploaded to Cloudinary`);
            
            return {
              id: result.data.id,
              url: result.data.url,
              cardUrl: result.data.cardUrl,
              thumbnailUrl: result.data.thumbnailUrl,
              mobileCardUrl: result.data.mobileCardUrl,
              galleryUrl: result.data.galleryUrl,
              detailUrl: result.data.detailUrl,
              file: compressedFiles[globalIndex],
            };
          })
        );
        
        uploaded.push(...batchResults);
        setUploadProgress({ current: uploaded.length, total: compressedFiles.length });
      }

      console.log('✅ [BULK UPLOAD] All photos uploaded successfully');
      setUploadedPhotos(uploaded);
      onComplete(uploaded);

    } catch (err) {
      console.error('❌ [BULK UPLOAD] Error:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
      setIsCompressing(false);
      setIsUploading(false);
    }
  };

  const isProcessing = isCompressing || isUploading;
  const progressPercent = uploadProgress.total > 0 
    ? Math.round((uploadProgress.current / uploadProgress.total) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-20">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className={cn("mb-6", isMobile ? "text-center" : "")}>
          <h1 className={cn("font-bold text-gray-900 mb-2", isMobile ? "text-2xl" : "text-3xl")}>
            Bulk Upload
          </h1>
          <p className={cn("text-gray-600", isMobile ? "text-sm" : "")}>
            Upload 20+ photos to create multiple product listings
          </p>
        </div>

        {/* Upload Zone */}
        {!isProcessing && photos.length === 0 && (
          <>
            {isMobile ? (
              /* Mobile: Two-button interface */
              <div className="space-y-3">
                <motion.button
                  onClick={() => cameraInputRef.current?.click()}
                  whileTap={{ scale: 0.98 }}
                  className="w-full"
                >
                  <div className="bg-white border-2 border-[#FFC72C] rounded-xl p-5 flex items-center gap-4">
                    <div className="h-14 w-14 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Camera className="h-7 w-7 text-gray-700" />
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="text-base font-semibold text-gray-900">Take Photos</h3>
                      <p className="text-xs text-gray-500 mt-0.5">Capture multiple items</p>
                    </div>
                  </div>
                </motion.button>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <motion.button
                  onClick={() => fileInputRef.current?.click()}
                  whileTap={{ scale: 0.98 }}
                  className="w-full"
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
                </motion.button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <p className="text-center text-xs text-gray-400 pt-2">
                  Upload 20+ photos for best results
                </p>
              </div>
            ) : (
              /* Desktop: Drop zone */
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={cn(
                  "border-2 border-dashed rounded-md p-12 text-center bg-white transition-colors",
                  dragActive ? "border-gray-900 bg-gray-50" : "border-gray-300"
                )}
              >
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Drag and drop photos here
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                  or use the buttons below
                </p>
                
                <div className="flex gap-3 justify-center">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-md bg-gray-900 hover:bg-gray-800"
                  >
                    <ImageIcon className="h-4 w-4 mr-2" />
                    Choose Files
                  </Button>
                  <Button
                    onClick={() => cameraInputRef.current?.click()}
                    variant="outline"
                    className="rounded-md"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Take Photos
                  </Button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            )}
          </>
        )}

        {/* Processing Status */}
        {isProcessing && (
          <div className="bg-white rounded-xl p-8 text-center">
            {/* Animated progress indicator */}
            <div className="relative inline-block mb-6">
              <div className={cn(
                "rounded-full bg-gray-100 flex items-center justify-center",
                isMobile ? "h-16 w-16" : "h-20 w-20"
              )}>
                <Upload className={cn("text-gray-400", isMobile ? "h-7 w-7" : "h-9 w-9")} />
              </div>
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#FFC72C]"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
            </div>
            
            <h3 className={cn("font-semibold text-gray-900 mb-2", isMobile ? "text-base" : "text-lg")}>
              {isCompressing ? 'Optimising photos...' : 'Uploading photos...'}
            </h3>
            <p className={cn("text-gray-600 mb-4", isMobile ? "text-sm" : "text-base")}>
              {uploadProgress.current} of {uploadProgress.total}
            </p>
            <div className={cn("h-1.5 bg-gray-200 rounded-full overflow-hidden mx-auto", isMobile ? "w-48" : "w-64")}>
              <motion.div
                className="h-full bg-[#FFC72C]"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Photo Grid */}
        {photos.length > 0 && !isProcessing && (
          <div className={cn("mt-6", isMobile && "bg-white rounded-xl p-4")}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={cn("font-semibold text-gray-900", isMobile ? "text-base" : "text-lg")}>
                {photos.length} Photo{photos.length !== 1 ? 's' : ''} Selected
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  photos.forEach(p => URL.revokeObjectURL(p.preview));
                  setPhotos([]);
                }}
                className="rounded-md text-xs"
              >
                Clear All
              </Button>
            </div>

            <div className={cn(
              "grid gap-2",
              isMobile ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
            )}>
              {photos.map((photo, index) => (
                <div key={index} className={cn(
                  "relative aspect-square overflow-hidden bg-gray-100 group",
                  isMobile ? "rounded-xl" : "rounded-md"
                )}>
                  <Image
                    src={photo.preview}
                    alt={`Photo ${index + 1}`}
                    fill
                    className="object-cover"
                  />
                  <button
                    onClick={() => removePhoto(index)}
                    className={cn(
                      "absolute p-1.5 bg-black/60 hover:bg-black/80 rounded-full transition-opacity",
                      isMobile ? "top-1.5 right-1.5 opacity-100" : "top-2 right-2 opacity-0 group-hover:opacity-100"
                    )}
                  >
                    <X className="h-3.5 w-3.5 text-white" />
                  </button>
                  <div className={cn(
                    "absolute px-2 py-0.5 rounded-md",
                    isMobile ? "bottom-1.5 left-1.5 bg-black/60" : "bottom-2 left-2 bg-black/60"
                  )}>
                    <span className="text-xs text-white font-medium">{index + 1}</span>
                  </div>
                </div>
              ))}
              
              {/* Add More Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "aspect-square bg-gray-100 border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-200 transition-colors flex items-center justify-center",
                  isMobile ? "rounded-xl" : "rounded-md"
                )}
              >
                <div className="text-center">
                  <Upload className={cn("text-gray-400 mx-auto mb-1", isMobile ? "h-5 w-5" : "h-6 w-6")} />
                  <span className="text-xs text-gray-500 font-medium">Add More</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        {photos.length > 0 && !isProcessing && (
          <div className="flex gap-3 mt-6">
            {onBack && !isMobile && (
              <Button
                variant="outline"
                onClick={onBack}
                className="rounded-md"
              >
                Back
              </Button>
            )}
            <Button
              onClick={handleUpload}
              disabled={photos.length === 0}
              className={cn(
                "flex-1 bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-semibold",
                isMobile ? "rounded-xl h-12" : "rounded-md"
              )}
            >
              Continue with {photos.length} Photo{photos.length !== 1 ? 's' : ''}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

