'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, CheckCircle2, XCircle, Sparkles, Star, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

interface ProductImage {
  id: string;
  storage_path: string | null;
  external_url: string | null;
  is_downloaded: boolean;
  url: string;
  is_primary: boolean;
  approval_status: 'pending' | 'approved' | 'rejected';
  width: number;
  height: number;
  created_at: string;
  cloudinary_url: string | null;
  thumbnail_url: string | null;
  card_url: string | null;
  detail_url: string | null;
}

interface ImageDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  onComplete?: () => void;
}

export function ImageDiscoveryModal({
  isOpen,
  onClose,
  productId,
  productName,
  onComplete,
}: ImageDiscoveryModalProps) {
  const [images, setImages] = React.useState<ProductImage[]>([]);
  const [discovering, setDiscovering] = React.useState(false);
  const [aiApproving, setAiApproving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const supabase = createClient();

  // Load existing images when modal opens
  React.useEffect(() => {
    if (isOpen) {
      loadImages();
    }
  }, [isOpen, productId]);

  const loadImages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_images')
        .select('*')
        .eq('canonical_product_id', productId)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('[IMAGE DISCOVERY] Error loading images:', error);
        return;
      }

      const mappedImages: ProductImage[] = (data || []).map(img => ({
        id: img.id,
        storage_path: img.storage_path,
        external_url: img.external_url,
        is_downloaded: img.is_downloaded,
        url: img.is_downloaded && img.storage_path
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${img.storage_path}`
          : img.external_url || '',
        is_primary: img.is_primary,
        approval_status: img.approval_status,
        width: img.width,
        height: img.height,
        created_at: img.created_at,
        cloudinary_url: img.cloudinary_url,
        thumbnail_url: img.thumbnail_url,
        card_url: img.card_url,
        detail_url: img.detail_url,
      }));

      setImages(mappedImages);
    } catch (error) {
      console.error('[IMAGE DISCOVERY] Failed to load images:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDiscoverImages = async () => {
    setDiscovering(true);
    try {
      console.log(`[IMAGE DISCOVERY] Discovering images for product ${productId}`);

      const response = await fetch('/api/admin/images/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalProductId: productId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to discover images');
      }

      console.log(`[IMAGE DISCOVERY] ✅ Discovered ${result.data?.imagesSaved || 0} images`);

      // Reload images to show newly discovered ones
      await loadImages();
    } catch (error) {
      console.error('[IMAGE DISCOVERY] Error:', error);
      alert(`Failed to discover images: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDiscovering(false);
    }
  };

  const handleAIAutoApprove = async () => {
    setAiApproving(true);
    try {
      console.log(`[AI AUTO-APPROVE] Starting AI auto-approval for product ${productId}`);

      const response = await fetch('/api/admin/images/ai-auto-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalProductId: productId }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.message || 'Failed to auto-approve images');
      }

      console.log(`[AI AUTO-APPROVE] ✅ AI selected and approved ${result.data?.imagesSaved || 0} images`);
      console.log(`[AI AUTO-APPROVE] Reasoning: ${result.data?.aiReasoning}`);

      // Show success message
      alert(`Success! AI selected ${result.data?.imagesSaved || 0} best images and set them as approved. Primary image has been automatically selected.`);

      // Reload images to show AI-approved ones
      await loadImages();
      
      // Optionally close modal since images are already approved
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error('[AI AUTO-APPROVE] Error:', error);
      alert(`AI auto-approval failed: ${error instanceof Error ? error.message : 'Unknown error'}\n\nTry manual discovery instead.`);
    } finally {
      setAiApproving(false);
    }
  };

  // Handle image click - cycle through approval statuses
  const handleImageClick = async (imageId: string, currentStatus: string, isDownloaded: boolean) => {
    console.log(`[CLICK] Image ${imageId} current status: ${currentStatus}`);

    // Cycle: pending -> approved, approved -> rejected, rejected -> pending
    let newStatus: 'pending' | 'approved' | 'rejected';
    if (currentStatus === 'pending') {
      newStatus = 'approved';
    } else if (currentStatus === 'approved') {
      newStatus = 'rejected';
    } else {
      newStatus = 'pending';
    }

    // Optimistic update
    setImages(prev =>
      prev.map(img =>
        img.id === imageId ? { ...img, approval_status: newStatus } : img
      )
    );

    // Update in database
    try {
      const { error } = await supabase
        .from('product_images')
        .update({ approval_status: newStatus })
        .eq('id', imageId);

      if (error) {
        console.error('[CLICK] Failed to update:', error);
        alert(`Failed to update image: ${error.message}`);
        await loadImages(); // Revert only on error
        return;
      }

      // If approving and not downloaded, trigger background download (no reload)
      if (newStatus === 'approved' && !isDownloaded) {
        fetch('/api/admin/images/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageId }),
        })
          .then(res => res.json())
          .then(result => {
            if (result.success) {
              console.log(`[DOWNLOAD] ✅ Downloaded ${imageId}`);
              // Update the image to show it's downloaded without full reload
              setImages(prev =>
                prev.map(img =>
                  img.id === imageId ? { ...img, is_downloaded: true } : img
                )
              );
            }
          })
          .catch(err => console.error('[DOWNLOAD] Error:', err));
      }
    } catch (error) {
      console.error('[CLICK] Exception:', error);
      await loadImages();
    }
  };

  // Handle setting primary image
  const handleSetPrimary = async (imageId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // Optimistic update
    setImages(prev =>
      prev.map(img => ({
        ...img,
        is_primary: img.id === imageId,
      }))
    );

    try {
      // Unset all primary images
      await supabase
        .from('product_images')
        .update({ is_primary: false })
        .eq('canonical_product_id', productId);

      // Set this image as primary
      const { error } = await supabase
        .from('product_images')
        .update({ is_primary: true })
        .eq('id', imageId);

      if (error) {
        console.error('[SET PRIMARY] Failed:', error);
        alert(`Failed to set primary: ${error.message}`);
        await loadImages(); // Only reload on error
      } else {
        console.log(`[SET PRIMARY] ✅ Set image ${imageId} as primary`);
      }
    } catch (error) {
      console.error('[SET PRIMARY] Exception:', error);
      await loadImages();
    }
  };

  // Handle mark as complete
  const handleMarkComplete = async () => {
    const approvedImages = images.filter(img => img.approval_status === 'approved');
    const hasPrimary = approvedImages.some(img => img.is_primary);
    const nonApprovedImageIds = images
      .filter(img => img.approval_status !== 'approved')
      .map(img => img.id);

    // Validation
    if (approvedImages.length === 0) {
      alert('Please approve at least one image before marking as complete');
      return;
    }

    if (!hasPrimary) {
      alert('Please select a primary image (click the ⭐ star) before marking as complete');
      return;
    }

    const confirmMsg = nonApprovedImageIds.length > 0
      ? `Mark as complete? This will DELETE ${nonApprovedImageIds.length} non-approved images permanently. Only ${approvedImages.length} approved images will remain.`
      : `Mark as complete? This product has ${approvedImages.length} approved images.`;

    if (!confirm(confirmMsg)) {
      return;
    }

    try {
      // Delete non-approved images
      if (nonApprovedImageIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('product_images')
          .delete()
          .in('id', nonApprovedImageIds);

        if (deleteError) {
          console.error('[COMPLETE] Failed to delete images:', deleteError);
          alert(`Failed to delete images: ${deleteError.message}`);
          return;
        }
      }

      console.log(`[COMPLETE] ✅ Successfully completed product ${productId}`);
      
      if (onComplete) {
        onComplete();
      }
      
      onClose();
    } catch (error) {
      console.error('[COMPLETE] Exception:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (!isOpen) return null;

  const approvedCount = images.filter(img => img.approval_status === 'approved').length;
  const hasPrimary = images.some(img => img.is_primary && img.approval_status === 'approved');

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-md w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="border-b border-gray-200 p-4 flex items-center justify-between bg-white">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{productName}</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm text-gray-600">
                  {approvedCount} approved
                </span>
                {hasPrimary ? (
                  <span className="text-sm font-medium text-yellow-600 flex items-center gap-1">
                    <Star className="h-4 w-4 fill-current" />
                    Primary set ✓
                  </span>
                ) : approvedCount > 0 ? (
                  <span className="text-sm font-medium text-orange-600">
                    ⚠️ Please set a primary image
                  </span>
                ) : null}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Actions */}
          <div className="border-b border-gray-200 p-4 flex items-center gap-3 bg-gray-50">
            <Button
              onClick={handleDiscoverImages}
              disabled={discovering || aiApproving}
              variant="outline"
              className="gap-2"
            >
              {discovering ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Discovering...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Discover (Manual Review)
                </>
              )}
            </Button>

            <Button
              onClick={handleAIAutoApprove}
              disabled={aiApproving || discovering}
              variant="default"
              className="gap-2 bg-purple-600 hover:bg-purple-700"
            >
              {aiApproving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  AI Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  AI Auto-Approve
                </>
              )}
            </Button>

            <Button
              onClick={handleMarkComplete}
              disabled={approvedCount === 0 || !hasPrimary}
              variant={approvedCount > 0 && hasPrimary ? "default" : "outline"}
              className={cn(
                approvedCount > 0 && hasPrimary && "bg-green-600 hover:bg-green-700"
              )}
            >
              {approvedCount === 0 ? (
                'Mark Complete (approve at least 1)'
              ) : !hasPrimary ? (
                'Mark Complete (set primary first)'
              ) : (
                `✓ Mark Complete (${approvedCount} images)`
              )}
            </Button>
          </div>

          {/* Images Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : images.length === 0 ? (
              <div className="text-center py-12">
                <div className="space-y-3">
                  <p className="text-gray-600 font-medium">No images yet</p>
                  <p className="text-sm text-gray-500">Choose an option:</p>
                  <div className="flex flex-col gap-2 max-w-md mx-auto text-sm text-left">
                    <div className="bg-purple-50 border border-purple-200 rounded-md p-3">
                      <p className="font-semibold text-purple-900">AI Auto-Approve (Recommended)</p>
                      <p className="text-purple-700 text-xs mt-1">AI finds, analyses, and selects the best images automatically</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                      <p className="font-semibold text-gray-900">Discover (Manual Review)</p>
                      <p className="text-gray-600 text-xs mt-1">Find images and manually approve each one</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {images.map((image) => (
                  <div
                    key={image.id}
                    className={cn(
                      'relative aspect-square rounded-md overflow-hidden transition-all',
                      'border-4',
                      image.is_primary && image.approval_status === 'approved' && 'border-yellow-400 shadow-lg shadow-yellow-200',
                      !image.is_primary && image.approval_status === 'approved' && 'border-green-500',
                      image.approval_status === 'rejected' && 'border-red-500 opacity-50',
                      image.approval_status === 'pending' && 'border-yellow-500'
                    )}
                  >
                    {/* Image */}
                    <div 
                      onClick={() => handleImageClick(image.id, image.approval_status, image.is_downloaded)}
                      className="w-full h-full cursor-pointer group relative"
                    >
                      <img
                        src={image.url}
                        alt=""
                        className="w-full h-full object-cover"
                      />

                      {/* Click hint overlay */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 px-3 py-1.5 rounded-md">
                          {image.approval_status === 'pending' && 'Click to Approve'}
                          {image.approval_status === 'approved' && 'Click to Reject'}
                          {image.approval_status === 'rejected' && 'Click to Restore'}
                        </span>
                      </div>
                    </div>

                    {/* Primary Badge - Large and Clear */}
                    {image.is_primary && image.approval_status === 'approved' && (
                      <div className="absolute top-0 left-0 right-0 bg-yellow-400 text-yellow-900 text-xs font-bold py-1 text-center">
                        ⭐ PRIMARY IMAGE
                      </div>
                    )}

                    {/* Status Badge */}
                    <div className="absolute top-2 right-2">
                      {image.approval_status === 'approved' && !image.is_primary && (
                        <CheckCircle2 className="h-6 w-6 text-green-500 bg-white rounded-full" />
                      )}
                      {image.approval_status === 'rejected' && (
                        <XCircle className="h-6 w-6 text-red-500 bg-white rounded-full" />
                      )}
                      {image.approval_status === 'pending' && (
                        <div className="h-6 w-6 bg-yellow-500 rounded-full border-2 border-white" />
                      )}
                    </div>

                    {/* Download indicator - Above the button */}
                    {!image.is_downloaded && image.approval_status === 'approved' && (
                      <div className="absolute bottom-10 left-2 bg-blue-500 text-white px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 shadow-lg">
                        <Download className="h-3 w-3" />
                        Downloading...
                      </div>
                    )}

                    {/* Set as Primary Button - Only show for approved images */}
                    {image.approval_status === 'approved' && !image.is_primary && (
                      <button
                        onClick={(e) => handleSetPrimary(image.id, e)}
                        className="absolute bottom-0 left-0 right-0 bg-white/95 hover:bg-yellow-400 text-gray-700 hover:text-yellow-900 text-xs font-bold py-2.5 transition-all flex items-center justify-center gap-1.5 border-t-2 border-gray-200"
                      >
                        <Star className="h-4 w-4" />
                        Set as Primary
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Instructions */}
          <div className="border-t border-gray-200 p-4 bg-white">
            <div className="flex items-start gap-3">
              <div className="flex-1 text-sm text-gray-700">
                <p className="font-semibold text-gray-900 mb-2">How to use:</p>
                <div className="space-y-1.5">
                  <p>1. <strong>Click images</strong> to cycle: Pending → Approved → Rejected</p>
                  <p>2. <strong>Click "Set as Primary"</strong> on your best image (appears on product cards)</p>
                  <p>3. <strong>Click "Mark Complete"</strong> when done - non-approved images will be deleted</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-4 border-yellow-500 rounded"></div>
                  <span className="text-gray-600">Pending</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-4 border-green-500 rounded"></div>
                  <span className="text-gray-600">Approved</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-4 border-yellow-400 rounded bg-yellow-50"></div>
                  <span className="text-gray-600">Primary</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

