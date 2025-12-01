'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle2, XCircle, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ImageGrid } from './image-grid';

interface Product {
  id: string;
  normalized_name: string;
  upc: string | null;
  category: string | null;
  manufacturer: string | null;
}

interface ProductImage {
  id: string;
  storage_path: string;
  url: string;
  is_primary: boolean;
  approval_status: 'pending' | 'approved' | 'rejected';
  width: number;
  height: number;
  file_size: number;
  created_at: string;
}

interface ImageReviewModalProps {
  product: Product;
  onClose: () => void;
}

export function ImageReviewModal({ product, onClose }: ImageReviewModalProps) {
  const [images, setImages] = useState<{
    pending: ProductImage[];
    approved: ProductImage[];
    rejected: ProductImage[];
  }>({ pending: [], approved: [], rejected: [] });
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([]);
  const [selectedApprovedIds, setSelectedApprovedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [approving, setApproving] = useState(false);

  const fetchImages = async () => {
    setLoading(true);
    try {
      console.log('[FETCH IMAGES] Product object:', product);
      console.log('[FETCH IMAGES] Fetching images for product ID:', product.id);
      
      const response = await fetch(`/api/admin/images/product/${product.id}`);
      console.log('[FETCH IMAGES] Response status:', response.status);
      console.log('[FETCH IMAGES] Response URL:', response.url);
      
      const result = await response.json();
      console.log('[FETCH IMAGES] Result:', result);

      if (result.success) {
        setImages(result.data.images);
        console.log('[FETCH IMAGES] Loaded images:', {
          pending: result.data.images.pending.length,
          approved: result.data.images.approved.length,
          rejected: result.data.images.rejected.length,
        });
      } else {
        console.error('[FETCH IMAGES] Failed:', result.error);
        console.error('[FETCH IMAGES] This usually means the product ID is invalid or the product was deleted');
      }
    } catch (error) {
      console.error('[FETCH IMAGES] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();

    // Set up real-time subscription for image updates
    const channel = (window as any).supabase?.channel(`product-images-${product.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'product_images',
          filter: `canonical_product_id=eq.${product.id}`,
        },
        () => {
          fetchImages();
        }
      )
      .subscribe();

    return () => {
      channel?.unsubscribe();
    };
  }, [product.id]);

  const totalSelected = selectedPendingIds.length + selectedApprovedIds.length;
  const maxAllowed = 5;
  const canSelectMore = totalSelected < maxAllowed;

  const handleDiscoverImages = async () => {
    setDiscovering(true);
    console.log('[DISCOVER] Starting image discovery for product:', product.id);
    
    try {
      const response = await fetch('/api/admin/images/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalProductId: product.id }),
      });

      console.log('[DISCOVER] Response status:', response.status);
      const result = await response.json();
      console.log('[DISCOVER] Result:', result);

      if (result.success) {
        console.log('[DISCOVER] Discovery queued successfully');
        alert('Image discovery started! New images should appear in 30-60 seconds. Watch the console for progress.');
        
        // Poll for updates every 3 seconds for 2 minutes
        let pollCount = 0;
        const maxPolls = 40; // 2 minutes
        const pollInterval = setInterval(() => {
          pollCount++;
          console.log(`[DISCOVER] Polling for updates (${pollCount}/${maxPolls})...`);
          fetchImages();
          
          if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            console.log('[DISCOVER] Stopped polling');
          }
        }, 3000);
      } else {
        console.error('[DISCOVER] Discovery failed:', result.error);
        alert(`Failed to discover images: ${result.error}`);
      }
    } catch (error) {
      console.error('[DISCOVER] Failed to discover images:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDiscovering(false);
    }
  };

  const handleApprove = async () => {
    if (totalSelected === 0 || totalSelected > maxAllowed) {
      return;
    }

    setApproving(true);
    try {
      const allApproveIds = [...selectedPendingIds, ...selectedApprovedIds];

      const response = await fetch('/api/admin/images/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonicalProductId: product.id,
          approveImageIds: allApproveIds,
          rejectPendingImages: true,
        }),
      });

      const result = await response.json();

      if (result.success) {
        await fetchImages();
        setSelectedPendingIds([]);
        setSelectedApprovedIds([]);
      } else {
        alert(result.error || 'Failed to approve images');
      }
    } catch (error) {
      console.error('Failed to approve images:', error);
      alert('Failed to approve images');
    } finally {
      setApproving(false);
    }
  };

  const handleRejectAll = async () => {
    if (!confirm('Are you sure you want to reject all pending images?')) {
      return;
    }

    try {
      const response = await fetch('/api/admin/images/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonicalProductId: product.id,
          approveImageIds: [],
          rejectPendingImages: true,
        }),
      });

      if (response.ok) {
        await fetchImages();
        setSelectedPendingIds([]);
      }
    } catch (error) {
      console.error('Failed to reject images:', error);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        {/* Overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/50"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative min-h-screen flex items-start justify-center p-4 pt-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="relative bg-white rounded-md shadow-xl w-full max-w-6xl"
          >
            {/* Header */}
            <div className="border-b border-gray-200 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{product.normalized_name}</h2>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                    {product.upc && <span>UPC: {product.upc}</span>}
                    {product.category && <span>• {product.category}</span>}
                    {product.manufacturer && <span>• {product.manufacturer}</span>}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Selection Counter */}
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-medium text-gray-900">
                    {totalSelected} of {maxAllowed} selected
                  </span>
                  {totalSelected > maxAllowed && (
                    <span className="text-red-600 ml-2">
                      (Maximum {maxAllowed} images allowed)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleDiscoverImages}
                    disabled={discovering}
                    variant="outline"
                    className="rounded-md"
                  >
                    {discovering ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Discovering...
                      </>
                    ) : (
                      <>
                        <ImagePlus className="h-4 w-4 mr-2" />
                        Find More Images
                      </>
                    )}
                  </Button>

                  {images.pending.length > 0 && (
                    <Button
                      onClick={handleRejectAll}
                      variant="outline"
                      className="rounded-md text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject All Pending
                    </Button>
                  )}

                  <Button
                    onClick={handleApprove}
                    disabled={totalSelected === 0 || totalSelected > maxAllowed || approving}
                    className="rounded-md"
                  >
                    {approving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Approving...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Approve Selected
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {loading ? (
                <div className="text-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">Loading images...</p>
                </div>
              ) : (
                <>
                  {/* Approved Images */}
                  {images.approved.length > 0 && (
                    <div className="mb-8">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        Approved Images ({images.approved.length})
                      </h3>
                      <ImageGrid
                        images={images.approved}
                        selectedIds={selectedApprovedIds}
                        onSelectionChange={setSelectedApprovedIds}
                        canSelectMore={canSelectMore}
                        showApprovalStatus={false}
                      />
                    </div>
                  )}

                  {/* Pending Images */}
                  {images.pending.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        Discovered Images ({images.pending.length})
                      </h3>
                      <ImageGrid
                        images={images.pending}
                        selectedIds={selectedPendingIds}
                        onSelectionChange={setSelectedPendingIds}
                        canSelectMore={canSelectMore}
                        showApprovalStatus={true}
                      />
                    </div>
                  )}

                  {images.approved.length === 0 && images.pending.length === 0 && (
                    <div className="text-center py-12 bg-gray-50 rounded-md">
                      <ImagePlus className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600 mb-4">No images found for this product</p>
                      <Button onClick={handleDiscoverImages} disabled={discovering} className="rounded-md">
                        {discovering ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Discovering...
                          </>
                        ) : (
                          <>
                            <ImagePlus className="h-4 w-4 mr-2" />
                            Discover Images with AI
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}

