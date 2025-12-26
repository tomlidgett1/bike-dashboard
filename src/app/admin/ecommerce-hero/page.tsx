'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Search, 
  Loader2, 
  Image as ImageIcon, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw,
  Sparkles,
  X,
  ChevronLeft,
  ChevronRight,
  Store,
  Package,
  Trash2,
  Eye,
  EyeOff,
  GripVertical,
  Flag,
  Plus,
  ExternalLink,
  Download,
  Globe,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

// ============================================================
// Types
// ============================================================

interface ProductImage {
  id: string;
  url: string;
  cardUrl?: string;
  thumbnailUrl?: string;
  galleryUrl?: string;
  detailUrl?: string;
  isPrimary: boolean;
  isAiGenerated?: boolean;
  sortOrder: number;
  source: 'product_images' | 'jsonb' | 'canonical';
  isInJsonb?: boolean; // True if this image is in the products.images JSONB
  isOnProductPage?: boolean; // True if this image is visible on the product page
}

interface Product {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  listingType: string | null;
  isActive: boolean;
  cachedImageUrl: string | null;
  cachedThumbnailUrl: string | null;
  primaryImageUrl: string | null; // Fallback image URL for product page
  hasJsonbImages: boolean; // True if product has JSONB images
  hasDisplayableImage: boolean;
  heroBackgroundOptimized: boolean;
  imagesApprovedByAdmin: boolean;
  imagesApprovedAt: string | null;
  needsSecondaryReview: boolean;
  secondaryReviewFlaggedAt: string | null;
  price: number | null;
  qoh: number | null;
  createdAt: string;
  userId: string;
  storeName: string;
  // Separated image sources for management
  dbImages: ProductImage[];
  jsonbImages: ProductImage[];
  dbImageCount: number;
  jsonbImageCount: number;
  // Combined for backwards compatibility
  images: ProductImage[];
  imageCount: number;
}

interface QueueItem {
  id: string;
  productId: string;
  sourceImageUrl: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resultCardUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    brand: string | null;
  } | null;
}

interface QueueCounts {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

interface FilterOptions {
  brands: string[];
  stores: Array<{ id: string; name: string; productCount: number }>;
}

interface SearchImageResult {
  id: string;
  url: string;
  thumbnailUrl: string;
  title: string;
  source: string;
  domain: string;
  width: number;
  height: number;
}

// Bulk Review Types
interface BulkReviewProduct {
  id: string;
  name: string;
  brand: string | null;
  storeName: string;
  currentImageUrl: string | null;
  existingImages: SearchImageResult[]; // Images already on the product
  heroImageId: string | null; // ID of the current hero image
  searchResults: SearchImageResult[];
  excludedImageIds: Set<string>; // Images the user doesn't want
  selectedImage: SearchImageResult | null;
  status: 'pending' | 'searching' | 'ready' | 'approved' | 'skipped' | 'error';
  errorMessage?: string;
  aiStatus?: 'idle' | 'processing' | 'ready' | 'error'; // Track AI generation
  aiGeneratedImage?: SearchImageResult; // The AI-optimized image once complete
  aiError?: string;
  // Approval status from database
  imagesApprovedByAdmin: boolean;
  hasDisplayableImage: boolean;
}

type MainTab = 'products' | 'bulk-review';

// ============================================================
// Sortable Image Card Component
// ============================================================

interface SortableImageCardProps {
  image: ProductImage;
  index: number;
  isVisible: boolean;
  isLocked: boolean; // Primary image is locked
  isCurrentHero: boolean; // This image is the current cached_image_url
  productId: string;
  isAdding: boolean;
  isSetting: boolean;
  isQueued: boolean;
  isRemoving: boolean;
  isTogglingVisibility: boolean;
  onSetAsHero: () => void;
  onAddToQueue: () => void;
  onRemove: () => void;
  onToggleVisibility: () => void;
}

function SortableImageCard({
  image,
  index,
  isVisible,
  isLocked,
  isCurrentHero,
  productId,
  isAdding,
  isSetting,
  isQueued,
  isRemoving,
  isTogglingVisibility,
  onSetAsHero,
  onAddToQueue,
  onRemove,
  onToggleVisibility,
}: SortableImageCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: image.id,
    disabled: isLocked,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1000 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative bg-white rounded-md border-2 overflow-hidden transition-all",
        isCurrentHero && "border-purple-500 ring-2 ring-purple-200",
        !isCurrentHero && isVisible && "border-green-400",
        !isCurrentHero && !isVisible && "border-gray-200",
        isDragging && "shadow-lg opacity-50"
      )}
    >
      {/* Image with drag handle */}
      <div className="aspect-square bg-gray-100 relative">
        <img
          src={image.cardUrl || image.url}
          alt="Product image"
          className={cn(
            "w-full h-full object-cover transition-all",
            !isVisible && "grayscale"
          )}
        />
        
        {/* Gray overlay for hidden images */}
        {!isVisible && (
          <div className="absolute inset-0 bg-gray-500/40 flex items-center justify-center">
            <div className="bg-white/90 rounded-md px-3 py-1.5 shadow">
              <span className="text-sm font-medium text-gray-600">Hidden</span>
            </div>
          </div>
        )}
        
        {/* Drag handle overlay - only show on visible images or when not hidden overlay */}
        {!isLocked && isVisible && (
          <div
            {...attributes}
            {...listeners}
            className="absolute inset-0 cursor-grab active:cursor-grabbing flex items-center justify-center bg-black/0 hover:bg-black/10 transition-colors group"
          >
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-md p-2 shadow">
              <GripVertical className="h-5 w-5 text-gray-600" />
            </div>
          </div>
        )}
      </div>

      {/* Badges - simplified */}
      <div className="absolute top-2 left-2 flex flex-col gap-1">
        {/* HERO badge */}
        {isCurrentHero && (
          <div className="bg-purple-600 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1 font-bold shadow-md">
            <ImageIcon className="h-3 w-3" />
            HERO
          </div>
        )}
        {/* AI badge */}
        {image.isAiGenerated && (
          <div className="bg-emerald-500 text-white text-xs px-2 py-0.5 rounded-md flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            AI
          </div>
        )}
      </div>

      {/* Position number */}
      <div className="absolute top-2 right-2">
        <div className="bg-gray-800 text-white text-xs px-1.5 py-0.5 rounded-md">
          #{index + 1}
        </div>
      </div>

      {/* Action buttons */}
      <div className="p-2 space-y-1.5">
        {/* Set as Hero button - show for any image that's NOT the current hero */}
        {!isCurrentHero && (
          <Button
            size="sm"
            className="w-full h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white"
            onClick={onSetAsHero}
            disabled={isSetting}
          >
            {isSetting ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                Setting...
              </>
            ) : (
              <>
                <ImageIcon className="h-3 w-3 mr-1" />
                Set as Hero
              </>
            )}
          </Button>
        )}
        {/* Already hero indicator */}
        {isCurrentHero && (
          <div className="w-full h-8 text-xs bg-purple-100 text-purple-700 rounded-md flex items-center justify-center font-medium">
            ✓ Current Hero
          </div>
        )}

        {/* Show/Hide toggle - simplified */}
        {isVisible ? (
        <Button
          size="sm"
          variant="outline"
            className="w-full h-7 text-xs border-gray-200 text-gray-500 hover:bg-gray-50"
          onClick={onToggleVisibility}
          disabled={isTogglingVisibility}
        >
          {isTogglingVisibility ? (
            <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <EyeOff className="h-3 w-3 mr-1" />
                Hide
              </>
            )}
          </Button>
        ) : (
          <Button
            size="sm"
            className="w-full h-7 text-xs bg-green-600 hover:bg-green-700"
            onClick={onToggleVisibility}
            disabled={isTogglingVisibility}
          >
            {isTogglingVisibility ? (
              <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
                <Eye className="h-3 w-3 mr-1" />
                Show on Page
            </>
          )}
        </Button>
        )}

        {/* AI Transform button */}
        <Button
          size="sm"
          variant="outline"
          className="w-full h-7 text-xs"
          onClick={onAddToQueue}
          disabled={isAdding || isQueued}
        >
          {isAdding ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isQueued ? (
            <>
              <CheckCircle2 className="h-3 w-3 mr-1" />
              In Queue
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3 mr-1" />
              AI Transform
            </>
          )}
        </Button>

        {/* Delete button */}
        <Button
          size="sm"
          variant="ghost"
          className="w-full h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={onRemove}
          disabled={isRemoving}
        >
          {isRemoving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <Trash2 className="h-3 w-3 mr-1" />
              Delete
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function EcommerceHeroPage() {
  // Product list state
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);

  // Filter state
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [listingType, setListingType] = useState<'all' | 'private_listing' | 'lightspeed'>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [hasImagesFilter, setHasImagesFilter] = useState<'all' | 'with_images' | 'without_images'>('all');
  const [heroOptimized, setHeroOptimized] = useState<'all' | 'optimized' | 'not_optimized'>('all');
  const [adminApproved, setAdminApproved] = useState<'all' | 'approved' | 'not_approved'>('all');
  const [secondaryReview, setSecondaryReview] = useState<'all' | 'flagged' | 'not_flagged'>('all');
  const [activeStatus, setActiveStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ brands: [], stores: [] });

  // Selected product for image viewing
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Queue state
  const [queueCounts, setQueueCounts] = useState<QueueCounts>({ pending: 0, processing: 0, completed: 0, failed: 0, total: 0 });
  const [queueLoading, setQueueLoading] = useState(false);
  
  // Track which products are being added to queue
  const [addingToQueue, setAddingToQueue] = useState<Set<string>>(new Set());
  // Track which products are already in queue
  const [queuedProductIds, setQueuedProductIds] = useState<Set<string>>(new Set());
  // Track which images are being set as hero
  const [settingAsHero, setSettingAsHero] = useState<Set<string>>(new Set());
  // Track which images are being removed
  const [removingImage, setRemovingImage] = useState<Set<string>>(new Set());
  // Track visibility toggling operations
  const [togglingVisibility, setTogglingVisibility] = useState<Set<string>>(new Set());
  // Track bulk deselect operation
  const [isDeselectingAll, setIsDeselectingAll] = useState(false);
  // Track product management operations
  const [managingProduct, setManagingProduct] = useState<string | null>(null);
  // Track product selection loading
  const [selectingProductId, setSelectingProductId] = useState<string | null>(null);

  // Image search modal state
  const [showImageSearch, setShowImageSearch] = useState(false);
  const [imageSearchQuery, setImageSearchQuery] = useState('');
  
  // Hover preview state
  const [hoverPreview, setHoverPreview] = useState<{ img: SearchImageResult; x: number; y: number } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [imageSearchResults, setImageSearchResults] = useState<SearchImageResult[]>([]);
  const [isSearchingImages, setIsSearchingImages] = useState(false);
  const [addingSearchImage, setAddingSearchImage] = useState<string | null>(null);

  // Main tab state
  const [mainTab, setMainTab] = useState<MainTab>('products');

  // Bulk Review state
  const [bulkBatchSize, setBulkBatchSize] = useState<number>(10);
  const [bulkProducts, setBulkProducts] = useState<BulkReviewProduct[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSearching, setBulkSearching] = useState(false);
  const [bulkCurrentIndex, setBulkCurrentIndex] = useState(0);
  const [bulkApprovedCount, setBulkApprovedCount] = useState(0);
  const [bulkSkippedCount, setBulkSkippedCount] = useState(0);
  const [bulkNoProductsFound, setBulkNoProductsFound] = useState(false);
  
  // Bulk Review filters
  const [bulkListingType, setBulkListingType] = useState<'all' | 'private_listing' | 'lightspeed'>('all');
  const [bulkSelectedBrand, setBulkSelectedBrand] = useState<string>('');
  const [bulkSelectedStoreId, setBulkSelectedStoreId] = useState<string>('');
  const [bulkSearchQuery, setBulkSearchQuery] = useState<string>('');
  const [bulkResultsPerImage, setBulkResultsPerImage] = useState<number>(8);
  const [bulkHasImagesFilter, setBulkHasImagesFilter] = useState<'all' | 'with_images' | 'without_images'>('all');
  const [bulkApprovalFilter, setBulkApprovalFilter] = useState<'all' | 'approved' | 'not_approved'>('all');
  
  // Track which products are being optimized (background removal)
  const [optimizingProducts, setOptimizingProducts] = useState<Set<number>>(new Set());
  
  // Track which existing images are being set as hero or removed
  const [settingExistingAsHero, setSettingExistingAsHero] = useState<string | null>(null);
  const [removingExistingImage, setRemovingExistingImage] = useState<string | null>(null);

  const supabase = createClient();

  // ============================================================
  // Data Fetching
  // ============================================================

  const fetchFilterOptions = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/ecommerce-hero/filters');
      const data = await response.json();

      if (data.success) {
        setFilterOptions(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch filter options:', error);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '240',
        listing_type: listingType,
      });
      if (search) {
        params.set('search', search);
      }
      if (selectedBrand) {
        params.set('brand', selectedBrand);
      }
      if (selectedStoreId) {
        params.set('store_id', selectedStoreId);
      }
      if (inStockOnly) {
        params.set('in_stock', 'true');
      }
      if (hasImagesFilter !== 'all') {
        params.set('has_images', hasImagesFilter);
      }
      if (heroOptimized !== 'all') {
        params.set('hero_optimized', heroOptimized);
      }
      if (adminApproved !== 'all') {
        params.set('admin_approved', adminApproved);
      }
      if (secondaryReview !== 'all') {
        params.set('secondary_review', secondaryReview);
      }
      if (activeStatus !== 'all') {
        params.set('active_status', activeStatus);
      }

      const response = await fetch(`/api/admin/ecommerce-hero/products?${params}`);
      const data = await response.json();

      if (data.success) {
        setProducts(data.data);
        setTotalPages(data.pagination.totalPages);
        setTotalProducts(data.pagination.total);
      } else {
        console.error('Failed to fetch products:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setProductsLoading(false);
    }
  }, [page, search, listingType, selectedBrand, selectedStoreId, inStockOnly, hasImagesFilter, heroOptimized, adminApproved, secondaryReview, activeStatus]);

  const fetchQueueCounts = useCallback(async () => {
    setQueueLoading(true);
    try {
      const response = await fetch('/api/admin/ecommerce-hero/queue?limit=100');
      const data = await response.json();

      if (data.success) {
        if (data.counts) {
          setQueueCounts(data.counts);
        }
        // Track which products are in the queue
        const queuedIds = new Set<string>();
        for (const item of data.data) {
          if (item.status === 'pending' || item.status === 'processing') {
            queuedIds.add(item.productId);
          }
        }
        setQueuedProductIds(queuedIds);
      }
    } catch (error) {
      console.error('Failed to fetch queue:', error);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  // Refresh a single product's data (e.g. after AI processing)
  const refreshSelectedProduct = useCallback(async () => {
    if (!selectedProduct) return;
    
    try {
      // Use product_id parameter for direct lookup
      const params = new URLSearchParams({
        product_id: selectedProduct.id,
      });
      
      const response = await fetch(`/api/admin/ecommerce-hero/products?${params}`);
      const data = await response.json();
      
      console.log(`[refreshSelectedProduct] Refreshed product ${selectedProduct.id}:`, {
        success: data.success,
        dbImageCount: data.data?.[0]?.dbImageCount,
        jsonbImageCount: data.data?.[0]?.jsonbImageCount,
        totalImages: data.data?.[0]?.images?.length,
      });
      
      if (data.success && data.data.length > 0) {
        const updatedProduct = data.data[0];
        // Update the selected product
        setSelectedProduct(updatedProduct);
        // Also update it in the products list
        setProducts(prev => prev.map(p => 
          p.id === updatedProduct.id ? updatedProduct : p
        ));
      }
    } catch (error) {
      console.error('Failed to refresh product:', error);
    }
  }, [selectedProduct]);

  // Select a product and fetch fresh data for its images
  const selectProduct = useCallback(async (product: Product) => {
    setSelectingProductId(product.id);
    
    try {
      // Fetch fresh product data to get all images (including newly AI-processed ones)
      // Use product_id parameter for direct lookup instead of search
      const params = new URLSearchParams({
        product_id: product.id,
      });
      
      const response = await fetch(`/api/admin/ecommerce-hero/products?${params}`);
      const data = await response.json();
      
      console.log(`[selectProduct] Fetched product ${product.id}:`, {
        success: data.success,
        dbImageCount: data.data?.[0]?.dbImageCount,
        jsonbImageCount: data.data?.[0]?.jsonbImageCount,
        totalImages: data.data?.[0]?.images?.length,
      });
      
      if (data.success && data.data.length > 0) {
        const freshProduct = data.data[0];
        // Set the selected product with fresh data
        setSelectedProduct(freshProduct);
        // Also update it in the products list
        setProducts(prev => prev.map(p => 
          p.id === freshProduct.id ? freshProduct : p
        ));
      } else {
        console.error('No product returned, using cached:', data);
        // Fallback to cached data if fetch fails
        setSelectedProduct(product);
      }
    } catch (error) {
      console.error('Failed to fetch fresh product data:', error);
      // Fallback to cached data
      setSelectedProduct(product);
    } finally {
      setSelectingProductId(null);
    }
  }, []);

  // Initial data fetch only
  useEffect(() => {
    fetchFilterOptions();
    fetchProducts();
    fetchQueueCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch products when filters change
  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, listingType, selectedBrand, selectedStoreId, inStockOnly, hasImagesFilter, heroOptimized, adminApproved, secondaryReview, activeStatus]);

  // ============================================================
  // Search Debounce
  // ============================================================

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Keyboard shortcuts for bulk review
  useEffect(() => {
    if (mainTab !== 'bulk-review') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Find current ready product
      const currentProduct = bulkProducts[bulkCurrentIndex];
      if (!currentProduct || currentProduct.status !== 'ready') return;

      if (e.key === 'Enter' && currentProduct.selectedImage) {
        e.preventDefault();
        approveBulkProduct(bulkCurrentIndex);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        skipBulkProduct(bulkCurrentIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mainTab, bulkCurrentIndex, bulkProducts]);

  // ============================================================
  // Queue Actions
  // ============================================================

  const addToQueue = async (product: Product, image: ProductImage) => {
    const imageKey = `${product.id}-${image.id}`;
    setAddingToQueue(prev => new Set([...prev, imageKey]));

    try {
      const response = await fetch('/api/admin/ecommerce-hero/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          sourceImageUrl: image.url,
          sourceImageId: (image.source === 'product_images' || image.source === 'canonical') ? image.id : undefined,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Refresh queue counts
        await fetchQueueCounts();
      } else if (data.error !== 'This image is already in the queue') {
        console.error('Failed to add to queue:', data.error);
      }
    } catch (error) {
      console.error('Failed to add to queue:', error);
    } finally {
      setAddingToQueue(prev => {
        const next = new Set(prev);
        next.delete(imageKey);
        return next;
      });
    }
  };

  const setAsHero = async (product: Product, image: ProductImage) => {
    const imageKey = `${product.id}-${image.id}`;
    const imageUrl = image.cardUrl || image.url;
    const isCloudinary = imageUrl.includes('cloudinary');

    setSettingAsHero(prev => new Set([...prev, imageKey]));

    try {
      const response = await fetch('/api/admin/ecommerce-hero/set-hero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          imageId: image.id,
          // If already on Cloudinary, pass cardUrl; otherwise pass originalUrl to trigger upload
          cardUrl: isCloudinary ? imageUrl : undefined,
          originalUrl: !isCloudinary ? imageUrl : undefined,
          thumbnailUrl: image.thumbnailUrl,
          galleryUrl: image.galleryUrl,
          detailUrl: image.detailUrl,
          source: image.source,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Refresh the product to get updated images from database
        // This will fetch the new JSONB after sync_product_images_to_jsonb runs
        console.log('[setAsHero] Success! Refreshing product to show updated images...');
        
        // Fetch fresh product data to reflect the new hero and updated images array
        try {
          const params = new URLSearchParams({ product_id: product.id });
          const refreshResponse = await fetch(`/api/admin/ecommerce-hero/products?${params}`);
          const refreshData = await refreshResponse.json();
          
          if (refreshData.success && refreshData.data.length > 0) {
            const updatedProduct = refreshData.data[0];
            console.log('[setAsHero] Refreshed product:', {
              cachedImageUrl: updatedProduct.cachedImageUrl,
              imageCount: updatedProduct.images?.length,
            });
            
            setProducts(prev => prev.map(p => 
              p.id === updatedProduct.id ? updatedProduct : p
            ));
            
            if (selectedProduct?.id === product.id) {
              setSelectedProduct(updatedProduct);
            }
          }
        } catch (refreshError) {
          console.error('[setAsHero] Failed to refresh product:', refreshError);
          // Fallback to basic local update
          const newHeroUrl = data.cachedImageUrl || imageUrl;
          const updateProduct = (p: Product): Product => {
            if (p.id !== product.id) return p;
            return { ...p, cachedImageUrl: newHeroUrl };
          };
          setProducts(prev => prev.map(updateProduct));
          if (selectedProduct?.id === product.id) {
            setSelectedProduct(updateProduct(selectedProduct));
          }
        }
      } else {
        console.error('Failed to set hero:', data.error);
        alert(`Failed to set hero: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to set hero:', error);
      alert('Failed to set hero image. Please try again.');
    } finally {
      setSettingAsHero(prev => {
        const next = new Set(prev);
        next.delete(imageKey);
        return next;
      });
    }
  };

  const removeImage = async (product: Product, image: ProductImage) => {
    const imageKey = `${product.id}-${image.id}`;
    setRemovingImage(prev => new Set([...prev, imageKey]));

    try {
      const response = await fetch('/api/admin/ecommerce-hero/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'remove_image',
          productId: product.id,
          imageId: image.id,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Update local state instead of refetching
        const updateProductImages = (p: Product): Product => {
          if (p.id !== product.id) return p;
          
          // Remove the image from the appropriate array
          const newDbImages = p.dbImages.filter(img => img.id !== image.id);
          const newJsonbImages = p.jsonbImages.filter(img => img.id !== image.id);
          const newImages = p.images.filter(img => img.id !== image.id);
          
          return {
            ...p,
            dbImages: newDbImages,
            jsonbImages: newJsonbImages,
            images: newImages,
            dbImageCount: newDbImages.length,
            jsonbImageCount: newJsonbImages.length,
            imageCount: newImages.length,
            // Clear cached URL if this was the hero image
            cachedImageUrl: (p.cachedImageUrl === image.cardUrl || p.cachedImageUrl === image.url) 
              ? null 
              : p.cachedImageUrl,
          };
        };

        setProducts(prev => prev.map(updateProductImages));
        
        // Update selected product
        if (selectedProduct?.id === product.id) {
          setSelectedProduct(updateProductImages(selectedProduct));
        }
      } else {
        console.error('Failed to remove image:', data.error);
      }
    } catch (error) {
      console.error('Failed to remove image:', error);
    } finally {
      setRemovingImage(prev => {
        const next = new Set(prev);
        next.delete(imageKey);
        return next;
      });
    }
  };

  // Toggle image visibility on product page (add/remove from JSONB array)
  const toggleImageVisibility = async (product: Product, image: ProductImage) => {
    const imageKey = `${product.id}-${image.id}`;
    setTogglingVisibility(prev => new Set([...prev, imageKey]));

    try {
      const isCurrentlyVisible = image.isOnProductPage || false;
      const action = isCurrentlyVisible ? 'remove_from_product_page' : 'add_to_product_page';

      const response = await fetch('/api/admin/ecommerce-hero/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          productId: product.id,
          imageId: image.id,
          imageUrl: image.url,
          cardUrl: image.cardUrl,
          thumbnailUrl: image.thumbnailUrl,
          galleryUrl: image.galleryUrl,
          detailUrl: image.detailUrl,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Update local state
        const updateImageVisibility = (p: Product): Product => {
          if (p.id !== product.id) return p;

          // Toggle the visibility flag on the image
          const updateImg = (img: ProductImage) => 
            img.id === image.id 
              ? { ...img, isOnProductPage: !isCurrentlyVisible, isInJsonb: !isCurrentlyVisible }
              : img;

          return {
            ...p,
            dbImages: p.dbImages.map(updateImg),
            jsonbImages: p.jsonbImages.map(updateImg),
            images: p.images.map(updateImg),
            hasJsonbImages: !isCurrentlyVisible || p.jsonbImageCount > 0,
          };
        };

        setProducts(prev => prev.map(updateImageVisibility));
        
        if (selectedProduct?.id === product.id) {
          setSelectedProduct(updateImageVisibility(selectedProduct));
        }
        
        console.log(`Image ${isCurrentlyVisible ? 'removed from' : 'added to'} product page`);
      } else {
        console.error('Failed to toggle visibility:', data.error);
      }
    } catch (error) {
      console.error('Failed to toggle visibility:', error);
    } finally {
      setTogglingVisibility(prev => {
        const next = new Set(prev);
        next.delete(imageKey);
        return next;
      });
    }
  };

  // Deselect all images (remove all from product page visibility)
  const deselectAllImages = async (product: Product) => {
    if (!product) return;
    
    // Get all visible images
    const visibleImages = product.images.filter(img => img.isOnProductPage);
    if (visibleImages.length === 0) {
      console.log('No visible images to deselect');
      return;
    }

    setIsDeselectingAll(true);

    try {
      const response = await fetch('/api/admin/ecommerce-hero/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deselect_all_images',
          productId: product.id,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Update local state - set all images as not visible on product page
        const updateImageVisibility = (p: Product): Product => {
          if (p.id !== product.id) return p;

          const updateImg = (img: ProductImage) => ({
            ...img,
            isOnProductPage: false,
            isInJsonb: false,
          });

          return {
            ...p,
            dbImages: p.dbImages.map(updateImg),
            jsonbImages: [], // Clear JSONB images as they're all removed
            images: p.images.map(updateImg),
            hasJsonbImages: false,
            jsonbImageCount: 0,
          };
        };

        setProducts(prev => prev.map(updateImageVisibility));
        
        if (selectedProduct?.id === product.id) {
          setSelectedProduct(updateImageVisibility(selectedProduct));
        }
        
        console.log('All images deselected from product page');
      } else {
        console.error('Failed to deselect all images:', data.error);
      }
    } catch (error) {
      console.error('Failed to deselect all images:', error);
    } finally {
      setIsDeselectingAll(false);
    }
  };

  // State for tracking reordering
  const [isReordering, setIsReordering] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Need to drag 8px before activating
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end for image reordering
  const handleDragEnd = async (event: DragEndEvent, source: 'product_images' | 'jsonb' | 'canonical') => {
    const { active, over } = event;

    if (!over || active.id === over.id || !selectedProduct) {
      return;
    }

    setIsReordering(true);

    try {
      const images = source === 'product_images' ? selectedProduct.dbImages : selectedProduct.jsonbImages;
      const oldIndex = images.findIndex((img) => img.id === active.id);
      const newIndex = images.findIndex((img) => img.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      // Don't allow moving to position 0 if there's a primary image there
      const primaryIndex = images.findIndex((img) => img.isPrimary);
      if (primaryIndex === 0 && newIndex === 0 && oldIndex !== 0) {
        // Can't move non-primary image to position 0 (primary is locked there)
        setIsReordering(false);
        return;
      }

      // Calculate new order
      const reorderedImages = arrayMove(images, oldIndex, newIndex);
      const newOrder = reorderedImages.map((img, idx) => ({
        id: img.id,
        sortOrder: idx,
      }));

      // Update via API
      const response = await fetch('/api/admin/ecommerce-hero/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_reorder_images',
          productId: selectedProduct.id,
          source,
          newOrder,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Update local state immediately for smooth UX
        if (source === 'product_images') {
          setSelectedProduct({
            ...selectedProduct,
            dbImages: reorderedImages.map((img, idx) => ({ ...img, sortOrder: idx })),
            images: [
              ...reorderedImages.map((img, idx) => ({ ...img, sortOrder: idx })),
              ...selectedProduct.jsonbImages,
            ],
          });
        } else {
          setSelectedProduct({
            ...selectedProduct,
            jsonbImages: reorderedImages.map((img, idx) => ({ ...img, sortOrder: idx })),
            images: [
              ...selectedProduct.dbImages,
              ...reorderedImages.map((img, idx) => ({ ...img, sortOrder: idx })),
            ],
          });
        }
      } else {
        console.error('Failed to reorder images:', data.error);
        // Refresh to get correct order
        await refreshSelectedProduct();
      }
    } catch (error) {
      console.error('Failed to reorder images:', error);
      await refreshSelectedProduct();
    } finally {
      setIsReordering(false);
    }
  };

  const manageProduct = async (productId: string, action: 'deactivate' | 'activate' | 'delete' | 'approve_images' | 'unapprove_images' | 'flag_secondary_review' | 'unflag_secondary_review') => {
    if (action === 'delete') {
      if (!confirm('Are you sure you want to permanently delete this product? This cannot be undone.')) {
        return;
      }
    }

    setManagingProduct(productId);

    try {
      const response = await fetch('/api/admin/ecommerce-hero/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          productId,
        }),
      });

      const data = await response.json();

      console.log(`[manageProduct] Response for ${action}:`, data);
      
      if (data.success) {
        // Update local state instead of refetching all products
        if (action === 'delete') {
          // Remove the product from local state
          setProducts(prev => prev.filter(p => p.id !== productId));
          setTotalProducts(prev => prev - 1);
          if (selectedProduct?.id === productId) {
            setSelectedProduct(null);
          }
        } else if (action === 'activate' || action === 'deactivate') {
          // Update the is_active status locally
          const newIsActive = action === 'activate';
          setProducts(prev => prev.map(p => 
            p.id === productId ? { ...p, isActive: newIsActive } : p
          ));
          // Update selected product if it's the one we just updated
          if (selectedProduct?.id === productId) {
            setSelectedProduct(prev => prev ? { ...prev, isActive: newIsActive } : null);
          }
        } else if (action === 'approve_images') {
          // Update the approval status locally
          setProducts(prev => prev.map(p => 
            p.id === productId ? { ...p, imagesApprovedByAdmin: true, imagesApprovedAt: new Date().toISOString() } : p
          ));
          if (selectedProduct?.id === productId) {
            setSelectedProduct(prev => prev ? { ...prev, imagesApprovedByAdmin: true, imagesApprovedAt: new Date().toISOString() } : null);
          }
        } else if (action === 'unapprove_images') {
          // Remove the approval status locally
          setProducts(prev => prev.map(p => 
            p.id === productId ? { ...p, imagesApprovedByAdmin: false, imagesApprovedAt: null } : p
          ));
          if (selectedProduct?.id === productId) {
            setSelectedProduct(prev => prev ? { ...prev, imagesApprovedByAdmin: false, imagesApprovedAt: null } : null);
          }
        } else if (action === 'flag_secondary_review') {
          // Flag for secondary review locally
          setProducts(prev => prev.map(p => 
            p.id === productId ? { ...p, needsSecondaryReview: true, secondaryReviewFlaggedAt: new Date().toISOString() } : p
          ));
          if (selectedProduct?.id === productId) {
            setSelectedProduct(prev => prev ? { ...prev, needsSecondaryReview: true, secondaryReviewFlaggedAt: new Date().toISOString() } : null);
          }
        } else if (action === 'unflag_secondary_review') {
          // Remove secondary review flag locally
          setProducts(prev => prev.map(p => 
            p.id === productId ? { ...p, needsSecondaryReview: false, secondaryReviewFlaggedAt: null } : p
          ));
          if (selectedProduct?.id === productId) {
            setSelectedProduct(prev => prev ? { ...prev, needsSecondaryReview: false, secondaryReviewFlaggedAt: null } : null);
          }
        }
      } else {
        console.error(`Failed to ${action} product:`, data.error);
      }
    } catch (error) {
      console.error(`Failed to ${action} product:`, error);
    } finally {
      setManagingProduct(null);
    }
  };

  const handleProcessNow = async () => {
    try {
      await fetch('/api/admin/ecommerce-hero/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 5 }),
      });
      // Refresh after a short delay
      setTimeout(() => {
        fetchQueueCounts();
        fetchProducts();
      }, 2000);
    } catch (error) {
      console.error('Failed to trigger processing:', error);
    }
  };

  const handleRefresh = () => {
    fetchProducts();
    fetchQueueCounts();
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setSearch('');
    setSelectedBrand('');
    setSelectedStoreId('');
    setInStockOnly(false);
    setHasImagesFilter('all');
    setHeroOptimized('all');
    setAdminApproved('all');
    setSecondaryReview('all');
    setActiveStatus('all');
    setListingType('all');
    setPage(1);
  };

  const hasActiveFilters = search || selectedBrand || selectedStoreId || inStockOnly || hasImagesFilter !== 'all' || heroOptimized !== 'all' || adminApproved !== 'all' || secondaryReview !== 'all' || activeStatus !== 'all' || listingType !== 'all';

  // ============================================================
  // Image Search Functions
  // ============================================================

  const startImageSearch = () => {
    if (!selectedProduct) return;
    // Pre-fill search with product name and brand
    const searchTerms = [selectedProduct.brand, selectedProduct.name].filter(Boolean).join(' ');
    setImageSearchQuery(searchTerms);
    setImageSearchResults([]);
    setShowImageSearch(true);
    // Auto-search immediately
    searchForImagesWithQuery(searchTerms);
  };

  const searchForImagesWithQuery = async (query: string) => {
    if (!query.trim() || !selectedProduct) return;
    
    setIsSearchingImages(true);
    setImageSearchResults([]);
    
    try {
      const response = await fetch('/api/admin/ecommerce-hero/search-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchQuery: query,
          productName: selectedProduct.name,
          brand: selectedProduct.brand,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setImageSearchResults(data.results);
      } else {
        console.error('Image search failed:', data.error);
      }
    } catch (error) {
      console.error('Image search error:', error);
    } finally {
      setIsSearchingImages(false);
    }
  };

  const searchForImages = () => {
    searchForImagesWithQuery(imageSearchQuery);
  };

  const addSearchedImage = async (image: SearchImageResult, setAsHero: boolean = false) => {
    if (!selectedProduct) return;
    
    setAddingSearchImage(image.id);
    
    try {
      const response = await fetch('/api/admin/ecommerce-hero/add-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProduct.id,
          imageUrl: image.url,
          setAsHero,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Refresh product to show new image
        await refreshSelectedProduct();
        
        // Remove from search results
        setImageSearchResults(prev => prev.filter(r => r.id !== image.id));
      } else {
        console.error('Failed to add image:', data.error);
        alert(`Failed to add image: ${data.error}`);
      }
    } catch (error) {
      console.error('Add image error:', error);
      alert('Failed to add image');
    } finally {
      setAddingSearchImage(null);
    }
  };

  // ============================================================
  // Bulk Review Functions
  // ============================================================

  const loadBulkProducts = async () => {
    setBulkLoading(true);
    setBulkProducts([]);
    setBulkCurrentIndex(0);
    setBulkApprovedCount(0);
    setBulkSkippedCount(0);
    setBulkNoProductsFound(false);

    try {
      // Fetch products with filters
      // When searching, use a higher limit to show more results
      const searchLimit = bulkSearchQuery ? Math.max(bulkBatchSize, 50) : bulkBatchSize;
      const params = new URLSearchParams({
        page: '1',
        limit: searchLimit.toString(),
        listing_type: bulkListingType,
        active_status: 'active',
      });
      
      // Apply approval filter - only add if user explicitly selected a filter
      if (bulkApprovalFilter !== 'all') {
        params.set('admin_approved', bulkApprovalFilter);
      }
      // Note: 'all' means no approval filter - show all products regardless of approval status
      
      // Apply has images filter
      if (bulkHasImagesFilter !== 'all') {
        params.set('has_images', bulkHasImagesFilter);
      }
      
      if (bulkSelectedBrand) {
        params.set('brand', bulkSelectedBrand);
      }
      if (bulkSelectedStoreId) {
        params.set('store_id', bulkSelectedStoreId);
      }
      if (bulkSearchQuery) {
        params.set('search', bulkSearchQuery);
      }

      console.log('[BULK REVIEW] Fetching products with params:', params.toString());
      const response = await fetch(`/api/admin/ecommerce-hero/products?${params}`);
      const data = await response.json();
      console.log('[BULK REVIEW] Response:', { success: data.success, count: data.data?.length, pagination: data.pagination });

      if (data.success && data.data && data.data.length > 0) {
        const bulkItems: BulkReviewProduct[] = data.data.map((p: Product) => {
          // Convert existing product images to SearchImageResult format
          const existingImages: SearchImageResult[] = [];
          let heroImageId: string | null = null;
          
          if (p.images && Array.isArray(p.images) && p.images.length > 0) {
            p.images.forEach((img: any, idx: number) => {
              const imageResult: SearchImageResult = {
                id: img.id || `existing-${idx}`,
                url: img.url || img.cardUrl,
                thumbnailUrl: img.thumbnailUrl || img.cardUrl || img.url,
                title: 'Existing Image',
                source: 'Current Product',
                domain: 'existing',
                width: 1024,
                height: 1024,
              };
              existingImages.push(imageResult);
              
              // Track hero image
              if (img.isPrimary || img.order === 0) {
                heroImageId = imageResult.id;
              }
            });
          }
          
          return {
            id: p.id,
            name: p.name,
            brand: p.brand,
            storeName: p.storeName,
            currentImageUrl: p.cachedImageUrl || p.primaryImageUrl,
            existingImages,
            heroImageId,
            searchResults: [],
            excludedImageIds: new Set<string>(),
            selectedImage: null,
            status: 'pending' as const,
            imagesApprovedByAdmin: p.imagesApprovedByAdmin || false,
            hasDisplayableImage: p.hasDisplayableImage || false,
          };
        });
        setBulkProducts(bulkItems);
        console.log('[BULK REVIEW] Loaded', bulkItems.length, 'products');
      } else if (data.success && (!data.data || data.data.length === 0)) {
        console.log('[BULK REVIEW] No unapproved products found');
        setBulkProducts([]);
        setBulkNoProductsFound(true);
      } else {
        console.error('[BULK REVIEW] API error:', data.error);
      }
    } catch (error) {
      console.error('[BULK REVIEW] Failed to load products:', error);
    } finally {
      setBulkLoading(false);
    }
  };

  const fetchBulkImages = async () => {
    console.log('[BULK REVIEW] fetchBulkImages called. bulkProducts.length:', bulkProducts.length);
    if (bulkProducts.length === 0) {
      console.log('[BULK REVIEW] No products to search - returning early');
      return;
    }

    setBulkSearching(true);
    console.log('[BULK REVIEW] Starting image search for', bulkProducts.length, 'products');

    // Get a snapshot of current products to iterate over
    const productsToProcess = [...bulkProducts];

    // Process products sequentially (to avoid rate limiting)
    for (let i = 0; i < productsToProcess.length; i++) {
      const product = productsToProcess[i];
      if (product.status !== 'pending') {
        console.log('[BULK REVIEW] Skipping product', i, '- status:', product.status);
        continue;
      }

      console.log('[BULK REVIEW] Searching for product', i, ':', product.name);

      // Update status to searching
      setBulkProducts(prev => prev.map((p, idx) => 
        idx === i ? { ...p, status: 'searching' as const } : p
      ));

      try {
        const searchQuery = [product.brand, product.name].filter(Boolean).join(' ');
        console.log('[BULK REVIEW] Search query:', searchQuery);
        
        const response = await fetch('/api/admin/ecommerce-hero/search-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ searchQuery }),
        });

        const data = await response.json();
        console.log('[BULK REVIEW] Search response for product', i, ':', { success: data.success, resultsCount: data.results?.length, error: data.error });

        if (data.success && data.results?.length > 0) {
          // Don't auto-select - user must choose the hero image
          // All images start as excluded - user must click to include, double-click for hero
          const results = data.results.slice(0, bulkResultsPerImage);
          const allExcluded = new Set<string>(results.map((r: SearchImageResult) => r.id));
          setBulkProducts(prev => prev.map((p, idx) => 
            idx === i ? { 
              ...p, 
              status: 'ready' as const,
              searchResults: results,
              excludedImageIds: allExcluded, // All excluded by default
              selectedImage: null, // No auto-selection - user must choose
            } : p
          ));
          console.log('[BULK REVIEW] Product', i, 'ready with', results.length, 'images (all excluded)');
        } else {
          setBulkProducts(prev => prev.map((p, idx) => 
            idx === i ? { 
              ...p, 
              status: 'error' as const,
              errorMessage: data.error || 'No images found',
            } : p
          ));
          console.log('[BULK REVIEW] Product', i, 'error:', data.error || 'No images found');
        }
      } catch (error) {
        console.error('[BULK REVIEW] Search error for product', i, ':', error);
        setBulkProducts(prev => prev.map((p, idx) => 
          idx === i ? { 
            ...p, 
            status: 'error' as const,
            errorMessage: 'Search failed',
          } : p
        ));
      }

      // Small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setBulkSearching(false);
    console.log('[BULK REVIEW] Finished searching all products');
  };

  // Generate AI preview - uploads to Cloudinary, runs AI, shows result (does NOT approve)
  const generateAiPreview = async (index: number) => {
    const product = bulkProducts[index];
    console.log('[BULK REVIEW] AI clicked for product', index, product.name, 'selectedImage:', product.selectedImage?.url);
    
    if (!product.selectedImage) {
      console.log('[BULK REVIEW] No image selected - cannot generate AI');
      return;
    }

    setOptimizingProducts(prev => new Set([...prev, index]));
    setBulkProducts(prev => prev.map((p, idx) => 
      idx === index ? { ...p, aiStatus: 'processing' as const } : p
    ));

    try {
      // Step 1: Upload to Cloudinary first
      console.log('[BULK REVIEW] Uploading to Cloudinary...');
      const uploadResponse = await fetch('/api/admin/ecommerce-hero/add-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          imageUrl: product.selectedImage.url,
          setAsHero: false, // Don't set as hero yet - just upload
        }),
      });

      const uploadData = await uploadResponse.json();
      console.log('[BULK REVIEW] Upload response:', uploadData);

      if (!uploadData.success) {
        throw new Error(uploadData.error || 'Failed to upload image');
      }

      // Step 2: Add to AI queue
      console.log('[BULK REVIEW] Adding to AI queue...');
      const queueResponse = await fetch('/api/admin/ecommerce-hero/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          sourceImageUrl: uploadData.cloudinaryUrl,
        }),
      });
      
      const queueData = await queueResponse.json();
      if (!queueData.success && queueData.error !== 'This image is already in the queue') {
        throw new Error(queueData.error || 'Failed to queue for AI');
      }

      // Step 3: Trigger immediate processing
      console.log('[BULK REVIEW] Processing AI...');
      fetch('/api/admin/ecommerce-hero/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 1 }),
      }).catch(err => console.warn('[BULK REVIEW] Process trigger error:', err));

      // Step 4: Poll for the result (up to 60 seconds)
      console.log('[BULK REVIEW] Polling for AI result...');
      let attempts = 0;
      const maxAttempts = 30; // 30 attempts * 2 seconds = 60 seconds
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        attempts++;
        
        console.log(`[BULK REVIEW] Polling attempt ${attempts}/${maxAttempts}...`);
        
        const resultResponse = await fetch(`/api/admin/ecommerce-hero/queue?productId=${product.id}&limit=1`);
        const resultData = await resultResponse.json();
        
        const latestItem = resultData.data?.[0];
        
        if (latestItem?.status === 'completed' && latestItem?.resultCardUrl) {
          // Create AI image as a search result
          const aiImage: SearchImageResult = {
            id: `ai-${Date.now()}`,
            url: latestItem.resultCardUrl,
            thumbnailUrl: latestItem.resultThumbnailUrl || latestItem.resultCardUrl,
            title: 'AI Optimised',
            source: 'AI Generated',
            domain: 'ai',
            width: 1024,
            height: 1024,
          };

          // Add AI image to the front of search results and select it
          setBulkProducts(prev => prev.map((p, idx) => {
            if (idx === index) {
              // Remove any previous AI images and add new one at front
              const filteredResults = p.searchResults.filter(img => !img.id.startsWith('ai-'));
              return {
                ...p,
                aiStatus: 'ready' as const,
                aiGeneratedImage: aiImage,
                searchResults: [aiImage, ...filteredResults],
                selectedImage: aiImage, // Auto-select the AI image
                excludedImageIds: new Set([...p.excludedImageIds].filter(id => id !== aiImage.id)), // Include AI image
              };
            }
            return p;
          }));
          console.log('[BULK REVIEW] AI image ready:', aiImage.url);
          
          setOptimizingProducts(prev => {
            const newSet = new Set(prev);
            newSet.delete(index);
            return newSet;
          });
          
          fetchQueueCounts();
          return; // Success!
        } else if (latestItem?.status === 'failed') {
          throw new Error(latestItem.errorMessage || 'AI processing failed');
        }
        // Still pending/processing - continue polling
      }
      
      throw new Error('AI processing timed out');

    } catch (error) {
      console.error('[BULK REVIEW] AI generation failed:', error);
      setBulkProducts(prev => prev.map((p, idx) => 
        idx === index ? { ...p, aiStatus: 'error' as const, aiError: error instanceof Error ? error.message : 'AI failed' } : p
      ));
      setOptimizingProducts(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }
  };

  // Approve bulk product - saves the selected image as hero
  const approveBulkProduct = async (index: number) => {
    const product = bulkProducts[index];
    console.log('[BULK REVIEW] Approve clicked for product', index, product.name, 'selectedImage:', product.selectedImage?.url);
    
    if (!product.selectedImage) {
      console.log('[BULK REVIEW] No image selected - cannot approve');
      return;
    }

    setBulkProducts(prev => prev.map((p, idx) => 
      idx === index ? { ...p, status: 'searching' as const } : p
    ));

    try {
      console.log('[BULK REVIEW] Calling add-image API...');
      const addResponse = await fetch('/api/admin/ecommerce-hero/add-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          imageUrl: product.selectedImage.url,
          setAsHero: true,
        }),
      });

      const addData = await addResponse.json();
      console.log('[BULK REVIEW] Add image API response:', addData);

      if (!addData.success) {
        throw new Error(addData.error || 'Failed to add image');
      }

      // Success - mark as approved
      setBulkProducts(prev => {
        const updated = prev.map((p, idx) => {
          if (idx === index) {
            return { ...p, status: 'approved' as const };
          }
          return p;
        });
        // Move to next ready product
        const nextIndex = updated.findIndex((p, i) => i > index && p.status === 'ready');
        if (nextIndex !== -1) {
          setBulkCurrentIndex(nextIndex);
        }
        return updated;
      });
      setBulkApprovedCount(prev => prev + 1);
      console.log('[BULK REVIEW] Product approved successfully');
      
    } catch (error) {
      console.error('[BULK REVIEW] Failed to approve:', error);
      setBulkProducts(prev => prev.map((p, idx) => 
        idx === index ? { ...p, status: 'ready' as const, errorMessage: error instanceof Error ? error.message : 'Error' } : p
      ));
    }
  };

  // Quick approve - marks existing images as approved without adding new ones
  const quickApproveBulkProduct = async (index: number) => {
    const product = bulkProducts[index];
    console.log('[BULK REVIEW] Quick approve clicked for product', index, product.name);
    
    setBulkProducts(prev => prev.map((p, idx) => 
      idx === index ? { ...p, status: 'searching' as const } : p
    ));

    try {
      console.log('[BULK REVIEW] Calling manage API for quick approve...');
      const response = await fetch('/api/admin/ecommerce-hero/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          action: 'approve_images',
        }),
      });

      const data = await response.json();
      console.log('[BULK REVIEW] Manage API response:', data);

      if (!data.success) {
        throw new Error(data.error || 'Failed to approve');
      }

      // Success - mark as approved
      setBulkProducts(prev => prev.map((p, idx) => 
        idx === index ? { ...p, status: 'approved' as const, imagesApprovedByAdmin: true } : p
      ));
      setBulkApprovedCount(prev => prev + 1);
      console.log('[BULK REVIEW] Product quick-approved successfully');
      
    } catch (error) {
      console.error('[BULK REVIEW] Failed to quick approve:', error);
      setBulkProducts(prev => prev.map((p, idx) => 
        idx === index ? { ...p, status: 'ready' as const, errorMessage: error instanceof Error ? error.message : 'Error' } : p
      ));
    }
  };

  const skipBulkProduct = (index: number) => {
    setBulkProducts(prev => {
      const updated = prev.map((p, idx) => 
        idx === index ? { ...p, status: 'skipped' as const } : p
      );
      // Move to next ready product
      const nextIndex = updated.findIndex((p, i) => i > index && p.status === 'ready');
      if (nextIndex !== -1) {
        setBulkCurrentIndex(nextIndex);
      }
      return updated;
    });
    setBulkSkippedCount(prev => prev + 1);
  };

  // Auto-update current index when products change status
  useEffect(() => {
    if (bulkProducts.length === 0) return;
    
    // If current index product is not ready, find the first ready one
    const currentProduct = bulkProducts[bulkCurrentIndex];
    if (!currentProduct || currentProduct.status !== 'ready') {
      const firstReadyIndex = bulkProducts.findIndex(p => p.status === 'ready');
      if (firstReadyIndex !== -1 && firstReadyIndex !== bulkCurrentIndex) {
        setBulkCurrentIndex(firstReadyIndex);
      }
    }
  }, [bulkProducts, bulkCurrentIndex]);

  const selectBulkImage = (productIndex: number, image: SearchImageResult) => {
    setBulkProducts(prev => prev.map((p, idx) => 
      idx === productIndex ? { ...p, selectedImage: image } : p
    ));
  };

  const toggleExcludeImage = (productIndex: number, imageId: string) => {
    setBulkProducts(prev => prev.map((p, idx) => {
      if (idx !== productIndex) return p;
      
      const newExcluded = new Set(p.excludedImageIds);
      if (newExcluded.has(imageId)) {
        newExcluded.delete(imageId);
      } else {
        newExcluded.add(imageId);
        // If the excluded image was selected, pick the next non-excluded one
        if (p.selectedImage?.id === imageId) {
          const nextImage = p.searchResults.find(img => !newExcluded.has(img.id));
          return { ...p, excludedImageIds: newExcluded, selectedImage: nextImage || null };
        }
      }
      return { ...p, excludedImageIds: newExcluded };
    }));
  };

  // Set an existing image as hero in bulk review
  const setExistingImageAsHero = async (productId: string, image: SearchImageResult) => {
    const key = `${productId}-${image.id}`;
    setSettingExistingAsHero(key);
    
    try {
      const response = await fetch('/api/admin/ecommerce-hero/set-hero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          imageId: image.id,
          cardUrl: image.url, // Will be processed by set-hero to generate variants
          source: 'product_images',
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Update the bulk products state to reflect the new hero
        setBulkProducts(prev => prev.map(p => {
          if (p.id !== productId) return p;
          return {
            ...p,
            heroImageId: image.id,
            currentImageUrl: data.cachedImageUrl || image.url,
          };
        }));
      } else {
        console.error('Failed to set hero:', data.error);
        alert(`Failed to set hero: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to set hero:', error);
      alert('Failed to set hero image. Please try again.');
    } finally {
      setSettingExistingAsHero(null);
    }
  };

  // Remove an existing image from a product in bulk review
  const removeExistingImage = async (productId: string, imageId: string, productIndex: number) => {
    const key = `${productId}-${imageId}`;
    setRemovingExistingImage(key);
    
    try {
      const response = await fetch('/api/admin/ecommerce-hero/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'remove_image',
          productId,
          imageId,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Update the bulk products state to remove the image
        setBulkProducts(prev => prev.map((p, idx) => {
          if (idx !== productIndex) return p;
          
          const updatedExistingImages = p.existingImages.filter(img => img.id !== imageId);
          const wasHero = p.heroImageId === imageId;
          
          return {
            ...p,
            existingImages: updatedExistingImages,
            // If removed image was hero, set first remaining image as hero (or null)
            heroImageId: wasHero 
              ? (updatedExistingImages[0]?.id || null) 
              : p.heroImageId,
          };
        }));
      } else {
        console.error('Failed to remove image:', data.error);
        alert(`Failed to remove image: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to remove image:', error);
      alert('Failed to remove image. Please try again.');
    } finally {
      setRemovingExistingImage(null);
    }
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">E-Commerce Hero Images</h1>
            <p className="text-sm text-gray-500 mt-0.5">
                Manage product hero images and bulk approve
              </p>
            </div>
            
            {/* Main Tab Switcher */}
            <div className="flex items-center bg-gray-100 p-0.5 rounded-md">
              <button
                onClick={() => setMainTab('products')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  mainTab === 'products'
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70"
                )}
              >
                <Package className="h-4 w-4" />
                Products
              </button>
              <button
                onClick={() => setMainTab('bulk-review')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  mainTab === 'bulk-review'
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70"
                )}
              >
                <Sparkles className="h-4 w-4" />
                Bulk Review
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Queue status */}
            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-yellow-50 text-yellow-700 rounded-md">
                <Clock className="h-3.5 w-3.5" />
                <span>{queueCounts.pending} pending</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{queueCounts.completed} done</span>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={productsLoading || queueLoading}
            >
              <RefreshCw className={cn("h-4 w-4 mr-1.5", (productsLoading || queueLoading) && "animate-spin")} />
              Refresh
            </Button>

            {queueCounts.pending > 0 && (
              <Button
                size="sm"
                onClick={handleProcessNow}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                Process Now
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content - Products Tab */}
      {mainTab === 'products' && (
      <div className="flex h-[calc(100vh-73px)]">
        {/* Left Panel: Product List (60%) */}
        <div className="w-[60%] border-r border-gray-200 bg-white flex flex-col">
          {/* Filter Bar */}
          <div className="p-3 border-b border-gray-100 space-y-2">
            {/* First row: Search, Listing Type, Brand, Store */}
            <div className="flex items-center gap-2">
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-8 h-8 text-sm rounded-md"
                />
              </div>
              
              {/* Listing Type Tabs */}
              <div className="flex items-center bg-gray-100 p-0.5 rounded-md">
                {(['all', 'private_listing', 'lightspeed'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => { setListingType(type); setPage(1); }}
                    className={cn(
                      "px-2 py-1 text-xs font-medium rounded-md transition-colors",
                      listingType === type
                        ? "text-gray-800 bg-white shadow-sm"
                        : "text-gray-600 hover:bg-gray-200/70"
                    )}
                  >
                    {type === 'all' ? 'All' : type === 'private_listing' ? 'Private' : 'LS'}
                  </button>
                ))}
              </div>

              {/* Brand Filter */}
              <Select value={selectedBrand} onValueChange={(value) => { setSelectedBrand(value === 'all' ? '' : value); setPage(1); }}>
                <SelectTrigger className="w-36 h-8 text-sm rounded-md">
                  <SelectValue placeholder="Brand" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  {filterOptions.brands.map((brand) => (
                    <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Store Filter */}
              <Select value={selectedStoreId} onValueChange={(value) => { setSelectedStoreId(value === 'all' ? '' : value); setPage(1); }}>
                <SelectTrigger className="w-40 h-8 text-sm rounded-md">
                  <div className="flex items-center gap-1.5">
                    <Store className="h-3.5 w-3.5 text-gray-400" />
                    <SelectValue placeholder="Store" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stores</SelectItem>
                  {filterOptions.stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name} ({store.productCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* In Stock Toggle */}
              <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-md">
                <Switch 
                  checked={inStockOnly} 
                  onCheckedChange={(checked) => { setInStockOnly(checked); setPage(1); }}
                  id="in-stock"
                  className="h-4 w-7"
                />
                <label htmlFor="in-stock" className="text-xs text-gray-700 cursor-pointer whitespace-nowrap">
                  In Stock
                </label>
              </div>
            </div>

            {/* Second row: Status filters */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Has Images Filter */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">Images:</span>
                <div className="flex items-center bg-gray-100 p-0.5 rounded-md">
                  {(['all', 'with_images', 'without_images'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => { setHasImagesFilter(status); setPage(1); }}
                      className={cn(
                        "px-2 py-1 text-xs font-medium rounded-md transition-colors",
                        hasImagesFilter === status
                          ? "text-gray-800 bg-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70"
                      )}
                    >
                      {status === 'all' ? 'All' : status === 'with_images' ? 'Has' : 'None'}
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Optimized Filter */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">AI:</span>
                <div className="flex items-center bg-gray-100 p-0.5 rounded-md">
                  {(['all', 'not_optimized', 'optimized'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => { setHeroOptimized(status); setPage(1); }}
                      className={cn(
                        "px-2 py-1 text-xs font-medium rounded-md transition-colors",
                        heroOptimized === status
                          ? "text-gray-800 bg-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70"
                      )}
                    >
                      {status === 'all' ? 'All' : status === 'optimized' ? 'Done' : 'Needs'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Admin Approved Filter */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">Approval:</span>
                <div className="flex items-center bg-gray-100 p-0.5 rounded-md">
                  {(['all', 'not_approved', 'approved'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => { setAdminApproved(status); setPage(1); }}
                      className={cn(
                        "px-2 py-1 text-xs font-medium rounded-md transition-colors",
                        adminApproved === status
                          ? "text-gray-800 bg-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70"
                      )}
                    >
                      {status === 'all' ? 'All' : status === 'approved' ? 'Yes' : 'No'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Secondary Review Filter */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">Review:</span>
                <div className="flex items-center bg-gray-100 p-0.5 rounded-md">
                  {(['all', 'flagged', 'not_flagged'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => { setSecondaryReview(status); setPage(1); }}
                      className={cn(
                        "px-2 py-1 text-xs font-medium rounded-md transition-colors",
                        secondaryReview === status
                          ? "text-gray-800 bg-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70"
                      )}
                    >
                      {status === 'all' ? 'All' : status === 'flagged' ? 'Flagged' : 'Clear'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Status Filter */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">Status:</span>
                <div className="flex items-center bg-gray-100 p-0.5 rounded-md">
                  {(['all', 'active', 'inactive'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => { setActiveStatus(status); setPage(1); }}
                      className={cn(
                        "px-2 py-1 text-xs font-medium rounded-md transition-colors",
                        activeStatus === status
                          ? "text-gray-800 bg-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70"
                      )}
                    >
                      {status === 'all' ? 'All' : status === 'active' ? 'Active' : 'Off'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {productsLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                <Package className="h-8 w-8 mb-2 text-gray-300" />
                <p className="text-sm">No products found</p>
                {hasActiveFilters && (
                  <Button variant="link" size="sm" onClick={handleClearFilters}>
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {products.map((product) => {
                  const isQueued = queuedProductIds.has(product.id);
                  const isSelected = selectedProduct?.id === product.id;
                  const hasImages = product.images.length > 0;
                  const isSelecting = selectingProductId === product.id;

                  return (
                    <div
                      key={product.id}
                      onClick={() => hasImages && !isSelecting && selectProduct(product)}
                      className={cn(
                        "relative bg-white rounded-md border-2 overflow-hidden transition-all cursor-pointer",
                        isSelected && "border-blue-500 ring-2 ring-blue-200",
                        isQueued && !isSelected && "border-emerald-400",
                        !isSelected && !isQueued && "border-gray-200 hover:border-gray-300 hover:shadow-md",
                        !hasImages && "opacity-50 cursor-not-allowed",
                        isSelecting && "animate-pulse"
                      )}
                    >
                      {/* Loading overlay */}
                      {isSelecting && (
                        <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
                        </div>
                      )}
                      
                      {/* Image - use cardUrl for better quality */}
                      <div className="aspect-square bg-gray-100 relative">
                        {product.cachedImageUrl ? (
                          <img
                            src={product.cachedImageUrl}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : product.images[0] ? (
                          <img
                            src={product.images[0].cardUrl || product.images[0].url}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="h-8 w-8 text-gray-300" />
                          </div>
                        )}

                        {/* Status badges */}
                        <div className="absolute top-2 left-2 flex flex-col gap-1">
                          {!product.isActive && (
                            <div className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-md flex items-center gap-1">
                              <XCircle className="h-3 w-3" />
                              Inactive
                            </div>
                          )}
                          {product.heroBackgroundOptimized && (
                            <div className="bg-emerald-500 text-white text-xs px-1.5 py-0.5 rounded-md flex items-center gap-1">
                              <Sparkles className="h-3 w-3" />
                              AI
                            </div>
                          )}
                          {product.imagesApprovedByAdmin && (
                            <div className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-md flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              OK
                            </div>
                          )}
                          {product.needsSecondaryReview && (
                            <div className="bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-md flex items-center gap-1">
                              <Flag className="h-3 w-3" />
                              Review
                            </div>
                          )}
                        </div>

                        {/* Active/Inactive Switch */}
                        <div 
                          className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm rounded-md px-1.5 py-1 flex items-center gap-1.5 shadow-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Switch
                            checked={product.isActive}
                            onCheckedChange={() => manageProduct(product.id, product.isActive ? 'deactivate' : 'activate')}
                            disabled={managingProduct === product.id}
                            className="h-4 w-7 data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-300"
                          />
                        </div>

                        {/* Queued indicator */}
                        {isQueued && (
                          <div className="absolute top-8 right-2 bg-emerald-500 text-white rounded-full p-1">
                            <CheckCircle2 className="h-4 w-4" />
                          </div>
                        )}

                        {/* Image count badge */}
                        {hasImages && (
                          <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-md">
                            {product.imageCount} img
                          </div>
                        )}

                        {/* Stock badge */}
                        {product.qoh !== null && product.qoh <= 0 && (
                          <div className="absolute bottom-2 left-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-md">
                            Out of Stock
                          </div>
                        )}
                      </div>

                      {/* Product info */}
                      <div className="p-2">
                        <p className="text-xs font-medium text-gray-900 truncate">
                          {product.name}
                        </p>
                        {(product.brand || product.model) && (
                          <p className="text-xs text-gray-500 truncate">
                            {[product.brand, product.model].filter(Boolean).join(' ')}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {product.storeName}
                        </p>

                        {/* Quick action buttons */}
                        <div className="flex gap-1 mt-2">
                          {/* Approve button - only show if not approved */}
                          {!product.imagesApprovedByAdmin && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs flex-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                              onClick={(e) => {
                                e.stopPropagation();
                                manageProduct(product.id, 'approve_images');
                              }}
                              disabled={managingProduct === product.id}
                            >
                              {managingProduct === product.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Approve
                                </>
                              )}
                            </Button>
                          )}
                          {/* If approved, show a placeholder to keep layout */}
                          {product.imagesApprovedByAdmin && (
                            <div className="flex-1" />
                          )}
                          {/* Flag for secondary review button */}
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              "h-6 w-6 p-0",
                              product.needsSecondaryReview 
                                ? "text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-300 bg-orange-50"
                                : "text-gray-400 hover:text-orange-600 hover:bg-orange-50 border-gray-200"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              manageProduct(product.id, product.needsSecondaryReview ? 'unflag_secondary_review' : 'flag_secondary_review');
                            }}
                            disabled={managingProduct === product.id}
                            title={product.needsSecondaryReview ? 'Remove flag' : 'Flag for secondary review'}
                          >
                            <Flag className="h-3 w-3" />
                          </Button>
                          {/* Delete button */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              manageProduct(product.id, 'delete');
                            }}
                            disabled={managingProduct === product.id}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {totalProducts} products
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="h-7 w-7 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-gray-600 px-2">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="h-7 w-7 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Image Selection (40%) */}
        <div className="w-[40%] bg-gray-50 flex flex-col">
          {selectedProduct ? (
            <>
              {/* Product Header */}
              <div className="p-4 bg-white border-b border-gray-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 leading-tight">
                      {selectedProduct.name}
                    </h3>
                    {(selectedProduct.brand || selectedProduct.model) && (
                      <p className="text-sm text-gray-600 mt-0.5">
                        {[selectedProduct.brand, selectedProduct.model].filter(Boolean).join(' • ')}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      {/* Price */}
                      {selectedProduct.price !== null && (
                        <span className="text-sm font-semibold text-gray-900">
                          ${selectedProduct.price.toLocaleString()}
                        </span>
                      )}
                      {/* QOH */}
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-md",
                        selectedProduct.qoh && selectedProduct.qoh > 0
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      )}>
                        QOH: {selectedProduct.qoh ?? 0}
                      </span>
                      {/* Image counts */}
                      <span className="text-xs text-gray-500">
                        {selectedProduct.dbImageCount} DB • {selectedProduct.jsonbImageCount} JSONB
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedProduct.storeName}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Refresh Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-gray-500 hover:text-gray-700"
                      onClick={refreshSelectedProduct}
                      title="Refresh images"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    
                    {/* Active/Inactive Switch */}
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-xs font-medium",
                        selectedProduct.isActive ? "text-green-600" : "text-gray-400"
                      )}>
                        {selectedProduct.isActive ? "Active" : "Inactive"}
                      </span>
                      <Switch
                        checked={selectedProduct.isActive}
                        onCheckedChange={() => manageProduct(selectedProduct.id, selectedProduct.isActive ? 'deactivate' : 'activate')}
                        disabled={managingProduct === selectedProduct.id}
                        className="data-[state=checked]:bg-green-500"
                      />
                    </div>
                    
                    {/* Delete Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300"
                      onClick={() => manageProduct(selectedProduct.id, 'delete')}
                      disabled={managingProduct === selectedProduct.id}
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      Delete
                    </Button>
                    
                    {/* Close Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedProduct(null)}
                      className="h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Quick Approval Section */}
              <div className="p-4 bg-gray-50 border-b border-gray-200">
                {selectedProduct.imagesApprovedByAdmin ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <CheckCircle2 className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Images Approved</p>
                        <p className="text-xs text-gray-500">
                          {selectedProduct.imagesApprovedAt && 
                            `Approved ${new Date(selectedProduct.imagesApprovedAt).toLocaleDateString()}`
                          }
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => manageProduct(selectedProduct.id, 'unapprove_images')}
                      disabled={managingProduct === selectedProduct.id}
                    >
                      {managingProduct === selectedProduct.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Remove Approval'
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">
                      If these images look good and don&apos;t need AI processing, approve them:
                    </p>
                    <Button
                      size="lg"
                      className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-base"
                      onClick={() => manageProduct(selectedProduct.id, 'approve_images')}
                      disabled={managingProduct === selectedProduct.id}
                    >
                      {managingProduct === selectedProduct.id ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          Approving...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-5 w-5 mr-2" />
                          Approve Images
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {/* Secondary Review Section */}
              <div className="px-4 py-3 bg-white border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center",
                      selectedProduct.needsSecondaryReview ? "bg-orange-100" : "bg-gray-100"
                    )}>
                      <Flag className={cn(
                        "h-4 w-4",
                        selectedProduct.needsSecondaryReview ? "text-orange-600" : "text-gray-400"
                      )} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {selectedProduct.needsSecondaryReview ? 'Flagged for Review' : 'Secondary Review'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {selectedProduct.needsSecondaryReview && selectedProduct.secondaryReviewFlaggedAt
                          ? `Flagged ${new Date(selectedProduct.secondaryReviewFlaggedAt).toLocaleDateString()}`
                          : 'Flag for another admin to check'
                        }
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      selectedProduct.needsSecondaryReview
                        ? "text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-300"
                        : "text-gray-600 hover:text-orange-600 hover:bg-orange-50"
                    )}
                    onClick={() => manageProduct(
                      selectedProduct.id, 
                      selectedProduct.needsSecondaryReview ? 'unflag_secondary_review' : 'flag_secondary_review'
                    )}
                    disabled={managingProduct === selectedProduct.id}
                  >
                    {managingProduct === selectedProduct.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : selectedProduct.needsSecondaryReview ? (
                      <>
                        <X className="h-4 w-4 mr-1" />
                        Remove Flag
                      </>
                    ) : (
                      <>
                        <Flag className="h-4 w-4 mr-1" />
                        Flag for Review
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Image Management Sections */}
              <div className="flex-1 overflow-y-auto">
                {/* Simple Stats Bar */}
                <div className="p-3 bg-white border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-sm">
                        <ImageIcon className="h-4 w-4 text-gray-500" />
                        <span className="font-medium">{selectedProduct.imageCount}</span>
                        <span className="text-gray-500">images</span>
                    </div>
                      <div className="flex items-center gap-1.5 text-sm text-green-600">
                        <Eye className="h-4 w-4" />
                        <span className="font-medium">{selectedProduct.images.filter(i => i.isOnProductPage).length}</span>
                        <span>visible</span>
                    </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Find Images Button */}
                      <Button
                        size="sm"
                        className="h-8 text-sm bg-blue-600 hover:bg-blue-700"
                        onClick={startImageSearch}
                        disabled={isSearchingImages}
                      >
                        {isSearchingImages ? (
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4 mr-1.5" />
                        )}
                        Find Images
                      </Button>
                      {/* Hide All Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-sm text-gray-600 hover:text-gray-800"
                        onClick={() => deselectAllImages(selectedProduct)}
                        disabled={isDeselectingAll || selectedProduct.images.filter(i => i.isOnProductPage).length === 0}
                      >
                        {isDeselectingAll ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                        ) : (
                          <EyeOff className="h-4 w-4 mr-1.5" />
                        )}
                        Hide All
                      </Button>
                  </div>
                  </div>
                </div>

                {/* Inline Image Search Results */}
                <AnimatePresence>
                  {showImageSearch && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                      className="overflow-hidden border-b border-gray-200"
                    >
                      <div className="p-3 bg-blue-50 border-b border-blue-100">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                            <Globe className="h-4 w-4 text-blue-600" />
                            Search Results
                          </h3>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-gray-500 hover:text-gray-700"
                            onClick={() => {
                              setShowImageSearch(false);
                              setImageSearchResults([]);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                    </div>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                              placeholder="Search for images..."
                              value={imageSearchQuery}
                              onChange={(e) => setImageSearchQuery(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && searchForImages()}
                              className="pl-8 h-8 text-sm rounded-md bg-white"
                            />
                          </div>
                          <Button
                            onClick={searchForImages}
                            disabled={isSearchingImages || !imageSearchQuery.trim()}
                            size="sm"
                            className="h-8 px-3"
                          >
                            {isSearchingImages ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Search'
                            )}
                          </Button>
                        </div>
                      </div>
                      
                      <div className="p-3 bg-gray-50">
                        {isSearchingImages ? (
                          <div className="flex flex-col items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-blue-500 mb-2" />
                            <p className="text-sm text-gray-600">Searching...</p>
                          </div>
                        ) : imageSearchResults.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-6 text-gray-400">
                            <Search className="h-8 w-8 mb-2" />
                            <p className="text-sm">No results yet</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2">
                            {imageSearchResults.slice(0, 12).map((image) => (
                              <div
                                key={image.id}
                                className="group relative aspect-square bg-gray-200 rounded-md overflow-hidden border border-gray-200 hover:border-blue-400 transition-all"
                              >
                                <img
                                  src={image.thumbnailUrl || image.url}
                                  alt={image.title}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                                {/* Hover Overlay */}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-colors flex flex-col items-center justify-center opacity-0 group-hover:opacity-100">
                                  <div className="flex flex-col gap-1.5 p-2 w-full">
                                    <Button
                                      size="sm"
                                      className="w-full h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                                      onClick={() => addSearchedImage(image, true)}
                                      disabled={addingSearchImage === image.id}
                                    >
                                      {addingSearchImage === image.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <>
                                          <Sparkles className="h-3 w-3 mr-1" />
                                          Hero
                                        </>
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      className="w-full h-7 text-xs bg-white/90 hover:bg-white text-gray-700"
                                      onClick={() => addSearchedImage(image, false)}
                                      disabled={addingSearchImage === image.id}
                                    >
                                      {addingSearchImage === image.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <>
                                          <Plus className="h-3 w-3 mr-1" />
                                          Add
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {imageSearchResults.length > 12 && (
                          <p className="text-xs text-gray-500 text-center mt-2">
                            Showing 12 of {imageSearchResults.length} results
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* All Images Section */}
                {selectedProduct.dbImages.length > 0 && (
                  <div className="p-4 border-b border-gray-200">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(e) => handleDragEnd(e, 'product_images')}
                    >
                      <SortableContext
                        items={selectedProduct.dbImages.map((img) => img.id)}
                        strategy={rectSortingStrategy}
                      >
                        <div className="grid grid-cols-2 gap-3">
                          {selectedProduct.dbImages.map((image, index) => {
                            const imageKey = `${selectedProduct.id}-${image.id}`;
                            // Use server-calculated visibility (accounts for JSONB + fallback logic)
                            const isVisible = image.isOnProductPage || false;
                            // Primary image at index 0 is locked
                            const isLocked = image.isPrimary && index === 0;
                            // Check if this image is the current cached_image_url (hero)
                            const isCurrentHero = !!(
                              selectedProduct.cachedImageUrl && 
                              (image.cardUrl === selectedProduct.cachedImageUrl || 
                               image.url === selectedProduct.cachedImageUrl)
                            );

                            return (
                              <SortableImageCard
                                key={image.id}
                                image={image}
                                index={index}
                                isVisible={isVisible}
                                isLocked={isLocked}
                                isCurrentHero={isCurrentHero}
                                productId={selectedProduct.id}
                                isAdding={addingToQueue.has(imageKey)}
                                isSetting={settingAsHero.has(imageKey)}
                                isQueued={queuedProductIds.has(selectedProduct.id)}
                                isRemoving={removingImage.has(imageKey)}
                                isTogglingVisibility={togglingVisibility.has(imageKey)}
                                onSetAsHero={() => setAsHero(selectedProduct, image)}
                                onAddToQueue={() => addToQueue(selectedProduct, image)}
                                onRemove={() => removeImage(selectedProduct, image)}
                                onToggleVisibility={() => toggleImageVisibility(selectedProduct, image)}
                              />
                            );
                          })}
                        </div>
                      </SortableContext>
                    </DndContext>
                    {isReordering && (
                      <div className="mt-2 text-xs text-blue-600 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Saving new order...
                      </div>
                    )}
                  </div>
                )}

                {/* Additional Images */}
                {selectedProduct.jsonbImages.length > 0 && (
                  <div className="p-4">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(e) => handleDragEnd(e, 'jsonb')}
                    >
                      <SortableContext
                        items={selectedProduct.jsonbImages.map((img) => img.id)}
                        strategy={rectSortingStrategy}
                      >
                        <div className="grid grid-cols-2 gap-3">
                          {selectedProduct.jsonbImages.map((image, index) => {
                            const imageKey = `${selectedProduct.id}-${image.id}`;
                            // Primary image at index 0 is locked
                            const isLocked = image.isPrimary && index === 0;
                            // Check if this image is the current cached_image_url (hero)
                            const isCurrentHero = !!(
                              selectedProduct.cachedImageUrl && 
                              (image.cardUrl === selectedProduct.cachedImageUrl || 
                               image.url === selectedProduct.cachedImageUrl)
                            );

                            return (
                              <SortableImageCard
                                key={image.id}
                                image={image}
                                index={index}
                                isVisible={true} // JSONB images are always visible
                                isLocked={isLocked}
                                isCurrentHero={isCurrentHero}
                                productId={selectedProduct.id}
                                isAdding={addingToQueue.has(imageKey)}
                                isSetting={settingAsHero.has(imageKey)}
                                isQueued={queuedProductIds.has(selectedProduct.id)}
                                isRemoving={removingImage.has(imageKey)}
                                isTogglingVisibility={togglingVisibility.has(imageKey)}
                                onSetAsHero={() => setAsHero(selectedProduct, image)}
                                onAddToQueue={() => addToQueue(selectedProduct, image)}
                                onRemove={() => removeImage(selectedProduct, image)}
                                onToggleVisibility={() => toggleImageVisibility(selectedProduct, image)}
                              />
                            );
                          })}
                        </div>
                      </SortableContext>
                    </DndContext>
                    {isReordering && (
                      <div className="mt-2 text-xs text-blue-600 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Saving new order...
                      </div>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {selectedProduct.imageCount === 0 && (
                  <div className="flex flex-col items-center justify-center p-8 text-center">
                    <ImageIcon className="h-12 w-12 text-gray-300 mb-3" />
                    <p className="text-gray-500 text-sm">No images available for this product</p>
                  </div>
                )}
              </div>

              {/* Queue Status Footer */}
              <div className="p-4 bg-white border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">{queueCounts.pending}</span> items waiting to be processed
                  </div>
                  {queueCounts.pending > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleProcessNow}
                    >
                      <Sparkles className="h-4 w-4 mr-1.5" />
                      Process Now
                    </Button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  The queue is automatically processed every 5 minutes
                </p>
              </div>
            </>
          ) : (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <ImageIcon className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">Select a Product</h3>
              <p className="text-sm text-center max-w-xs">
                Click on a product from the list to view its images and select one for hero image processing
              </p>
              
              {/* Quick stats */}
              <div className="mt-8 grid grid-cols-2 gap-4 w-full max-w-xs">
                <div className="bg-white rounded-md p-4 text-center border border-gray-200">
                  <div className="text-2xl font-bold text-yellow-600">{queueCounts.pending}</div>
                  <div className="text-xs text-gray-500 mt-1">Pending</div>
                </div>
                <div className="bg-white rounded-md p-4 text-center border border-gray-200">
                  <div className="text-2xl font-bold text-emerald-600">{queueCounts.completed}</div>
                  <div className="text-xs text-gray-500 mt-1">Completed</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Main Content - Bulk Review Tab */}
      {mainTab === 'bulk-review' && (
        <div className="h-[calc(100vh-73px)] flex flex-col bg-gray-50">
          {/* Bulk Review Header */}
          <div className="bg-white border-b border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Bulk Image Review</h2>
                  <p className="text-sm text-gray-500">Quickly find and approve hero images for products</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Listing Type Filter */}
                <div className="flex items-center bg-gray-100 p-0.5 rounded-md">
                  {(['all', 'private_listing', 'lightspeed'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setBulkListingType(type)}
                      className={cn(
                        "px-2 py-1 text-xs font-medium rounded-md transition-colors",
                        bulkListingType === type
                          ? "text-gray-800 bg-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70"
                      )}
                    >
                      {type === 'all' ? 'All' : type === 'private_listing' ? 'Private' : 'Lightspeed'}
                    </button>
                  ))}
                </div>

                {/* Brand Filter */}
                <Select 
                  value={bulkSelectedBrand || '__all__'} 
                  onValueChange={(v) => setBulkSelectedBrand(v === '__all__' ? '' : v)}
                >
                  <SelectTrigger className="h-8 w-32 text-xs rounded-md">
                    <SelectValue placeholder="Brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Brands</SelectItem>
                    {filterOptions.brands.map((brand) => (
                      <SelectItem key={brand} value={brand}>
                        {brand}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Store Filter */}
                <Select 
                  value={bulkSelectedStoreId || '__all__'} 
                  onValueChange={(v) => setBulkSelectedStoreId(v === '__all__' ? '' : v)}
                >
                  <SelectTrigger className="h-8 w-36 text-xs rounded-md">
                    <SelectValue placeholder="Store" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Stores</SelectItem>
                    {filterOptions.stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name} ({store.productCount})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Has Images Filter */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">Images:</span>
                  <div className="flex items-center bg-gray-100 p-0.5 rounded-md">
                    {(['all', 'with_images', 'without_images'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => setBulkHasImagesFilter(status)}
                        className={cn(
                          "px-2 py-1 text-xs font-medium rounded-md transition-colors",
                          bulkHasImagesFilter === status
                            ? "text-gray-800 bg-white shadow-sm"
                            : "text-gray-600 hover:bg-gray-200/70"
                        )}
                      >
                        {status === 'all' ? 'All' : status === 'with_images' ? 'Has' : 'None'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Approval Filter */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">Approved:</span>
                  <div className="flex items-center bg-gray-100 p-0.5 rounded-md">
                    {(['all', 'not_approved', 'approved'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => setBulkApprovalFilter(status)}
                        className={cn(
                          "px-2 py-1 text-xs font-medium rounded-md transition-colors",
                          bulkApprovalFilter === status
                            ? "text-gray-800 bg-white shadow-sm"
                            : "text-gray-600 hover:bg-gray-200/70"
                        )}
                      >
                        {status === 'all' ? 'All' : status === 'approved' ? 'Yes' : 'No'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Second Row: Search and Image Results Control */}
            <div className="flex items-center justify-between">
              {/* Search Input */}
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={bulkSearchQuery}
                    onChange={(e) => setBulkSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !bulkLoading) {
                        loadBulkProducts();
                      }
                    }}
                    placeholder="Search products by name, brand, or model..."
                    className="w-full h-8 pl-9 pr-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {bulkSearchQuery && (
                    <button
                      onClick={() => setBulkSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Images Per Product Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Images per product:</span>
                  <div className="flex items-center bg-gray-100 p-0.5 rounded-md">
                    {[5, 8, 10, 15, 20].map((num) => (
                      <button
                        key={num}
                        onClick={() => setBulkResultsPerImage(num)}
                        className={cn(
                          "px-2.5 py-1 text-sm font-medium rounded-md transition-colors",
                          bulkResultsPerImage === num
                            ? "text-gray-800 bg-white shadow-sm"
                            : "text-gray-600 hover:bg-gray-200/70"
                        )}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-6 w-px bg-gray-300" />

                {/* Batch Size Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Load:</span>
                  <div className="flex items-center bg-gray-100 p-0.5 rounded-md">
                    {[5, 10, 20, 30, 50].map((size) => (
                      <button
                        key={size}
                        onClick={() => setBulkBatchSize(size)}
                        className={cn(
                          "px-2.5 py-1 text-sm font-medium rounded-md transition-colors",
                          bulkBatchSize === size
                            ? "text-gray-800 bg-white shadow-sm"
                            : "text-gray-600 hover:bg-gray-200/70"
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Load Products Button */}
                <Button
                  onClick={loadBulkProducts}
                  disabled={bulkLoading}
                  variant="outline"
                >
                  {bulkLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Load Products
                    </>
                  )}
                </Button>

                {/* Get Images Button */}
                {bulkProducts.length > 0 && (
                  <Button
                    onClick={() => {
                      console.log('[BULK REVIEW] Get Images clicked. Products:', bulkProducts.length, 'Pending:', bulkProducts.filter(p => p.status === 'pending').length);
                      fetchBulkImages();
                    }}
                    disabled={bulkSearching || bulkProducts.every(p => p.status !== 'pending')}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {bulkSearching ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4 mr-2" />
                        Get Images
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Progress Stats */}
            {bulkProducts.length > 0 && (
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                  <span className="text-gray-600">
                    {bulkProducts.filter(p => p.status === 'pending').length} pending
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                  <span className="text-blue-600">
                    {bulkProducts.filter(p => p.status === 'searching').length} searching
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                  <span className="text-amber-600">
                    {bulkProducts.filter(p => p.status === 'ready').length} ready
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span className="text-emerald-600">
                    {bulkApprovedCount} approved
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                  <span className="text-gray-500">
                    {bulkSkippedCount} skipped
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Bulk Review Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {bulkProducts.length === 0 && !bulkNoProductsFound ? (
              /* Empty State - Not loaded yet */
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <Sparkles className="h-10 w-10 text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Bulk Image Review</h3>
                <p className="text-center max-w-md mb-6">
                  Select how many products you want to review, then click "Load Products" to get started.
                  We'll fetch images for each product and suggest the best hero image.
                </p>
                <Button
                  onClick={loadBulkProducts}
                  disabled={bulkLoading}
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {bulkLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Package className="h-5 w-5 mr-2" />
                      Load {bulkBatchSize} Products
                    </>
                  )}
                </Button>
              </div>
            ) : bulkProducts.length === 0 && bulkNoProductsFound ? (
              /* Empty State - No unapproved products */
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">All Caught Up!</h3>
                <p className="text-center max-w-md mb-6">
                  There are no unapproved products at the moment. All active products have been reviewed.
                </p>
                <Button
                  onClick={() => setMainTab('products')}
                  variant="outline"
                >
                  <Package className="h-5 w-5 mr-2" />
                  Go to Products
                </Button>
              </div>
            ) : (
              <>
                {/* Completion Banner */}
                {bulkProducts.length > 0 && bulkProducts.every(p => p.status === 'approved' || p.status === 'skipped' || p.status === 'error') && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-emerald-50 border border-emerald-200 rounded-md p-6 mb-6 text-center"
                  >
                    <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-emerald-800 mb-1">Batch Complete!</h3>
                    <p className="text-emerald-600 mb-4">
                      You approved {bulkApprovedCount} products and skipped {bulkSkippedCount}
                    </p>
                    <Button
                      onClick={loadBulkProducts}
                      disabled={bulkLoading}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Load Next {bulkBatchSize} Products
                    </Button>
                  </motion.div>
                )}

                {/* Product Review Rows - Compact Row Layout */}
                <div className="space-y-2">
                  {bulkProducts.map((product, index) => (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className={cn(
                      "bg-white rounded-lg border px-3 py-2 transition-all",
                      product.status === 'approved' && "border-emerald-300 bg-emerald-50/30",
                      product.status === 'skipped' && "border-gray-200 opacity-40",
                      product.status === 'ready' && bulkCurrentIndex === index && "ring-2 ring-blue-400 border-blue-300",
                      product.status === 'searching' && "border-blue-200 bg-blue-50/30",
                      product.status === 'error' && "border-red-200 bg-red-50/30",
                      product.status === 'pending' && "border-gray-200"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {/* Product Info - Left Side */}
                      <div className="w-64 flex-shrink-0">
                        <div className="flex items-start gap-2">
                          <p className="text-sm font-medium text-gray-900 leading-tight line-clamp-2 flex-1" title={product.name}>
                            {product.name}
                          </p>
                          <div className="flex-shrink-0 flex items-center gap-1">
                            {/* Approval status badge */}
                            {product.imagesApprovedByAdmin ? (
                              <div className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-medium rounded flex items-center gap-0.5">
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                OK
                              </div>
                            ) : (
                              <div className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-medium rounded">
                                Pending
                              </div>
                            )}
                            {/* Image count badge */}
                            {product.existingImages.length > 0 && (
                              <div className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-medium rounded">
                                {product.existingImages.length} img{product.existingImages.length !== 1 ? 's' : ''}
                              </div>
                            )}
                            {/* No images indicator */}
                            {product.existingImages.length === 0 && !product.hasDisplayableImage && (
                              <div className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-medium rounded">
                                No img
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {product.brand && (
                            <span className="text-xs text-gray-500">{product.brand}</span>
                          )}
                          {product.brand && product.storeName && (
                            <span className="text-xs text-gray-400">•</span>
                          )}
                          <span className="text-xs text-gray-400 truncate">{product.storeName}</span>
                        </div>
                      </div>

                      {/* Status indicator */}
                      <div className="w-20 flex-shrink-0">
                        {product.status === 'pending' && (
                          <div className="flex items-center gap-1.5 text-gray-400">
                            <Clock className="h-3.5 w-3.5" />
                            <span className="text-xs">Waiting</span>
                          </div>
                        )}
                        {product.status === 'searching' && (
                          <div className="flex items-center gap-1.5 text-blue-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span className="text-xs">Searching</span>
                          </div>
                        )}
                        {product.status === 'error' && (
                          <div className="flex items-center gap-1.5 text-red-500">
                            <XCircle className="h-3.5 w-3.5" />
                            <span className="text-xs">Error</span>
                          </div>
                        )}
                        {product.status === 'approved' && (
                          <div className="flex items-center gap-1.5 text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span className="text-xs font-medium">Done</span>
                          </div>
                        )}
                        {product.status === 'skipped' && (
                          <div className="flex items-center gap-1.5 text-gray-400">
                            <span className="text-xs">Skipped</span>
                          </div>
                        )}
                        {product.status === 'ready' && !product.selectedImage && (
                          <div className="flex items-center gap-1.5 text-amber-500">
                            <span className="text-xs">Double-click to select hero</span>
                          </div>
                        )}
                        {product.status === 'ready' && product.selectedImage && (
                          <div className="flex items-center gap-1.5 text-purple-600">
                            <Sparkles className="h-3.5 w-3.5" />
                            <span className="text-xs font-medium">Ready</span>
                          </div>
                        )}
                      </div>

                      {/* Images Row - Scrollable */}
                      <div className="flex-1 min-w-0">
                        {/* Show existing images if available */}
                        {product.existingImages.length > 0 && (
                          <div className="flex items-center gap-2 overflow-x-auto pb-1 mb-2 border-b border-gray-100 pb-2">
                            <span className="text-xs font-medium text-gray-500 flex-shrink-0">Current:</span>
                            {product.existingImages.map((img) => {
                              const isHero = product.heroImageId === img.id;
                              const isSettingHero = settingExistingAsHero === `${product.id}-${img.id}`;
                              const isRemovingImg = removingExistingImage === `${product.id}-${img.id}`;
                              
                              return (
                                <div
                                  key={img.id}
                                  className={cn(
                                    "relative flex-shrink-0 w-28 h-28 rounded-lg overflow-hidden border-3 transition-all group",
                                    isHero
                                      ? "border-yellow-500 ring-2 ring-yellow-300 shadow-lg"
                                      : "border-gray-200 hover:border-gray-400"
                                  )}
                                >
                                  <img
                                    src={img.thumbnailUrl || img.url}
                                    alt="Current"
                                    className="w-full h-full object-cover"
                                  />
                                  {isHero && (
                                    <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-yellow-500 text-white text-[10px] font-bold rounded-md flex items-center gap-0.5">
                                      <Flag className="h-2.5 w-2.5 fill-white" />
                                      HERO
                                    </div>
                                  )}
                                  {/* Action buttons overlay - show on hover */}
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 p-1">
                                    {!isHero && (
                                      <button
                                        onClick={() => setExistingImageAsHero(product.id, img)}
                                        disabled={isSettingHero || isRemovingImg}
                                        className="w-full px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-medium rounded-md flex items-center justify-center gap-1 disabled:opacity-50"
                                      >
                                        {isSettingHero ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <Flag className="h-3 w-3" />
                                        )}
                                        Set Hero
                                      </button>
                                    )}
                                    <button
                                      onClick={() => removeExistingImage(product.id, img.id, index)}
                                      disabled={isSettingHero || isRemovingImg}
                                      className="w-full px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-medium rounded-md flex items-center justify-center gap-1 disabled:opacity-50"
                                    >
                                      {isRemovingImg ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-3 w-3" />
                                      )}
                                      Remove
                                    </button>
                                  </div>
                                  <div className="absolute bottom-1 left-1 right-1 group-hover:opacity-0 transition-opacity">
                                    <div className="bg-gray-900/70 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] text-white text-center">
                                      Existing
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        
                        {/* Show search results */}
                        {(product.status === 'ready' || product.status === 'approved') && product.searchResults.length > 0 && (
                          <div className="flex items-center gap-2 overflow-x-auto pb-1">
                            {product.existingImages.length > 0 && (
                              <span className="text-xs font-medium text-gray-500 flex-shrink-0">New:</span>
                            )}
                            {product.searchResults.slice(0, 10).map((img) => {
                              const isExcluded = product.excludedImageIds.has(img.id);
                              const isSelected = product.selectedImage?.id === img.id;
                              const isAiImage = img.id.startsWith('ai-');
                              
                              return (
                                <button
                                  key={img.id}
                                  onClick={() => {
                                    // Single click: toggle exclude/include
                                    if (product.status === 'approved') return;
                                    toggleExcludeImage(index, img.id);
                                  }}
                                  onDoubleClick={() => {
                                    // Double click: select as hero
                                    if (product.status === 'approved') return;
                                    if (isExcluded) {
                                      toggleExcludeImage(index, img.id);
                                    }
                                    selectBulkImage(index, img);
                                  }}
                                  onMouseEnter={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                                    hoverTimeoutRef.current = setTimeout(() => {
                                      setHoverPreview({ img, x: rect.left + rect.width / 2, y: rect.top });
                                    }, 800);
                                  }}
                                  onMouseLeave={() => {
                                    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                                    setHoverPreview(null);
                                  }}
                                  disabled={product.status === 'approved'}
                                  className={cn(
                                    "relative flex-shrink-0 w-28 h-28 rounded-lg overflow-hidden border-3 transition-all",
                                    isSelected
                                      ? "border-purple-500 ring-2 ring-purple-300 scale-105 shadow-lg"
                                      : isAiImage && !isExcluded
                                        ? "border-purple-400 ring-2 ring-purple-200"
                                        : isExcluded
                                          ? "border-red-400 border-dashed"
                                          : "border-emerald-400 hover:border-blue-400 hover:scale-105",
                                    product.status === 'approved' && "cursor-default"
                                  )}
                                >
                                  <img
                                    src={img.thumbnailUrl || img.url}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                  {/* AI Badge */}
                                  {isAiImage && (
                                    <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-purple-600 text-white text-[10px] font-medium rounded-md flex items-center gap-0.5">
                                      <Sparkles className="h-2.5 w-2.5" />
                                      AI
                                    </div>
                                  )}
                                  {isSelected && (
                                    <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center">
                                      <Sparkles className="h-6 w-6 text-purple-600" />
                                    </div>
                                  )}
                                  {!isExcluded && !isSelected && !isAiImage && (
                                    <div className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                                      <CheckCircle2 className="h-3 w-3 text-white" />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {product.status === 'pending' && (
                          <div className="h-28 flex items-center text-gray-300 text-xs">
                            Click "Get Images" to search...
                          </div>
                        )}
                        {product.status === 'searching' && (
                          <div className="h-28 flex items-center gap-2">
                            {[1,2,3,4,5].map(i => (
                              <div key={i} className="w-28 h-28 bg-gray-100 rounded-lg animate-pulse" />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Action Buttons - Right Side */}
                      <div className="flex-shrink-0 flex items-center gap-2">
                        {product.status === 'ready' && (
                          <>
                            {/* AI Status Indicator */}
                            {product.aiStatus === 'processing' && (
                              <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-100 text-purple-700 rounded-md text-xs animate-pulse">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                AI Processing...
                              </div>
                            )}
                            {product.aiStatus === 'ready' && (
                              <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-xs">
                                <Sparkles className="h-3 w-3" />
                                AI Ready
                              </div>
                            )}
                            {product.aiStatus === 'error' && (
                              <div className="flex items-center gap-1.5 px-2 py-1 bg-red-100 text-red-700 rounded-md text-xs" title={product.aiError}>
                                AI Failed
                              </div>
                            )}
                            
                            {/* Quick Approve Button - for products with existing images that just need approval */}
                            {!product.imagesApprovedByAdmin && (product.existingImages.length > 0 || product.hasDisplayableImage) && !product.selectedImage && (
                              <Button
                                onClick={() => quickApproveBulkProduct(index)}
                                size="sm"
                                className="h-8 text-xs bg-blue-600 hover:bg-blue-700"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                Quick Approve
                              </Button>
                            )}
                            
                            {/* Approve Button - for new selected images */}
                            <Button
                              onClick={() => approveBulkProduct(index)}
                              disabled={!product.selectedImage}
                              size="sm"
                              className={cn(
                                "h-8 text-xs",
                                product.selectedImage 
                                  ? "bg-emerald-600 hover:bg-emerald-700" 
                                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
                              )}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                              Approve
                            </Button>
                            
                            {/* AI Preview Button - only shows if no AI image yet */}
                            {!product.aiGeneratedImage && (
                              <Button
                                onClick={() => generateAiPreview(index)}
                                disabled={!product.selectedImage || optimizingProducts.has(index)}
                                size="sm"
                                variant="outline"
                                className={cn(
                                  "h-8 text-xs",
                                  product.selectedImage 
                                    ? "border-purple-300 text-purple-700 hover:bg-purple-50" 
                                    : "text-gray-300 cursor-not-allowed"
                                )}
                              >
                                {optimizingProducts.has(index) ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                                    + AI
                                  </>
                                )}
                              </Button>
                            )}
                            
                            <Button
                              onClick={() => skipBulkProduct(index)}
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs text-gray-400 hover:text-gray-600"
                            >
                              Skip
                            </Button>
                          </>
                        )}
                        {product.status === 'approved' && product.selectedImage && (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-xs">
                              <CheckCircle2 className="h-3 w-3" />
                              Approved
                            </div>
                            {product.aiGeneratedImage && (
                              <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-100 text-purple-700 rounded-md text-xs">
                                <Sparkles className="h-3 w-3" />
                                AI
                              </div>
                            )}
                            <div className="w-20 h-20 rounded-lg overflow-hidden border-2 border-emerald-400">
                              <img
                                src={product.selectedImage.thumbnailUrl || product.selectedImage.url}
                                alt="Approved"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Hover Preview Popup */}
      {hoverPreview && (
        <div 
          className="fixed z-[100] pointer-events-none"
          style={{
            left: hoverPreview.x,
            top: hoverPreview.y - 10,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-xl shadow-2xl border border-gray-200 p-2"
          >
            <img
              src={hoverPreview.img.url}
              alt=""
              className="w-80 h-80 object-contain rounded-lg bg-gray-50"
            />
            <div className="mt-1.5 px-1">
              <p className="text-sm text-gray-700 truncate max-w-80">{hoverPreview.img.source}</p>
              <p className="text-xs text-gray-400">{hoverPreview.img.width} × {hoverPreview.img.height}px</p>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}
