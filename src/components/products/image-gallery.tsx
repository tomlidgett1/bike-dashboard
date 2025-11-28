'use client';

// ============================================================
// Image Gallery Manager Component with Tabs
// ============================================================

import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, Upload, Trash2, Star, Images, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ImageUploader } from '@/components/marketplace/image-uploader';

interface ImageData {
  id: string;
  storagePath: string;
  isPrimary: boolean;
  sortOrder: number;
  publicUrl: string;
}

interface ImageGalleryProps {
  productId: string;
  canonicalProductId?: string;
  className?: string;
}

export function ImageGallery({
  productId,
  canonicalProductId,
  className,
}: ImageGalleryProps) {
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'gallery' | 'upload'>('gallery');
  const [error, setError] = useState<string | null>(null);
  const [aiDiscovering, setAiDiscovering] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState<any>(null);

  // Fetch images
  const fetchImages = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/products/${productId}/images`);

      if (!response.ok) {
        throw new Error('Failed to fetch images');
      }

      const result = await response.json();
      setImages(result.data.images || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load images');
    } finally {
      setLoading(false);
    }
  };

  // Fetch AI discovery status
  const fetchDiscoveryStatus = async () => {
    if (!canonicalProductId) return;

    try {
      const response = await fetch(
        `/api/images/discovery-status?canonicalProductId=${canonicalProductId}`
      );

      if (response.ok) {
        const result = await response.json();
        setDiscoveryStatus(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch discovery status:', err);
    }
  };

  useEffect(() => {
    fetchImages();
    fetchDiscoveryStatus();
  }, [productId, canonicalProductId]);

  // Set primary image
  const setPrimaryImage = async (imageId: string) => {
    try {
      const response = await fetch(`/api/products/${productId}/images`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_primary',
          imageId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to set primary image');
      }

      await fetchImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update image');
    }
  };

  // Delete image
  const deleteImage = async (imageId: string) => {
    if (!confirm('Are you sure you want to delete this image?')) {
      return;
    }

    try {
      const response = await fetch(
        `/api/products/${productId}/images?imageId=${imageId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete image');
      }

      await fetchImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete image');
    }
  };

  // Handle upload complete
  const handleUploadComplete = () => {
    fetchImages();
    setActiveTab('gallery'); // Switch back to gallery tab
  };

  // Trigger AI discovery
  const triggerAiDiscovery = async () => {
    if (!canonicalProductId) return;

    setAiDiscovering(true);
    setError(null);

    try {
      const response = await fetch('/api/images/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalProductId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'AI discovery failed');
      }

      const result = await response.json();

      if (result.skipped) {
        setError('Product already has images');
      } else {
        // Refresh images after AI discovery
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for processing
        await fetchImages();
        await fetchDiscoveryStatus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI discovery failed');
    } finally {
      setAiDiscovering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (!canonicalProductId) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
        <p className="text-sm text-yellow-800">
          This product needs to be matched to the canonical catalog before you can manage
          images.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Tabs */}
      <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit mb-6 flex-shrink-0">
        <button
          onClick={() => setActiveTab('gallery')}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
            activeTab === 'gallery'
              ? "text-gray-800 bg-white shadow-sm"
              : "text-gray-600 hover:bg-gray-200/70"
          )}
        >
          <Images size={15} />
          Gallery {images.length > 0 && `(${images.length})`}
        </button>
        <button
          onClick={() => setActiveTab('upload')}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
            activeTab === 'upload'
              ? "text-gray-800 bg-white shadow-sm"
              : "text-gray-600 hover:bg-gray-200/70"
          )}
        >
          <Upload size={15} />
          Upload
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* AI Discovery Status Banner */}
      {discoveryStatus?.queueStatus && discoveryStatus.queueStatus.status === 'processing' && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900">AI is discovering images...</p>
            <p className="text-xs text-blue-700 mt-0.5">
              This may take 1-2 minutes. Images will appear automatically when ready.
            </p>
          </div>
        </div>
      )}

      {discoveryStatus?.queueStatus && discoveryStatus.queueStatus.status === 'failed' && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900">AI discovery failed</p>
            <p className="text-xs text-red-700 mt-0.5">
              {discoveryStatus.queueStatus.errorMessage || 'Could not find suitable images'}
            </p>
          </div>
          <Button
            onClick={triggerAiDiscovery}
            disabled={aiDiscovering}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Retry
          </Button>
        </div>
      )}

      {/* Tab Content - Fixed height container */}
      <div className="flex-1 min-h-0">
        {activeTab === 'gallery' ? (
          <div className="h-full flex flex-col">
            {/* Images grid */}
            {images.length === 0 ? (
              <div className="border-2 border-dashed border-gray-300 rounded-md p-16 text-center bg-white flex-1 flex flex-col items-center justify-center">
                <ImageIcon className="h-16 w-16 text-gray-400 mb-4" />
                <p className="text-base font-medium text-gray-700 mb-2">No images yet</p>
                <p className="text-sm text-gray-500 mb-6">
                  Upload images manually or let AI find them for you
                </p>
                <div className="flex gap-3">
                  <Button 
                    onClick={triggerAiDiscovery}
                    disabled={aiDiscovering}
                    className="gap-2"
                  >
                    {aiDiscovering ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Discovering...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Find Images with AI
                      </>
                    )}
                  </Button>
                  <Button onClick={() => setActiveTab('upload')} variant="outline" className="gap-2">
                    <Upload className="h-4 w-4" />
                    Upload Manually
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-8 pb-4">
              {images.map((image) => (
                <div
                  key={image.id}
                  className={cn(
                    'relative group rounded-md overflow-hidden border-2 transition-all cursor-pointer',
                    image.isPrimary
                      ? 'border-blue-500 shadow-lg'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                  )}
                >
                  {/* Image */}
                  <div className="aspect-square relative bg-gray-100">
                    <img
                      src={image.publicUrl}
                      alt="Product"
                      className="w-full h-full object-contain p-2"
                    />

                    {/* Primary badge */}
                    {image.isPrimary && (
                      <div className="absolute top-3 left-3 bg-blue-500 text-white text-sm px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 shadow-lg">
                        <Star className="h-4 w-4 fill-current" />
                        Primary
                      </div>
                    )}

                    {/* Actions overlay */}
                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
                      {!image.isPrimary && (
                        <Button
                          onClick={() => setPrimaryImage(image.id)}
                          size="default"
                          variant="secondary"
                          className="gap-2 shadow-lg"
                        >
                          <Star className="h-4 w-4" />
                          Set as Primary
                        </Button>
                      )}

                      <Button
                        onClick={() => deleteImage(image.id)}
                        size="default"
                        variant="destructive"
                        className="gap-2 shadow-lg"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Image
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Helper text */}
          <div className="mt-6 text-xs text-gray-500 space-y-1 bg-gray-50 rounded-md p-3 flex-shrink-0">
            <p>• Click "Set Primary" to change the main product image</p>
            <p>• Images are shared across all stores selling this product</p>
            <p>• Supported formats: JPEG, PNG, WebP up to 10MB</p>
          </div>
        </div>
      ) : (
        <div className="h-full flex flex-col">
          {/* Upload Tab */}
          <div className="flex-1 min-h-0">
            <ImageUploader
              canonicalProductId={canonicalProductId!}
              onUploadComplete={handleUploadComplete}
              onUploadError={(err) => setError(err)}
              maxFiles={10}
            />
          </div>
          
          <div className="mt-4 flex-shrink-0">
            <Button 
              onClick={() => setActiveTab('gallery')} 
              variant="outline"
              className="w-full"
            >
              Back to Gallery
            </Button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

