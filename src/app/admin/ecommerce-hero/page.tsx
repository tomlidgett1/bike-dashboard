'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
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
  Filter,
  ImagePlus,
  Trash2,
  Power,
  PowerOff,
  MoreVertical,
  Database,
  FileJson,
  Star,
  Eye,
  EyeOff,
  Info,
  GripVertical,
  Lock,
} from 'lucide-react';
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
    disabled: isLocked, // Disable dragging for primary/locked images
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  const hasCloudinaryUrl = (image.cardUrl || image.url).includes('cloudinary');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative bg-white rounded-md border-2 overflow-hidden transition-all",
        isCurrentHero && "border-purple-500 ring-2 ring-purple-200",
        !isCurrentHero && image.isPrimary && "border-blue-400 ring-2 ring-blue-100",
        !isCurrentHero && !image.isPrimary && "border-gray-200 hover:border-gray-300",
        !isVisible && "opacity-60",
        isDragging && "shadow-lg"
      )}
    >
      {/* Image with drag handle */}
      <div className="aspect-square bg-gray-100 relative">
        <img
          src={image.cardUrl || image.url}
          alt="Product image"
          className="w-full h-full object-cover"
        />
        
        {/* Drag handle overlay */}
        {!isLocked ? (
          <div
            {...attributes}
            {...listeners}
            className="absolute inset-0 cursor-grab active:cursor-grabbing flex items-center justify-center bg-black/0 hover:bg-black/10 transition-colors group"
          >
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-md p-2 shadow">
              <GripVertical className="h-5 w-5 text-gray-600" />
            </div>
          </div>
        ) : (
          <div className="absolute bottom-2 left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1">
            <Lock className="h-3 w-3" />
            Locked #1
          </div>
        )}
      </div>

      {/* Badges */}
      <div className="absolute top-2 left-2 flex flex-col gap-1">
        {/* HERO badge - most prominent */}
        {isCurrentHero && (
          <div className="bg-purple-600 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1 font-bold shadow-md">
            <ImageIcon className="h-3 w-3" />
            HERO
          </div>
        )}
        {image.isPrimary && !isCurrentHero && (
          <div className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-md flex items-center gap-1">
            <Star className="h-3 w-3" />
            Primary
          </div>
        )}
        {image.isAiGenerated && (
          <div className="bg-emerald-500 text-white text-xs px-2 py-0.5 rounded-md flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            AI
          </div>
        )}
      </div>

      {/* Sort order and visibility badges */}
      <div className="absolute top-2 right-2 flex flex-col gap-1">
        <div className={cn(
          "text-white text-xs px-1.5 py-0.5 rounded-md",
          image.source === 'product_images' ? "bg-gray-700" : 
          image.source === 'canonical' ? "bg-blue-600" : "bg-orange-600"
        )}>
          #{index + 1}
        </div>
        {/* Visibility on product page */}
        {isVisible ? (
          <div className="bg-green-600 text-white text-xs px-1.5 py-0.5 rounded-md flex items-center gap-0.5" title="Shown on product page">
            <Eye className="h-2.5 w-2.5" />
            <span className="text-[10px]">Page</span>
          </div>
        ) : (
          <div className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-md flex items-center gap-0.5" title="NOT shown on product page">
            <EyeOff className="h-2.5 w-2.5" />
            <span className="text-[10px]">Hidden</span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="p-2 space-y-1.5">
        {/* Set as Hero button - show for any Cloudinary image that's NOT the current hero */}
        {hasCloudinaryUrl && !isCurrentHero && (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-xs border-purple-300 text-purple-700 hover:bg-purple-50"
            onClick={onSetAsHero}
            disabled={isSetting}
          >
            {isSetting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
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
          <div className="w-full h-7 text-xs bg-purple-100 text-purple-700 rounded-md flex items-center justify-center font-medium">
            ✓ Current Hero Image
          </div>
        )}

        {/* Visibility toggle button */}
        <Button
          size="sm"
          variant="outline"
          className={cn(
            "w-full h-7 text-xs",
            isVisible 
              ? "border-green-300 text-green-700 hover:bg-green-50" 
              : "border-amber-300 text-amber-700 hover:bg-amber-50"
          )}
          onClick={onToggleVisibility}
          disabled={isTogglingVisibility}
        >
          {isTogglingVisibility ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isVisible ? (
            <>
              <Eye className="h-3 w-3 mr-1" />
              On Page
            </>
          ) : (
            <>
              <EyeOff className="h-3 w-3 mr-1" />
              Add to Page
            </>
          )}
        </Button>

        {/* Transform button */}
        <Button
          size="sm"
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
  const [heroOptimized, setHeroOptimized] = useState<'all' | 'optimized' | 'not_optimized'>('all');
  const [adminApproved, setAdminApproved] = useState<'all' | 'approved' | 'not_approved'>('all');
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
  // Track product management operations
  const [managingProduct, setManagingProduct] = useState<string | null>(null);
  // Track product selection loading
  const [selectingProductId, setSelectingProductId] = useState<string | null>(null);

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
        // Removed has_images filter - show all products in admin tool
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
      if (heroOptimized !== 'all') {
        params.set('hero_optimized', heroOptimized);
      }
      if (adminApproved !== 'all') {
        params.set('admin_approved', adminApproved);
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
  }, [page, search, listingType, selectedBrand, selectedStoreId, inStockOnly, heroOptimized, adminApproved, activeStatus]);

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
  }, [page, search, listingType, selectedBrand, selectedStoreId, inStockOnly, heroOptimized, adminApproved, activeStatus]);

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
    
    // Check if image has a Cloudinary URL
    const newHeroUrl = image.cardUrl || image.url;
    if (!newHeroUrl.includes('cloudinary')) {
      console.error('Image must be a Cloudinary URL');
      return;
    }

    setSettingAsHero(prev => new Set([...prev, imageKey]));

    try {
      const response = await fetch('/api/admin/ecommerce-hero/set-hero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          imageId: image.id,
          cardUrl: newHeroUrl,
          thumbnailUrl: image.thumbnailUrl,
          galleryUrl: image.galleryUrl,
          detailUrl: image.detailUrl,
          source: image.source,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Update local state instead of refetching
        const updateProduct = (p: Product): Product => {
          if (p.id !== product.id) return p;
          
          return {
            ...p,
            cachedImageUrl: newHeroUrl,
            cachedThumbnailUrl: image.thumbnailUrl || newHeroUrl,
          };
        };

        setProducts(prev => prev.map(updateProduct));
        
        // Update selected product
        if (selectedProduct?.id === product.id) {
          setSelectedProduct(updateProduct(selectedProduct));
        }
      } else {
        console.error('Failed to set hero:', data.error);
      }
    } catch (error) {
      console.error('Failed to set hero:', error);
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

  const manageProduct = async (productId: string, action: 'deactivate' | 'activate' | 'delete' | 'approve_images' | 'unapprove_images') => {
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
    setHeroOptimized('all');
    setAdminApproved('all');
    setActiveStatus('all');
    setListingType('all');
    setPage(1);
  };

  const hasActiveFilters = search || selectedBrand || selectedStoreId || inStockOnly || heroOptimized !== 'all' || adminApproved !== 'all' || activeStatus !== 'all' || listingType !== 'all';

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">E-Commerce Hero Images</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Select products and choose which image to transform into a professional hero shot
            </p>
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

              {/* Image Management Sections */}
              <div className="flex-1 overflow-y-auto">
                {/* Stats Bar */}
                <div className="p-3 bg-white border-b border-gray-200">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 text-sm">
                      <Database className="h-4 w-4 text-gray-500" />
                      <span className="font-medium">{selectedProduct.dbImageCount}</span>
                      <span className="text-gray-500">DB</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm">
                      <FileJson className="h-4 w-4 text-orange-500" />
                      <span className="font-medium">{selectedProduct.jsonbImageCount}</span>
                      <span className="text-gray-500">JSONB</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm ml-auto">
                      <Star className="h-4 w-4 text-blue-500" />
                      <span className="text-gray-500">
                        {selectedProduct.images.filter(i => i.isPrimary).length} Primary
                      </span>
                    </div>
                  </div>
                  {/* Visibility explanation */}
                  <div className="mt-2 p-2 bg-blue-50 rounded-md flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-blue-700">
                      <span className="font-medium">Product Page shows:</span> JSONB images first (if any), 
                      otherwise all DB images. Images with <Eye className="h-3 w-3 inline mx-0.5" /> are visible.
                      <span className="font-medium text-red-600 ml-1">Delete is permanent.</span>
                    </p>
                  </div>
                </div>

                {/* Database Images Section - Drag & Drop */}
                {selectedProduct.dbImages.length > 0 && (
                  <div className="p-4 border-b border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <Database className="h-4 w-4 text-gray-600" />
                      <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                        Database Images ({selectedProduct.dbImageCount})
                      </h4>
                      {/* Legend for visibility badges */}
                      <span className="ml-auto text-xs text-gray-500">
                        <span className="text-green-600">Page</span> = shown on product page, <span className="text-red-500">Hidden</span> = not shown
                      </span>
                    </div>
                    {/* Drag instruction */}
                    <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                      <GripVertical className="h-3 w-3" />
                      Drag to reorder. Primary image is locked at #1.
                    </p>
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

                {/* JSONB Images Section - Drag & Drop */}
                {selectedProduct.jsonbImages.length > 0 && (
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <FileJson className="h-4 w-4 text-orange-500" />
                      <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                        JSONB Images ({selectedProduct.jsonbImageCount})
                      </h4>
                      {/* JSONB images are always visible */}
                      <span className="ml-auto text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        Visible on product page
                      </span>
                    </div>
                    {/* Drag instruction */}
                    <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                      <GripVertical className="h-3 w-3" />
                      Drag to reorder. Primary image is locked at #1.
                    </p>
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
    </div>
  );
}
