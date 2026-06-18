"use client";

import * as React from "react";
import { Upload, X, Monitor, Smartphone, Camera, ImageIcon, Plus } from '@/components/layout/app-sidebar/dashboard-icons';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { QrUploadSection } from "./qr-upload-section";
import { useUpload } from "@/components/providers/upload-provider";

// ============================================================
// Smart Upload Modal - Background Processing Version
// ============================================================
// Features:
// - Photo selection with drag & drop
// - Delegates processing to UploadProvider for background execution
// - Closes immediately after starting upload
// ============================================================

type FlowStage = "upload";
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
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  
  // Use a ref to track the latest photos state to avoid stale closures
  const photosRef = React.useRef(photos);
  React.useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // Get upload context
  const { startUpload } = useUpload();

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

  // Start upload after photo selection
  const handleProceedToOptions = () => {
    if (photos.length === 0) return;
    handleStartUpload();
  };

  // Start the upload process and close modal immediately
  const handleStartUpload = () => {
    const currentPhotos = photosRef.current;
    if (currentPhotos.length === 0) return;

    console.log('🚀 [SMART UPLOAD] Starting background upload');
    console.log('🖼️ [SMART UPLOAD] Photos:', currentPhotos.length);

    // Start upload in background via context
    startUpload(currentPhotos, onComplete);

    // Close modal immediately
    onClose();
  };

  // Handle photos received from QR mobile upload
  const handleQrPhotosReady = async (images: { id: string; url: string; uploadedAt: string }[]) => {
    if (images.length === 0) return;
    // For QR uploads, we need to handle differently since photos are already uploaded
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
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as UploadTab)}
              className="gap-3"
            >
              <TabsList className="w-full">
                <TabsTrigger value="computer">
                  <Monitor className="h-3.5 w-3.5" />
                  Computer
                </TabsTrigger>
                <TabsTrigger value="phone">
                  <Smartphone className="h-3.5 w-3.5" />
                  Phone
                </TabsTrigger>
              </TabsList>

              {/* Computer Upload Tab */}
              <TabsContent value="computer" className="space-y-3">
                {/* Drop Zone */}
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="border border-dashed border-input rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Upload className="text-muted-foreground mx-auto mb-2 h-6 w-6" />
                  <p className="text-sm text-foreground">
                    Drop photos or click to upload
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Up to 10 photos
                  </p>
                </div>

                {/* Photo Previews */}
                {photos.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Click a photo to set as cover image</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {photos.map((photo, index) => (
                        <button
                          key={photo.id}
                          onClick={() => setPrimaryPhoto(index)}
                          className="relative aspect-square rounded-md overflow-hidden border border-border group hover:scale-105 transition-transform"
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
                  <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleProceedToOptions}
                    disabled={photos.length === 0}
                    size="sm"
                  >
                    Continue
                  </Button>
                </div>
              </TabsContent>

              {/* Phone QR Upload Tab */}
              <TabsContent value="phone">
                <QrUploadSection
                  onPhotosReady={handleQrPhotosReady}
                  onCancel={() => setActiveTab("computer")}
                />
              </TabsContent>
            </Tabs>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
