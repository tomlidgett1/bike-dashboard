"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================================
// Smart Upload Photo Component
// For AI Analysis
// ============================================================

interface PhotoUploadSmartProps {
  onPhotosUploaded: (urls: string[]) => void;
  minPhotos?: number;
  maxPhotos?: number;
}

export function PhotoUploadSmart({ 
  onPhotosUploaded,
  minPhotos = 1,
  maxPhotos = 10
}: PhotoUploadSmartProps) {
  const [photos, setPhotos] = React.useState<Array<{ id: string; url: string; file: File }>>([]);
  const [uploading, setUploading] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const remaining = maxPhotos - photos.length;
    if (remaining <= 0) {
      alert(`Maximum ${maxPhotos} photos allowed`);
      return;
    }

    const filesToAdd = Array.from(files).slice(0, remaining);

    // Validate
    const validFiles = filesToAdd.filter((file) => {
      if (!file.type.startsWith("image/")) {
        alert(`${file.name} is not an image`);
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert(`${file.name} exceeds 10MB`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    setUploading(true);

    try {
      // Upload to Supabase
      const uploadedPhotos = await Promise.all(
        validFiles.map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("listingId", `ai-temp-${Date.now()}`);

          const response = await fetch("/api/marketplace/listings/upload-image", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) throw new Error(`Failed to upload ${file.name}`);

          const result = await response.json();
          return {
            id: result.data.id,
            url: result.data.url,
            file,
          };
        })
      );

      setPhotos([...photos, ...uploadedPhotos]);
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload some photos");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (id: string) => {
    setPhotos(photos.filter(p => p.id !== id));
  };

  const handleAnalyze = () => {
    if (photos.length < minPhotos) {
      alert(`Please upload at least ${minPhotos} photo${minPhotos > 1 ? 's' : ''}`);
      return;
    }
    onPhotosUploaded(photos.map(p => p.url));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Upload Photos for Analysis</h2>
        <p className="text-gray-600">
          Upload {minPhotos}-{maxPhotos} clear photos from multiple angles for best results
        </p>
      </div>

      {/* Guidelines */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-3">Photo Tips</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="space-y-1">
            <p className="font-medium text-gray-900">For Bikes:</p>
            <ul className="text-gray-600 space-y-0.5">
              <li>• Full drive side view</li>
              <li>• Groupset close-up</li>
              <li>• Frame branding</li>
              <li>• Damage areas</li>
            </ul>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-gray-900">For Parts:</p>
            <ul className="text-gray-600 space-y-0.5">
              <li>• Multiple angles</li>
              <li>• Brand markings</li>
              <li>• Model numbers</li>
              <li>• Wear areas</li>
            </ul>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-gray-900">For Apparel:</p>
            <ul className="text-gray-600 space-y-0.5">
              <li>• Front view</li>
              <li>• Size/brand tags</li>
              <li>• Back view</li>
              <li>• Any wear</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "border-2 border-dashed rounded-xl p-12 transition-colors",
          isDragging ? "border-gray-900 bg-gray-50" : "border-gray-300 bg-white"
        )}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
            <Upload className="h-10 w-10 text-gray-600" />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900 text-lg">
              Drop photos here or click to browse
            </h3>
            <p className="text-sm text-gray-600">
              JPG, PNG, or WebP • Max 10MB per image • {photos.length}/{maxPhotos} uploaded
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || photos.length >= maxPhotos}
              className="px-6 py-3 bg-gray-900 text-white font-medium rounded-md hover:bg-gray-800 disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Choose Files"}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
        </div>
      </div>

      {/* Photo Preview Grid */}
      {photos.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900">
            Your Photos ({photos.length}/{maxPhotos})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <AnimatePresence>
              {photos.map((photo, index) => (
                <motion.div
                  key={photo.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative aspect-square rounded-md overflow-hidden border-2 border-gray-200 group"
                >
                  <img
                    src={photo.url}
                    alt={`Photo ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 right-2">
                    <button
                      onClick={() => removePhoto(photo.id)}
                      className="p-1.5 bg-white rounded-full shadow-md hover:bg-red-50 transition-colors"
                    >
                      <X className="h-4 w-4 text-red-600" />
                    </button>
                  </div>
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-xs rounded-md">
                    Photo {index + 1}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Requirements Check */}
      {photos.length > 0 && photos.length < minPhotos && (
        <div className="flex items-center gap-2 text-sm text-yellow-700 bg-yellow-50 rounded-md p-3 border border-yellow-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <p>
            Upload at least {minPhotos} photo{minPhotos > 1 ? 's' : ''} for AI analysis
            ({minPhotos - photos.length} more needed)
          </p>
        </div>
      )}

      {/* Analyze Button */}
      {photos.length >= minPhotos && (
        <div className="flex justify-center">
          <Button
            onClick={handleAnalyze}
            size="lg"
            className="px-8 bg-gray-900 hover:bg-gray-800 text-white rounded-md"
          >
            Smart Upload
          </Button>
        </div>
      )}
    </div>
  );
}

