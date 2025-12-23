"use client";

import * as React from "react";
import { Upload, X, CheckCircle2, Monitor, Smartphone, Camera, ImageIcon, Plus, Wand2, ChevronLeft } from "lucide-react";
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
import { QrUploadSection } from "./qr-upload-section";
import { useUpload } from "@/components/providers/upload-provider";

// ============================================================
// Smart Upload Modal - Background Processing Version
// ============================================================
// Features:
// - Photo selection with drag & drop
// - AI background removal option for hero images
// - Delegates processing to UploadProvider for background execution
// - Closes immediately after starting upload
// ============================================================

type FlowStage = "upload" | "enhance-options";
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
  const [isMobile, setIsMobile] = React.useState(false);
  const [removeBackground, setRemoveBackground] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  
  // Use a ref to track the latest photos state to avoid stale closures
  const photosRef = React.useRef(photos);
  React.useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // Get upload context
  const { startUpload, isUploading } = useUpload();

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
      photosRef.current = [];
      setRemoveBackground(false);
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
  }, []);

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
      blobUrlsRef.current.add(preview);
      return {
        id: crypto.randomUUID(),
        file,
        preview,
      };
    });
    setPhotos(prev => {
      const updated = [...prev, ...newPhotos];
      photosRef.current = updated;
      return updated;
    });
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => {
      const url = prev[index].preview;
      URL.revokeObjectURL(url);
      blobUrlsRef.current.delete(url);
      const updated = prev.filter((_, i) => i !== index);
      photosRef.current = updated;
      return updated;
    });
  };

  const setPrimaryPhoto = (index: number) => {
    if (index === 0) return;
    setPhotos(prev => {
      const newPhotos = [...prev];
      const [primaryPhoto] = newPhotos.splice(index, 1);
      const reordered = [primaryPhoto, ...newPhotos];
      photosRef.current = reordered;
      return reordered;
    });
  };

  // Move to enhance options stage
  const handleProceedToOptions = () => {
    if (photos.length === 0) return;
    setStage("enhance-options");
  };

  // Handle going back from enhance options
  const handleBackToUpload = () => {
    setStage("upload");
    setRemoveBackground(false);
  };

  // Start the upload process and close modal immediately
  const handleStartUpload = () => {
    const currentPhotos = photosRef.current;
    if (currentPhotos.length === 0) return;

    console.log('🚀 [SMART UPLOAD] Starting background upload');
    console.log('🖼️ [SMART UPLOAD] Photos:', currentPhotos.length);
    console.log('✨ [SMART UPLOAD] Remove background:', removeBackground);

    // Start upload in background via context
    startUpload(currentPhotos, removeBackground, onComplete);

    // Close modal immediately
    onClose();
  };

  // Handle photos received from QR mobile upload
  const handleQrPhotosReady = async (images: { id: string; url: string; uploadedAt: string }[]) => {
    if (images.length === 0) return;
    // For QR uploads, we need to handle differently since photos are already uploaded
    // TODO: Handle QR upload flow with background processing
    console.log('📱 [SMART UPLOAD] QR photos received:', images.length);
  };

  // Mobile Bottom Sheet Render
  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
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
                    onClick={handleProceedToOptions}
                    disabled={photos.length === 0}
                    className="flex-1 h-12 rounded-xl bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-semibold disabled:opacity-40"
                  >
                    Continue
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Enhance Options Stage - Mobile */}
          {stage === "enhance-options" && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Header with back button */}
              <div className="px-5 pb-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleBackToUpload}
                    className="p-1.5 -ml-1.5 rounded-md hover:bg-gray-100 active:bg-gray-200 transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5 text-gray-600" />
                  </button>
                  <h2 className="text-lg font-semibold text-gray-900">Enhance Cover</h2>
                </div>
              </div>
              
              {/* Content */}
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                {/* Cover Preview with toggle overlay */}
                <div className="relative max-w-[300px] mx-auto">
                  <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100">
                    <img
                      src={photos[0]?.preview}
                      alt="Cover photo"
                      className="w-full h-full object-cover"
                    />
                    {/* Subtle gradient overlay when enhancement is on */}
                    <div 
                      className={cn(
                        "absolute inset-0 transition-opacity duration-300",
                        removeBackground 
                          ? "bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-100" 
                          : "opacity-0"
                      )} 
                    />
                    <div className="absolute bottom-3 left-3 bg-[#FFC72C] px-2.5 py-1 rounded-md text-xs text-gray-900 font-bold">
                      COVER
                    </div>
                  </div>
                  
                  {/* Enhancement toggle - positioned below image */}
                  <button
                    onClick={() => setRemoveBackground(!removeBackground)}
                    className={cn(
                      "mt-4 w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all duration-200",
                      removeBackground 
                        ? "border-gray-900 bg-gray-900" 
                        : "border-gray-200 bg-white hover:border-gray-300"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center transition-colors duration-200",
                        removeBackground ? "bg-white/10" : "bg-gray-100"
                      )}>
                        <Wand2 className={cn(
                          "h-5 w-5 transition-colors duration-200",
                          removeBackground ? "text-white" : "text-gray-600"
                        )} />
                      </div>
                      <div className="text-left">
                        <p className={cn(
                          "text-sm font-semibold transition-colors duration-200",
                          removeBackground ? "text-white" : "text-gray-900"
                        )}>
                          Remove Background
                        </p>
                        <p className={cn(
                          "text-xs transition-colors duration-200",
                          removeBackground ? "text-gray-300" : "text-gray-500"
                        )}>
                          Studio-quality white backdrop
                        </p>
                      </div>
                    </div>
                    <div className={cn(
                      "h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all duration-200",
                      removeBackground 
                        ? "border-white bg-white" 
                        : "border-gray-300 bg-white"
                    )}>
                      {removeBackground && (
                        <CheckCircle2 className="h-5 w-5 text-gray-900" />
                      )}
                    </div>
                  </button>
                </div>

                {/* Additional photos count */}
                {photos.length > 1 && (
                  <p className="text-center text-xs text-gray-400 mt-5">
                    +{photos.length - 1} more photo{photos.length > 2 ? 's' : ''} will be uploaded
                  </p>
                )}
              </div>

              {/* Bottom Actions */}
              <div className="px-4 pb-8 pt-3 border-t border-gray-100 flex-shrink-0 bg-white">
                <Button
                  onClick={handleStartUpload}
                  disabled={isUploading}
                  className="w-full h-12 rounded-xl bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-semibold disabled:opacity-40"
                >
                  {removeBackground ? 'Enhance & Continue' : 'Continue'}
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
                      onClick={handleProceedToOptions}
                      disabled={photos.length === 0}
                      size="sm"
                      className="rounded-md bg-gray-900 hover:bg-gray-800 text-white"
                    >
                      Continue
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

          {/* Enhance Options Stage - Desktop */}
          {stage === "enhance-options" && (
            <div className="space-y-4">
              {/* Back button and header */}
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleBackToUpload}
                  className="p-1 rounded-md hover:bg-gray-100 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4 text-gray-600" />
                </button>
                <span className="text-sm font-medium text-gray-700">Enhance Cover</span>
              </div>

              {/* Cover Preview with Enhancement Toggle */}
              <div className="flex gap-4">
                {/* Cover Preview */}
                <div className="relative w-28 h-28 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                  <img
                    src={photos[0]?.preview}
                    alt="Cover photo"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1 left-1 bg-[#FFC72C] px-1.5 py-0.5 rounded text-[9px] text-gray-900 font-bold">
                    COVER
                  </div>
                </div>

                {/* Enhancement Toggle */}
                <div className="flex-1 flex flex-col justify-center">
                  <button
                    onClick={() => setRemoveBackground(!removeBackground)}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border-2 transition-all duration-200",
                      removeBackground 
                        ? "border-gray-900 bg-gray-900" 
                        : "border-gray-200 bg-white hover:border-gray-300"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        "h-8 w-8 rounded-md flex items-center justify-center transition-colors duration-200",
                        removeBackground ? "bg-white/10" : "bg-gray-100"
                      )}>
                        <Wand2 className={cn(
                          "h-4 w-4 transition-colors duration-200",
                          removeBackground ? "text-white" : "text-gray-600"
                        )} />
                      </div>
                      <div className="text-left">
                        <p className={cn(
                          "text-sm font-medium transition-colors duration-200",
                          removeBackground ? "text-white" : "text-gray-900"
                        )}>
                          Remove Background
                        </p>
                        <p className={cn(
                          "text-xs transition-colors duration-200",
                          removeBackground ? "text-gray-400" : "text-gray-500"
                        )}>
                          Studio-quality white backdrop
                        </p>
                      </div>
                    </div>
                    <div className={cn(
                      "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all duration-200",
                      removeBackground 
                        ? "border-white bg-white" 
                        : "border-gray-300 bg-white"
                    )}>
                      {removeBackground && (
                        <CheckCircle2 className="h-4 w-4 text-gray-900" />
                      )}
                    </div>
                  </button>
                  
                  {photos.length > 1 && (
                    <p className="text-xs text-gray-400 mt-2">
                      +{photos.length - 1} more photo{photos.length > 2 ? 's' : ''} will be uploaded
                    </p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleBackToUpload}
                  className="text-gray-500"
                >
                  Back
                </Button>
                <Button
                  onClick={handleStartUpload}
                  disabled={isUploading}
                  size="sm"
                  className="rounded-md bg-gray-900 hover:bg-gray-800 text-white"
                >
                  {removeBackground ? 'Enhance & Upload' : 'Upload'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
