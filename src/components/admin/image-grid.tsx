'use client';

import { useState } from 'react';
import { CheckCircle2, Circle, Star, Trash2, ZoomIn, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

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

interface ImageGridProps {
  images: ProductImage[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  canSelectMore: boolean;
  showApprovalStatus?: boolean;
}

export function ImageGrid({
  images,
  selectedIds,
  onSelectionChange,
  canSelectMore,
  showApprovalStatus = false,
}: ImageGridProps) {
  const [hoveredImageId, setHoveredImageId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<ProductImage | null>(null);

  const toggleSelection = (imageId: string) => {
    if (selectedIds.includes(imageId)) {
      // Deselect
      onSelectionChange(selectedIds.filter(id => id !== imageId));
    } else {
      // Select if allowed
      if (canSelectMore) {
        onSelectionChange([...selectedIds, imageId]);
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        {images.map((image) => {
          const isSelected = selectedIds.includes(image.id);
          const isHovered = hoveredImageId === image.id;

          return (
            <motion.div
              key={image.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'relative group bg-gray-100 rounded-md overflow-hidden border-2 transition-all cursor-pointer',
                isSelected
                  ? 'border-blue-500 shadow-lg'
                  : 'border-transparent hover:border-gray-300'
              )}
              onMouseEnter={() => setHoveredImageId(image.id)}
              onMouseLeave={() => setHoveredImageId(null)}
              onClick={() => toggleSelection(image.id)}
            >
              {/* Image */}
              <div className="aspect-square relative">
                <img
                  src={image.url}
                  alt="Product"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />

                {/* Overlay on hover */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: isHovered ? 1 : 0 }}
                  className="absolute inset-0 bg-black/50 flex items-center justify-center"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewImage(image);
                    }}
                    className="p-2 bg-white rounded-md hover:bg-gray-100 transition-colors"
                  >
                    <ZoomIn className="h-5 w-5 text-gray-700" />
                  </button>
                </motion.div>
              </div>

              {/* Selection Checkbox */}
              <div className="absolute top-2 left-2">
                {isSelected ? (
                  <CheckCircle2 className="h-6 w-6 text-blue-500 drop-shadow-lg" />
                ) : (
                  <Circle
                    className={cn(
                      'h-6 w-6 text-white drop-shadow-lg',
                      !canSelectMore && 'opacity-50'
                    )}
                  />
                )}
              </div>

              {/* Primary Badge */}
              {image.is_primary && (
                <div className="absolute top-2 right-2">
                  <div className="bg-yellow-400 text-yellow-900 px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1">
                    <Star className="h-3 w-3" />
                    Primary
                  </div>
                </div>
              )}

              {/* Approval Status Badge */}
              {showApprovalStatus && (
                <div className="absolute bottom-2 left-2">
                  <div className={cn(
                    'px-2 py-1 rounded-md text-xs font-medium',
                    image.approval_status === 'pending' && 'bg-orange-100 text-orange-800',
                    image.approval_status === 'approved' && 'bg-green-100 text-green-800',
                    image.approval_status === 'rejected' && 'bg-red-100 text-red-800'
                  )}>
                    {image.approval_status}
                  </div>
                </div>
              )}

              {/* Metadata on hover */}
              {isHovered && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
                  <div className="text-white text-xs space-y-1">
                    <div>{image.width} × {image.height}</div>
                    <div>{formatFileSize(image.file_size)}</div>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-8"
          onClick={() => setPreviewImage(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative max-w-5xl max-h-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300"
            >
              <span className="text-sm">Press ESC or click outside to close</span>
            </button>

            {/* Image */}
            <img
              src={previewImage.url}
              alt="Preview"
              className="max-w-full max-h-[80vh] object-contain rounded-md"
            />

            {/* Metadata */}
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur-sm p-4 rounded-b-md">
              <div className="grid grid-cols-4 gap-4 text-white text-sm">
                <div>
                  <div className="text-gray-300 text-xs mb-1">Dimensions</div>
                  <div className="font-medium">{previewImage.width} × {previewImage.height}</div>
                </div>
                <div>
                  <div className="text-gray-300 text-xs mb-1">File Size</div>
                  <div className="font-medium">{formatFileSize(previewImage.file_size)}</div>
                </div>
                <div>
                  <div className="text-gray-300 text-xs mb-1">Status</div>
                  <div className="font-medium capitalize">{previewImage.approval_status}</div>
                </div>
                <div>
                  <div className="text-gray-300 text-xs mb-1">Primary</div>
                  <div className="font-medium">{previewImage.is_primary ? 'Yes' : 'No'}</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}







