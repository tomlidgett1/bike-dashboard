'use client';

// ============================================================
// Image Uploader Component
// ============================================================

import React, { useCallback, useState } from 'react';
import { Upload, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { validateImageFile } from '@/lib/services/image-processing/optimizer';

interface ImageUploaderProps {
  canonicalProductId: string;
  onUploadComplete?: (result: any) => void;
  onUploadError?: (error: string) => void;
  maxFiles?: number;
  className?: string;
}

interface FileWithPreview {
  file: File;
  preview: string;
  id: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  progress?: number;
}

export function ImageUploader({
  canonicalProductId,
  onUploadComplete,
  onUploadError,
  maxFiles = 10,
  className,
}: ImageUploaderProps) {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      handleFiles(droppedFiles);
    },
    [files, maxFiles]
  );

  const handleFiles = useCallback(
    (newFiles: File[]) => {
      // Filter to only image files
      const imageFiles = newFiles.filter((file) => file.type.startsWith('image/'));

      // Check max files limit
      if (files.length + imageFiles.length > maxFiles) {
        onUploadError?.(
          `Maximum ${maxFiles} images allowed. You tried to upload ${imageFiles.length} more.`
        );
        return;
      }

      // Validate and create previews
      const validatedFiles: FileWithPreview[] = [];

      imageFiles.forEach((file) => {
        const validation = validateImageFile(file);

        if (!validation.valid) {
          onUploadError?.(validation.error || 'Invalid file');
          return;
        }

        validatedFiles.push({
          file,
          preview: URL.createObjectURL(file),
          id: Math.random().toString(36).substr(2, 9),
          status: 'pending',
        });
      });

      setFiles((prev) => [...prev, ...validatedFiles]);
    },
    [files, maxFiles, onUploadError]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  const uploadFile = async (fileWithPreview: FileWithPreview) => {
    const formData = new FormData();
    formData.append('file', fileWithPreview.file);
    formData.append('canonicalProductId', canonicalProductId);
    formData.append('isPrimary', files.length === 0 ? 'true' : 'false');
    formData.append('sortOrder', files.length.toString());

    try {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileWithPreview.id ? { ...f, status: 'uploading', progress: 0 } : f
        )
      );

      const response = await fetch('/api/images/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileWithPreview.id ? { ...f, status: 'success', progress: 100 } : f
        )
      );

      onUploadComplete?.(result.data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileWithPreview.id
            ? { ...f, status: 'error', error: errorMessage }
            : f
        )
      );

      onUploadError?.(errorMessage);
    }
  };

  const uploadAll = async () => {
    const pendingFiles = files.filter((f) => f.status === 'pending');

    for (const file of pendingFiles) {
      await uploadFile(file);
    }
  };

  const clearCompleted = () => {
    setFiles((prev) => {
      prev.forEach((f) => {
        if (f.status === 'success') {
          URL.revokeObjectURL(f.preview);
        }
      });
      return prev.filter((f) => f.status !== 'success');
    });
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        className={cn(
          'relative border-2 border-dashed rounded-md p-8 transition-colors cursor-pointer',
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 bg-white'
        )}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />

        <div className="flex flex-col items-center justify-center text-center space-y-3">
          <Upload className="h-10 w-10 text-gray-400" />
          <div>
            <p className="text-sm font-medium text-gray-700">
              Drag and drop images here, or click to select
            </p>
            <p className="text-xs text-gray-500 mt-1">
              JPEG, PNG, WebP up to 10MB • Maximum {maxFiles} images
            </p>
          </div>
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">
              {files.length} {files.length === 1 ? 'image' : 'images'} selected
            </p>
            <div className="flex gap-2">
              <Button
                onClick={uploadAll}
                disabled={!files.some((f) => f.status === 'pending')}
                size="sm"
              >
                Upload All
              </Button>
              <Button onClick={clearCompleted} variant="outline" size="sm">
                Clear Completed
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {files.map((fileWithPreview) => (
              <div
                key={fileWithPreview.id}
                className="relative group rounded-md overflow-hidden bg-white border border-gray-200"
              >
                {/* Preview */}
                <div className="aspect-square relative">
                  <img
                    src={fileWithPreview.preview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />

                  {/* Status overlay */}
                  {fileWithPreview.status === 'uploading' && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 text-white animate-spin" />
                    </div>
                  )}

                  {fileWithPreview.status === 'success' && (
                    <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    </div>
                  )}

                  {fileWithPreview.status === 'error' && (
                    <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                      <AlertCircle className="h-8 w-8 text-red-600" />
                    </div>
                  )}

                  {/* Remove button */}
                  <button
                    onClick={() => removeFile(fileWithPreview.id)}
                    className="absolute top-2 right-2 p-1 bg-black/70 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* File info */}
                <div className="p-2">
                  <p className="text-xs text-gray-600 truncate">
                    {fileWithPreview.file.name}
                  </p>
                  {fileWithPreview.error && (
                    <p className="text-xs text-red-600 mt-1">
                      {fileWithPreview.error}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

