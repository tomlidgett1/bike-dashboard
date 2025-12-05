"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Upload, X, Check, Clock, ImageIcon, Loader2, AlertCircle, CheckCircle2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { use } from "react";
import { compressImage, compressedToFile, shouldCompress } from "@/lib/utils/image-compression";

// ============================================================
// Mobile Upload Page - Enterprise Optimized
// Features:
// - Client-side image compression (5MB → 200KB)
// - Parallel uploads (3 concurrent)
// - Optimistic UI with instant previews
// - No authentication required - uses session token
// ============================================================

const UPLOAD_CONCURRENCY = 3; // Number of parallel uploads

interface UploadedImage {
  id: string;
  url: string;
  storagePath?: string;
  uploadedAt: string;
}

interface PendingImage {
  id: string;
  file: File;
  preview: string;
  status: "compressing" | "uploading" | "done" | "error";
  progress: number;
}

interface SessionData {
  sessionId: string;
  sessionToken: string;
  images: UploadedImage[];
  status: string;
  expiresAt: string;
}

type PageStatus = "loading" | "ready" | "processing" | "complete" | "expired" | "error";

export default function MobileUploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [status, setStatus] = React.useState<PageStatus>("loading");
  const [session, setSession] = React.useState<SessionData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingImages, setPendingImages] = React.useState<PendingImage[]>([]);
  const [processingStatus, setProcessingStatus] = React.useState<string>("");
  const [timeRemaining, setTimeRemaining] = React.useState<number>(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);

  // Fetch session on mount
  React.useEffect(() => {
    fetchSession();
  }, [token]);

  // Cleanup preview URLs on unmount
  React.useEffect(() => {
    return () => {
      pendingImages.forEach(img => URL.revokeObjectURL(img.preview));
    };
  }, []);

  // Update countdown timer
  React.useEffect(() => {
    if (!session?.expiresAt) return;

    const updateTimer = () => {
      const remaining = Math.max(0, new Date(session.expiresAt).getTime() - Date.now());
      setTimeRemaining(remaining);
      
      if (remaining === 0 && status !== "expired") {
        setStatus("expired");
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [session?.expiresAt, status]);

  const fetchSession = async () => {
    try {
      const response = await fetch(`/api/mobile-upload/session/${token}`);
      const result = await response.json();

      if (!response.ok) {
        if (response.status === 410) {
          setStatus("expired");
          setError("This upload session has expired. Please generate a new QR code.");
        } else {
          setStatus("error");
          setError(result.error || "Failed to load session");
        }
        return;
      }

      setSession(result.data);
      setStatus("ready");
    } catch (err) {
      console.error("Error fetching session:", err);
      setStatus("error");
      setError("Failed to connect. Please check your internet connection.");
    }
  };

  // Upload a single file (after compression)
  const uploadFile = async (file: File, imageId: string): Promise<UploadedImage | null> => {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/mobile-upload/session/${token}/upload`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 410) {
          setStatus("expired");
          setError("Session expired. Please generate a new QR code.");
          return null;
        }
        console.error("Upload error:", result.error);
        return null;
      }

      return {
        id: result.data.id,
        url: result.data.url,
        storagePath: result.data.storagePath,
        uploadedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.error("Upload error:", err);
      return null;
    }
  };

  // Process files with compression and parallel uploads
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setStatus("processing");
    
    // Create pending images with instant previews (optimistic UI)
    const newPending: PendingImage[] = files.map((file, index) => ({
      id: `pending-${Date.now()}-${index}`,
      file,
      preview: URL.createObjectURL(file),
      status: "compressing" as const,
      progress: 0,
    }));
    
    setPendingImages(prev => [...prev, ...newPending]);
    setProcessingStatus(`Optimizing ${files.length} photo${files.length > 1 ? 's' : ''}...`);

    // Compress and upload in parallel batches
    const uploadQueue: Array<{ pending: PendingImage; compressed: File }> = [];
    
    // Phase 1: Compress all images (parallel)
    const compressionPromises = newPending.map(async (pending) => {
      try {
        let fileToUpload: File;
        
        if (shouldCompress(pending.file)) {
          const compressed = await compressImage(pending.file, {
            maxDimension: 1920,
            quality: 0.8,
          });
          fileToUpload = compressedToFile(compressed, pending.file.name);
          console.log(`[Mobile Upload] Compressed ${pending.file.name}: ${(pending.file.size / 1024).toFixed(0)}KB → ${(fileToUpload.size / 1024).toFixed(0)}KB`);
        } else {
          fileToUpload = pending.file;
          console.log(`[Mobile Upload] Skipping compression for ${pending.file.name} (already small)`);
        }

        return { pending, compressed: fileToUpload };
      } catch (err) {
        console.error("Compression error:", err);
        // Fallback to original file
        return { pending, compressed: pending.file };
      }
    });

    const compressedResults = await Promise.all(compressionPromises);
    uploadQueue.push(...compressedResults);

    // Update status for all to "uploading"
    setPendingImages(prev => 
      prev.map(img => 
        newPending.find(p => p.id === img.id) 
          ? { ...img, status: "uploading" as const }
          : img
      )
    );
    
    setProcessingStatus(`Uploading ${files.length} photo${files.length > 1 ? 's' : ''}...`);

    // Phase 2: Upload in parallel batches (3 at a time)
    const uploadedImages: UploadedImage[] = [];
    
    for (let i = 0; i < uploadQueue.length; i += UPLOAD_CONCURRENCY) {
      const batch = uploadQueue.slice(i, i + UPLOAD_CONCURRENCY);
      
      const batchResults = await Promise.all(
        batch.map(async ({ pending, compressed }) => {
          const result = await uploadFile(compressed, pending.id);
          
          // Update individual image status
          setPendingImages(prev =>
            prev.map(img =>
              img.id === pending.id
                ? { ...img, status: result ? "done" : "error" }
                : img
            )
          );
          
          return result;
        })
      );

      // Collect successful uploads
      batchResults.forEach(result => {
        if (result) uploadedImages.push(result);
      });
    }

    // Update session with all uploaded images
    if (uploadedImages.length > 0) {
      setSession(prev => prev ? {
        ...prev,
        images: [...prev.images, ...uploadedImages],
      } : null);
    }

    // Clean up - remove completed pending images after animation
    setTimeout(() => {
      setPendingImages(prev => prev.filter(img => img.status !== "done"));
    }, 500);

    setStatus("ready");
    setProcessingStatus("");
    
    // Clear file inputs
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleComplete = async () => {
    try {
      await fetch(`/api/mobile-upload/session/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "complete" }),
      });
      setStatus("complete");
    } catch (err) {
      console.error("Error completing session:", err);
    }
  };

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // Loading state
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">Loading upload session...</p>
        </div>
      </div>
    );
  }

  // Expired state
  if (status === "expired") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="h-8 w-8 text-orange-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Session Expired</h1>
          <p className="text-gray-600 mb-6">
            This upload session has expired. Please scan a new QR code from your computer.
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (status === "error") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Button onClick={() => window.location.reload()} variant="outline">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Complete state
  if (status === "complete") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"
          >
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </motion.div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Photos Uploaded!</h1>
          <p className="text-gray-600 mb-2">
            {session?.images.length || 0} photo{(session?.images.length || 0) !== 1 ? "s" : ""} synced to your computer.
          </p>
          <p className="text-sm text-gray-500">
            You can close this page and continue on your computer.
          </p>
        </div>
      </div>
    );
  }

  // Main upload interface
  const totalImages = (session?.images.length || 0) + pendingImages.filter(p => p.status === "done").length;
  const isProcessing = status === "processing";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-900 rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-sm">YJ</span>
            </div>
            <span className="font-semibold text-gray-900">Yellow Jersey</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <Clock className="h-4 w-4" />
            <span>{formatTime(timeRemaining)}</span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 p-4 pb-32">
        <div className="max-w-md mx-auto">
          {/* Title */}
          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold text-gray-900 mb-1">Upload Photos</h1>
            <p className="text-gray-500 text-sm flex items-center justify-center gap-1">
              <Zap className="h-3.5 w-3.5" />
              Auto-optimized for fast uploads
            </p>
          </div>

          {/* Upload buttons */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {/* Camera button */}
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={isProcessing}
              className="flex flex-col items-center justify-center gap-2 p-6 bg-white border-2 border-dashed border-gray-300 rounded-xl hover:border-gray-400 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Camera className="h-8 w-8 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Take Photo</span>
            </button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Gallery button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="flex flex-col items-center justify-center gap-2 p-6 bg-white border-2 border-dashed border-gray-300 rounded-xl hover:border-gray-400 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <ImageIcon className="h-8 w-8 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Choose Photos</span>
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

          {/* Processing status */}
          <AnimatePresence>
            {isProcessing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6"
              >
                <div className="bg-white rounded-xl p-4 border border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Loader2 className="h-5 w-5 animate-spin text-gray-900" />
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900">{processingStatus}</span>
                      <p className="text-xs text-gray-500">Photos are compressed for faster upload</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pending images (optimistic UI) */}
          {pendingImages.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-gray-900">Processing</h2>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {pendingImages.map((img) => (
                  <motion.div
                    key={img.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="aspect-square rounded-lg overflow-hidden bg-gray-100 relative"
                  >
                    <img
                      src={img.preview}
                      alt="Processing"
                      className="w-full h-full object-cover"
                    />
                    {/* Status overlay */}
                    <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                      img.status === "done" ? "bg-green-500/20" : "bg-black/30"
                    }`}>
                      {img.status === "compressing" && (
                        <div className="bg-white/90 rounded-full p-2">
                          <Zap className="h-4 w-4 text-gray-900 animate-pulse" />
                        </div>
                      )}
                      {img.status === "uploading" && (
                        <div className="bg-white/90 rounded-full p-2">
                          <Loader2 className="h-4 w-4 text-gray-900 animate-spin" />
                        </div>
                      )}
                      {img.status === "done" && (
                        <div className="bg-green-500 rounded-full p-2">
                          <Check className="h-4 w-4 text-white" />
                        </div>
                      )}
                      {img.status === "error" && (
                        <div className="bg-red-500 rounded-full p-2">
                          <X className="h-4 w-4 text-white" />
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Uploaded photos */}
          {session && session.images.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-gray-900">
                  Uploaded ({session.images.length})
                </h2>
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Synced
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {session.images.map((img, index) => (
                  <motion.div
                    key={img.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="aspect-square rounded-lg overflow-hidden bg-gray-100 relative"
                  >
                    <Image
                      src={img.url}
                      alt={`Photo ${index + 1}`}
                      fill
                      className="object-cover"
                      sizes="33vw"
                    />
                    {index === 0 && (
                      <div className="absolute top-1 left-1 bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                        Primary
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {session && session.images.length === 0 && pendingImages.length === 0 && status === "ready" && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Upload className="h-7 w-7 text-gray-400" />
              </div>
              <p className="text-gray-500 text-sm">
                No photos yet. Take or select photos above.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom action */}
      {session && (session.images.length > 0 || pendingImages.some(p => p.status === "done")) && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 safe-area-inset-bottom">
          <Button
            onClick={handleComplete}
            className="w-full h-12 text-base font-medium bg-gray-900 hover:bg-gray-800"
            disabled={isProcessing}
          >
            Done - Continue on Computer
          </Button>
        </div>
      )}
    </div>
  );
}
