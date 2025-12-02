"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, Loader2, AlertCircle, CheckCircle2, Sparkles, ImageIcon, Monitor, Smartphone } from "lucide-react";
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

// ============================================================
// Smart Upload Modal
// Popup dialog for AI-powered photo analysis
// Supports both computer upload and mobile QR code upload
// ============================================================

type FlowStage = "upload" | "uploading" | "analyzing" | "success" | "error";
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

    setStage("uploading");
    setError(null);
    setUploadProgress({ current: 0, total: photos.length });

    try {
      // Get Supabase session
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('You must be logged in to use AI analysis');
      }

      // Upload photos to Supabase storage
      const urls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const fileName = `${session.user.id}/${Date.now()}-${i}-${photo.file.name}`;
        
        const { data, error: uploadError } = await supabase.storage
          .from('listing-images')
          .upload(fileName, photo.file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('listing-images')
          .getPublicUrl(fileName);

        urls.push(publicUrl);
        setUploadProgress({ current: i + 1, total: photos.length });
      }

      setUploadedUrls(urls);
      await runAiAnalysis(urls);

    } catch (err: any) {
      console.error('❌ [SMART UPLOAD MODAL] Error:', err);
      setError(err.message || "Failed to upload photos");
      setStage("error");
    }
  };

  const runAiAnalysis = async (urls: string[]) => {
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

      // Add images to form data with first image as primary
      formData.images = urls.map((url, index) => ({
        id: `ai-${index}`,
        url,
        order: index,
        isPrimary: index === 0,
      }));
      
      // Set the primary image URL explicitly
      formData.primaryImageUrl = urls[0];

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
      <DialogContent className="sm:max-w-[520px] rounded-md animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-5 w-5 text-gray-900" />
            Smart Upload
          </DialogTitle>
          <DialogDescription>
            Upload photos and AI will detect your product details automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <AnimatePresence mode="wait">
            {/* Upload Stage */}
            {stage === "upload" && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* Tab Switcher */}
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button
                    onClick={() => setActiveTab("computer")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium rounded-md transition-all",
                      activeTab === "computer"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    )}
                  >
                    <Monitor className="h-4 w-4" />
                    Computer
                  </button>
                  <button
                    onClick={() => setActiveTab("phone")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium rounded-md transition-all",
                      activeTab === "phone"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    )}
                  >
                    <Smartphone className="h-4 w-4" />
                    Phone
                  </button>
                </div>

                {/* Computer Upload Tab */}
                {activeTab === "computer" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    {/* Drop Zone */}
                    <div
                      onDrop={handleDrop}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors",
                        photos.length > 0 
                          ? "border-gray-300 bg-gray-50" 
                          : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
                      )}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-700">
                        Drop photos here or click to upload
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Up to 10 photos (JPG, PNG)
                      </p>
                    </div>

                    {/* Photo Previews */}
                    {photos.length > 0 && (
                      <div className="grid grid-cols-5 gap-2">
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
                              className="absolute top-1 right-1 p-1 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3 text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        className="rounded-md"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAnalyze}
                        disabled={photos.length === 0}
                        className="rounded-md bg-gray-900 hover:bg-gray-800 text-white"
                      >
                        <Sparkles className="h-4 w-4 mr-1.5" />
                        Analyse Photos
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* Phone QR Upload Tab */}
                {activeTab === "phone" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <QrUploadSection
                      onPhotosReady={handleQrPhotosReady}
                      onCancel={() => setActiveTab("computer")}
                    />
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* Uploading Stage */}
            {stage === "uploading" && (
              <motion.div
                key="uploading"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="py-8 text-center space-y-4"
              >
                <div className="relative">
                  <ImageIcon className="h-10 w-10 text-gray-600 mx-auto" />
                  <motion.div
                    className="absolute -top-1 -right-1 w-5 h-5 bg-gray-900 rounded-full flex items-center justify-center"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                  >
                    <Loader2 className="h-3 w-3 animate-spin text-white" />
                  </motion.div>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Uploading photos...</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {uploadProgress.current} of {uploadProgress.total} photos
                  </p>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 max-w-[200px] mx-auto">
                  <div
                    className="bg-gray-900 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  />
                </div>
              </motion.div>
            )}

            {/* Analyzing Stage */}
            {stage === "analyzing" && (
              <motion.div
                key="analyzing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="py-8 text-center space-y-4"
              >
                <div className="relative">
                  <Sparkles className="h-10 w-10 text-gray-900 mx-auto" />
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center"
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  >
                    <div className="w-14 h-14 border-2 border-gray-200 border-t-gray-900 rounded-full" />
                  </motion.div>
                </div>
                <div>
                  <p className="font-medium text-gray-900">AI is analysing your photos...</p>
                  <p className="text-sm text-gray-500 mt-1">Detecting product details</p>
                </div>
              </motion.div>
            )}

            {/* Success Stage */}
            {stage === "success" && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="py-8 text-center space-y-4"
              >
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Analysis complete!</p>
                  <p className="text-sm text-gray-500 mt-1">Preparing your listing...</p>
                </div>
              </motion.div>
            )}

            {/* Error Stage */}
            {stage === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="py-6 space-y-4"
              >
                <div className="bg-red-50 rounded-md p-4 border border-red-200">
                  <div className="flex gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-800">Analysis failed</p>
                      <p className="text-sm text-red-700 mt-1">{error}</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    className="rounded-md"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleRetry}
                    className="rounded-md"
                  >
                    Try Again
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
