'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, CheckCircle2, XCircle, Sparkles, Star, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  // Cloudinary URLs
  cloudinary_url: string | null;
  thumbnail_url: string | null;
  card_url: string | null;
  detail_url: string | null;
}

interface Product {
  id: string;
  normalized_name: string;
  upc: string | null;
  category: string | null;
  manufacturer: string | null;
  marketplace_category: string | null;
  marketplace_subcategory: string | null;
  marketplace_level_3_category: string | null;
  images: ProductImage[];
  isDiscovering: boolean;
}

export default function ImageQAPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [activeTab, setActiveTab] = useState<'needs_review' | 'completed' | 'all'>('needs_review');
  const [stats, setStats] = useState({ total: 0, completed: 0, needsReview: 0 });
  const [discovering, setDiscovering] = useState<Set<string>>(new Set());
  const [completedProducts, setCompletedProducts] = useState<Set<string>>(new Set());

  // Filter states
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('');
  const [selectedLevel3, setSelectedLevel3] = useState<string>('');
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>('');

  // Available filter options
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [level3Categories, setLevel3Categories] = useState<string[]>([]);
  const [manufacturers, setManufacturers] = useState<string[]>([]);

  const supabase = createClient();

  // Load completed products from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('imageqa_completed_products');
    if (saved) {
      try {
        const ids = JSON.parse(saved);
        setCompletedProducts(new Set(ids));
      } catch (e) {
        console.error('Failed to load completed products:', e);
      }
    }
  }, []);

  // Save completed products to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('imageqa_completed_products', JSON.stringify([...completedProducts]));
  }, [completedProducts]);

  // Fetch unique filter values on mount using efficient database function
  const fetchFilterOptions = async () => {
    try {
      const { data, error } = await supabase.rpc('get_canonical_filter_options');
      
      if (error) {
        console.error('[FILTERS] Error fetching filter options:', error);
        return;
      }
      
      if (data) {
        setCategories(data.categories || []);
        setSubcategories(data.subcategories || []);
        setLevel3Categories(data.level3_categories || []);
        setManufacturers(data.manufacturers || []);
        
        console.log('[FILTERS] Loaded filter options:', {
          categories: data.categories?.length || 0,
          subcategories: data.subcategories?.length || 0,
          level3: data.level3_categories?.length || 0,
          manufacturers: data.manufacturers?.length || 0
        });
      }
    } catch (error) {
      console.error('Failed to fetch filter options:', error);
    }
  };

  useEffect(() => {
    fetchFilterOptions();
  }, []);

  // Fetch products with images
  const fetchProducts = async (pageNum: number = 1, searchTerm: string = '') => {
    try {
      let query = supabase
        .from('canonical_products')
        .select(`
          id,
          normalized_name,
          upc,
          category,
          manufacturer,
          marketplace_category,
          marketplace_subcategory,
          marketplace_level_3_category,
          product_images (
            id,
            storage_path,
            external_url,
            is_downloaded,
            is_primary,
            approval_status,
            width,
            height,
            sort_order,
            created_at,
            cloudinary_url,
            thumbnail_url,
            card_url,
            detail_url
          )
        `)
        .order('created_at', { ascending: false })
        .range((pageNum - 1) * 20, pageNum * 20 - 1);

      if (searchTerm) {
        query = query.or(`normalized_name.ilike.%${searchTerm}%,upc.ilike.%${searchTerm}%`);
      }

      // Apply category filters
      if (selectedCategory) {
        query = query.eq('marketplace_category', selectedCategory);
      }
      if (selectedSubcategory) {
        query = query.eq('marketplace_subcategory', selectedSubcategory);
      }
      if (selectedLevel3) {
        query = query.eq('marketplace_level_3_category', selectedLevel3);
      }
      if (selectedManufacturer) {
        query = query.eq('manufacturer', selectedManufacturer);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Get URLs for images - prioritise Cloudinary, fall back to external/storage
      const productsWithUrls = await Promise.all(
        (data || []).map(async (product: any) => {
          const imagesWithUrls = await Promise.all(
            (product.product_images || []).map(async (img: any) => {
              let url: string;
              
              // Priority 1: Cloudinary card_url (400px, optimised)
              if (img.card_url) {
                url = img.card_url;
              }
              // Priority 2: Cloudinary main URL
              else if (img.cloudinary_url) {
                url = img.cloudinary_url;
              }
              // Priority 3: External URL (pending images)
              else if (img.external_url) {
                url = img.external_url;
              } 
              // Priority 4: Legacy Supabase Storage URL
              else if (img.storage_path) {
                const { data: urlData } = supabase.storage
                  .from('product-images')
                  .getPublicUrl(img.storage_path);
                url = urlData.publicUrl;
              } 
              // Fallback
              else {
                url = '/placeholder-product.svg';
              }
              
              return { ...img, url };
            })
          );

          return {
            ...product,
            images: imagesWithUrls.sort((a, b) => {
              // Sort: approved first, then pending, then rejected, by sort_order
              const statusOrder: Record<string, number> = { approved: 0, pending: 1, rejected: 2 };
              const statusA = statusOrder[a.approval_status] ?? 3;
              const statusB = statusOrder[b.approval_status] ?? 3;
              const statusDiff = statusA - statusB;
              if (statusDiff !== 0) return statusDiff;
              return (a.sort_order || 0) - (b.sort_order || 0);
            }),
            isDiscovering: false,
          };
        })
      );

      if (pageNum === 1) {
        setProducts(productsWithUrls);
      } else {
        // Avoid duplicates when loading more
        setProducts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newProducts = productsWithUrls.filter(p => !existingIds.has(p.id));
          return [...prev, ...newProducts];
        });
      }

      setHasMore(productsWithUrls.length === 20);

      // Calculate stats - only count as completed if explicitly marked by user
      const completed = productsWithUrls.filter(p => completedProducts.has(p.id)).length;
      const needsReview = productsWithUrls.filter(p => !completedProducts.has(p.id)).length;
      
      setStats({
        total: productsWithUrls.length,
        completed,
        needsReview,
      });

    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-discover images for products on page load
  const autoDiscoverImages = async () => {
    const productsNeedingImages = products
      .filter(p => p.images.filter(img => img.approval_status === 'pending').length === 0)
      .slice(0, 10); // Process 10 at a time

    if (productsNeedingImages.length === 0) return;

    console.log(`[AUTO DISCOVER] Starting discovery for ${productsNeedingImages.length} products`);

    // Mark as discovering
    setProducts(prev => prev.map(p => 
      productsNeedingImages.some(np => np.id === p.id) 
        ? { ...p, isDiscovering: true }
        : p
    ));

    // Trigger discovery for each product
    for (const product of productsNeedingImages) {
      try {
        await fetch('/api/admin/images/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ canonicalProductId: product.id }),
        });
      } catch (error) {
        console.error(`Failed to discover images for ${product.id}:`, error);
      }
    }

    // Poll for updates
    setTimeout(() => {
      fetchProducts(page, search);
    }, 5000);
  };

  useEffect(() => {
    setPage(1);
    fetchProducts(1, search);
  }, [activeTab, selectedCategory, selectedSubcategory, selectedLevel3, selectedManufacturer]);

  // Disabled auto-discovery - only manual triggering now
  // useEffect(() => {
  //   if (products.length > 0 && !loading) {
  //     autoDiscoverImages();
  //   }
  // }, [products.length > 0 && !loading]);

  // Handle setting primary image
  const handleSetPrimary = async (productId: string, imageId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the approve/reject click
    
    console.log(`[SET PRIMARY] Setting image ${imageId} as primary for product ${productId}`);

    // Optimistic update - set this image as primary, remove primary from others
    setProducts(prev => prev.map(product => {
      if (product.id !== productId) return product;
      
      return {
        ...product,
        images: product.images.map(img => ({
          ...img,
          is_primary: img.id === imageId,
        })),
      };
    }));

    // Update in database
    try {
      // First, unset all primary images for this product
      const { error: unsetError } = await supabase
        .from('product_images')
        .update({ is_primary: false })
        .eq('canonical_product_id', productId);

      if (unsetError) {
        console.error('[SET PRIMARY] Failed to unset primary:', unsetError);
        alert(`Failed to update primary image: ${unsetError.message}`);
        fetchProducts(page, search);
        return;
      }

      // Then set this image as primary
      const { data, error } = await supabase
        .from('product_images')
        .update({ is_primary: true })
        .eq('id', imageId)
        .select();

      if (error) {
        console.error('[SET PRIMARY] Failed to set primary:', error);
        alert(`Failed to set primary image: ${error.message}`);
        fetchProducts(page, search);
      } else {
        console.log(`[SET PRIMARY] ✅ Successfully set image ${imageId} as primary`);
      }
    } catch (error) {
      console.error('[SET PRIMARY] Exception:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      fetchProducts(page, search);
    }
  };

  // Handle image click - cycle through approval statuses
  const handleImageClick = async (productId: string, imageId: string, currentStatus: string, isDownloaded: boolean) => {
    console.log(`[CLICK] Image ${imageId} current status: ${currentStatus}, downloaded: ${isDownloaded}`);
    
    // Determine new status: pending -> approved, approved -> rejected, rejected -> pending (cycle)
    let newStatus: 'pending' | 'approved' | 'rejected';
    if (currentStatus === 'pending') {
      newStatus = 'approved';
    } else if (currentStatus === 'approved') {
      newStatus = 'rejected';
    } else {
      newStatus = 'pending'; // Allow cycling back from rejected
    }

    console.log(`[CLICK] Changing to: ${newStatus}`);

    // Optimistic update - keep ALL images, just change status
    setProducts(prev => prev.map(product => {
      if (product.id !== productId) return product;
      
      return {
        ...product,
        images: product.images.map(img => {
          if (img.id !== imageId) return img;
          return { ...img, approval_status: newStatus };
        }),
      };
    }));

    // Update approval status in database
    try {
      console.log(`[CLICK] Sending update to database...`);
      console.log(`[CLICK] Image ID: ${imageId}`);
      console.log(`[CLICK] New status: ${newStatus}`);

      const { data, error } = await supabase
        .from('product_images')
        .update({ approval_status: newStatus })
        .eq('id', imageId)
        .select();

      console.log(`[CLICK] Database response:`, { data, error });

      if (error) {
        console.error('[CLICK] Failed to update image status:', error);
        console.error('[CLICK] Error details:', JSON.stringify(error, null, 2));
        alert(`Failed to update image: ${error.message}`);
        // Revert optimistic update
        fetchProducts(page, search);
        return;
      } else if (!data || data.length === 0) {
        console.error('[CLICK] No data returned - update may have failed');
        alert('Update failed - no data returned');
        fetchProducts(page, search);
        return;
      } else {
        console.log(`[CLICK] ✅ Successfully updated image ${imageId} to ${newStatus}`);
      }

      // If approving and not downloaded, trigger background download
      if (newStatus === 'approved' && !isDownloaded) {
        console.log(`[DOWNLOAD] Image approved but not downloaded - triggering background download...`);
        
        // Fire and forget download
        fetch('/api/admin/images/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageId }),
        })
          .then(res => res.json())
          .then(result => {
            if (result.success) {
              console.log(`[DOWNLOAD] ✅ Background download completed for ${imageId}`);
              // Update the image to show it's now downloaded
              fetchProducts(page, search);
            } else {
              console.error(`[DOWNLOAD] Failed:`, result.error);
            }
          })
          .catch(err => console.error('[DOWNLOAD] Error:', err));
      }
    } catch (error) {
      console.error('[CLICK] Exception during update:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      fetchProducts(page, search);
    }
  };

  // Filter products based on active tab - use explicit completion tracking
  const filteredProducts = products.filter(product => {
    if (activeTab === 'needs_review') {
      return !completedProducts.has(product.id);
    } else if (activeTab === 'completed') {
      return completedProducts.has(product.id);
    }
    return true; // 'all' tab
  });

  const handleSearch = () => {
    setPage(1);
    setLoading(true);
    fetchProducts(1, search);
  };

  // Mark product as complete - only keep approved images, reject/delete everything else
  const handleMarkComplete = async (productId: string) => {
    console.log(`[COMPLETE] Marking product ${productId} as complete`);

    const product = products.find(p => p.id === productId);
    if (!product) return;

    const approvedImages = product.images.filter(img => img.approval_status === 'approved');
    const hasPrimary = approvedImages.some(img => img.is_primary);

    // Validation checks
    if (approvedImages.length === 0) {
      alert('Please approve at least one image before marking as complete');
      return;
    }

    if (!hasPrimary) {
      alert('Please select a primary image (click the ⭐ star) before marking as complete');
      return;
    }

    const nonApprovedImageIds = product.images
      .filter(img => img.approval_status !== 'approved')
      .map(img => img.id);

    const confirmMsg = nonApprovedImageIds.length > 0
      ? `Mark as complete? This will DELETE ${nonApprovedImageIds.length} non-approved images permanently. Only ${approvedImages.length} approved images will remain.`
      : `Mark as complete? This product has ${approvedImages.length} approved images.`;

    if (!confirm(confirmMsg)) {
      return;
    }

    const approvedImageIds = approvedImages.map(img => img.id);
    console.log(`[COMPLETE] Product has ${product.images.length} total images`);
    console.log(`[COMPLETE] Approved images (keeping): ${approvedImageIds}`);
    console.log(`[COMPLETE] Non-approved images (deleting): ${nonApprovedImageIds}`);

    // Optimistic update - remove non-approved images from UI
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        images: p.images.filter(img => img.approval_status === 'approved'),
      };
    }));

    // Mark as complete
    setCompletedProducts(prev => new Set(prev).add(productId));

    // Delete non-approved images from database
    if (nonApprovedImageIds.length > 0) {
      try {
        // First, delete the storage files for images that were downloaded
        const imagesToDelete = product.images.filter(img => 
          img.approval_status !== 'approved' && 
          img.is_downloaded && 
          img.storage_path
        );

        if (imagesToDelete.length > 0) {
          const pathsToDelete = imagesToDelete.map(img => img.storage_path!);
          console.log(`[COMPLETE] Step 1: Deleting ${pathsToDelete.length} files from storage:`, pathsToDelete);
          
          const { error: storageError } = await supabase.storage
            .from('product-images')
            .remove(pathsToDelete);

          if (storageError) {
            console.error('[COMPLETE] Storage deletion error:', storageError);
            // Continue anyway - better to delete DB records
          } else {
            console.log(`[COMPLETE] ✅ Storage files deleted`);
          }
        } else {
          console.log(`[COMPLETE] No storage files to delete (external URLs only)`);
        }

        // Delete database records
        console.log(`[COMPLETE] Step 2: Deleting ${nonApprovedImageIds.length} database records:`, nonApprovedImageIds);
        
        const { data: deleteData, error: deleteError } = await supabase
          .from('product_images')
          .delete()
          .in('id', nonApprovedImageIds)
          .select();

        console.log(`[COMPLETE] Delete response:`, { data: deleteData, error: deleteError });

        if (deleteError) {
          console.error('[COMPLETE] Database deletion error:', deleteError);
          console.error('[COMPLETE] This might be an RLS policy issue');
          alert(`Failed to delete images: ${deleteError.message}\nCheck console for details.`);
          // Revert completion
          setCompletedProducts(prev => {
            const newSet = new Set(prev);
            newSet.delete(productId);
            return newSet;
          });
          fetchProducts(page, search);
        } else {
          console.log(`[COMPLETE] ✅ Deleted ${deleteData?.length || nonApprovedImageIds.length} database records`);
          console.log(`[COMPLETE] ✅ Product complete with ${approvedImages.length} approved images`);
          
          // Refresh to confirm deletion
          setTimeout(() => fetchProducts(page, search), 1000);
        }
      } catch (error) {
        console.error('[COMPLETE] Exception:', error);
        alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Revert completion
        setCompletedProducts(prev => {
          const newSet = new Set(prev);
          newSet.delete(productId);
          return newSet;
        });
        fetchProducts(page, search);
      }
    } else {
      console.log(`[COMPLETE] ✅ Product complete with ${approvedImages.length} approved images (no images to delete)`);
    }
  };

  // Trigger image discovery for a product
  const handleFindMoreImages = async (productId: string) => {
    const product = products.find(p => p.id === productId);
    console.log(`[DISCOVER] ========================================`);
    console.log(`[DISCOVER] Starting discovery for: ${product?.normalized_name}`);
    console.log(`[DISCOVER] Product ID: ${productId}`);
    console.log(`[DISCOVER] Current image count: ${product?.images.length || 0}`);
    console.log(`[DISCOVER] ========================================`);
    
    setDiscovering(prev => new Set(prev).add(productId));

    try {
      const startTime = Date.now();
      console.log(`[DISCOVER] Calling API... (this takes 15-25 seconds)`);
      
      const response = await fetch('/api/admin/images/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalProductId: productId }),
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[DISCOVER] API responded after ${elapsed} seconds`);
      console.log(`[DISCOVER] Response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[DISCOVER] API error response:', errorText);
        alert(`Discovery failed (${response.status}): ${errorText}`);
        setDiscovering(prev => {
          const newSet = new Set(prev);
          newSet.delete(productId);
          return newSet;
        });
        return;
      }

      const result = await response.json();
      console.log('[DISCOVER] API result:', result);

      if (result.success) {
        const imagesSaved = result.data?.imagesSaved || result.data?.imagesDownloaded || 0;
        console.log(`[DISCOVER] ✅ Success! Images saved: ${imagesSaved}`);
        
        if (imagesSaved === 0) {
          console.log('[DISCOVER] ⚠️ No images were saved - AI found no suitable images');
          alert('No suitable images found for this product. Try a different product or check the product name/UPC.');
          setDiscovering(prev => {
            const newSet = new Set(prev);
            newSet.delete(productId);
            return newSet;
          });
          return;
        }
        
        // Poll aggressively for new images and update UI
        let pollCount = 0;
        const maxPolls = 20;
        const initialImageCount = product?.images.length || 0;
        
        console.log(`[DISCOVER] Starting polling (initial image count: ${initialImageCount})...`);
        
        const pollInterval = setInterval(async () => {
          pollCount++;
          console.log(`[DISCOVER] Poll ${pollCount}/${maxPolls} - Fetching fresh data...`);
          
          // Fetch complete product data with images and URLs
          const { data: freshProduct } = await supabase
            .from('canonical_products')
            .select(`
              id,
              normalized_name,
              upc,
              category,
              manufacturer,
              product_images (
                id,
                storage_path,
                external_url,
                is_downloaded,
                is_primary,
                approval_status,
                width,
                height,
                sort_order,
                created_at
              )
            `)
            .eq('id', productId)
            .single();
          
          if (!freshProduct) {
            console.log(`[DISCOVER] Poll ${pollCount}: Product not found in database`);
            return;
          }
          
          const imageCount = freshProduct.product_images?.length || 0;
          console.log(`[DISCOVER] Poll ${pollCount}: Found ${imageCount} images (was ${initialImageCount})`);
          
          // Update the specific product in state with fresh data including URLs
          if (imageCount > initialImageCount) {
            console.log(`[DISCOVER] ✅ New images detected! Updating UI...`);
            
            // Get URLs for images
            const imagesWithUrls = await Promise.all(
              (freshProduct.product_images || []).map(async (img: any) => {
                let url: string;
                if (!img.is_downloaded && img.external_url) {
                  url = img.external_url;
                } else if (img.storage_path) {
                  const { data: urlData } = supabase.storage
                    .from('product-images')
                    .getPublicUrl(img.storage_path);
                  url = urlData.publicUrl;
                } else {
                  url = '/placeholder-product.svg';
                }
                return { ...img, url };
              })
            );
            
            // Update state with new images
            setProducts(prev => prev.map(p => {
              if (p.id !== productId) return p;
              return {
                ...p,
                images: imagesWithUrls.sort((a, b) => {
                  const statusOrder: Record<string, number> = { approved: 0, pending: 1, rejected: 2 };
                  const statusA = statusOrder[a.approval_status] ?? 3;
                  const statusB = statusOrder[b.approval_status] ?? 3;
                  const statusDiff = statusA - statusB;
                  if (statusDiff !== 0) return statusDiff;
                  return (a.sort_order || 0) - (b.sort_order || 0);
                }),
              };
            }));
            
            clearInterval(pollInterval);
            setDiscovering(prev => {
              const newSet = new Set(prev);
              newSet.delete(productId);
              return newSet;
            });
            console.log(`[DISCOVER] ✅ UI updated with ${imageCount} images`);
          } else if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            console.log(`[DISCOVER] ⚠️ Polling timeout after ${maxPolls} attempts`);
            console.log(`[DISCOVER] Expected ${imagesSaved} images, found ${imageCount}`);
            alert('Images not appearing. Check Supabase function logs for errors.');
            setDiscovering(prev => {
              const newSet = new Set(prev);
              newSet.delete(productId);
              return newSet;
            });
          }
        }, 2000);
      } else {
        console.error('[DISCOVER] API returned success=false:', result);
        alert(`Failed to discover images: ${result.error || 'Unknown error'}`);
        setDiscovering(prev => {
          const newSet = new Set(prev);
          newSet.delete(productId);
          return newSet;
        });
      }
    } catch (error) {
      console.error('[DISCOVER] Exception:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setDiscovering(prev => {
        const newSet = new Set(prev);
        newSet.delete(productId);
        return newSet;
      });
    }
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchProducts(nextPage, search);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Image Quality Assurance</h1>
              <p className="text-sm text-gray-600 mt-1">
                Click images to approve/reject. Click ⭐ to set primary image. Target: 150 products/hour
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-gray-600">Total:</span>
                <span className="ml-2 font-bold">{stats.total}</span>
              </div>
              <div>
                <span className="text-gray-600">Needs Review:</span>
                <span className="ml-2 font-bold text-orange-600">{stats.needsReview}</span>
              </div>
              <div>
                <span className="text-gray-600">Completed:</span>
                <span className="ml-2 font-bold text-green-600">{stats.completed}</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit mb-4">
            <button
              onClick={() => setActiveTab('needs_review')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                activeTab === 'needs_review'
                  ? 'text-gray-800 bg-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200/70'
              )}
            >
              Needs Review
              {stats.needsReview > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-orange-500 text-white rounded-md">
                  {stats.needsReview}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                activeTab === 'completed'
                  ? 'text-gray-800 bg-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200/70'
              )}
            >
              Completed
              {stats.completed > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-green-500 text-white rounded-md">
                  {stats.completed}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                activeTab === 'all'
                  ? 'text-gray-800 bg-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200/70'
              )}
            >
              All
            </button>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by product name or UPC..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10 rounded-md"
              />
            </div>
            <Button onClick={handleSearch} className="rounded-md">
              Search
            </Button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-4 gap-3 mt-4">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">Category</label>
              <Select 
                value={selectedCategory || '_all'} 
                onValueChange={(val) => setSelectedCategory(val === '_all' ? '' : val)}
              >
                <SelectTrigger className="rounded-md w-full">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">Subcategory</label>
              <Select 
                value={selectedSubcategory || '_all'} 
                onValueChange={(val) => setSelectedSubcategory(val === '_all' ? '' : val)}
              >
                <SelectTrigger className="rounded-md w-full">
                  <SelectValue placeholder="All subcategories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All subcategories</SelectItem>
                  {subcategories.map((sub) => (
                    <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">Level 3</label>
              <Select 
                value={selectedLevel3 || '_all'} 
                onValueChange={(val) => setSelectedLevel3(val === '_all' ? '' : val)}
              >
                <SelectTrigger className="rounded-md w-full">
                  <SelectValue placeholder="All level 3" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All level 3</SelectItem>
                  {level3Categories.map((l3) => (
                    <SelectItem key={l3} value={l3}>{l3}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 mb-1.5 block">Manufacturer</label>
              <Select 
                value={selectedManufacturer || '_all'} 
                onValueChange={(val) => setSelectedManufacturer(val === '_all' ? '' : val)}
              >
                <SelectTrigger className="rounded-md w-full">
                  <SelectValue placeholder="All manufacturers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All manufacturers</SelectItem>
                  {manufacturers.map((mfr) => (
                    <SelectItem key={mfr} value={mfr}>{mfr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active Filters Display */}
          {(selectedCategory || selectedSubcategory || selectedLevel3 || selectedManufacturer) && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-xs font-medium text-gray-600">Active filters:</span>
              {selectedCategory && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-300 rounded-md text-xs">
                  <span className="text-gray-700">Category: {selectedCategory}</span>
                  <button 
                    onClick={() => setSelectedCategory('')}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              {selectedSubcategory && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-300 rounded-md text-xs">
                  <span className="text-gray-700">Subcategory: {selectedSubcategory}</span>
                  <button 
                    onClick={() => setSelectedSubcategory('')}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              {selectedLevel3 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-300 rounded-md text-xs">
                  <span className="text-gray-700">Level 3: {selectedLevel3}</span>
                  <button 
                    onClick={() => setSelectedLevel3('')}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              {selectedManufacturer && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-300 rounded-md text-xs">
                  <span className="text-gray-700">Manufacturer: {selectedManufacturer}</span>
                  <button 
                    onClick={() => setSelectedManufacturer('')}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  setSelectedCategory('');
                  setSelectedSubcategory('');
                  setSelectedLevel3('');
                  setSelectedManufacturer('');
                }}
                className="text-xs h-7 px-2 rounded-md"
              >
                Clear all
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Products List */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">Loading products...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-md border border-gray-200">
            <p className="text-gray-600">No products found</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-md border border-gray-200">
            <p className="text-gray-600">
              {activeTab === 'needs_review' 
                ? 'No products need review! 🎉' 
                : activeTab === 'completed'
                ? 'No completed products yet'
                : 'No products found'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {filteredProducts.map((product) => {
              const hasPending = product.images.some(img => img.approval_status === 'pending');
              const hasApproved = product.images.some(img => img.approval_status === 'approved');
              const isCompleted = completedProducts.has(product.id);
              const isDiscovering = discovering.has(product.id);

              return (
              <div key={`product-${product.id}-${activeTab}`} className="bg-white rounded-md border border-gray-200 p-6">
                {/* Product Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-lg font-semibold text-gray-900">{product.normalized_name}</h2>
                      {isCompleted && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-md">
                          ✓ Completed
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                      {product.upc && <span>UPC: {product.upc}</span>}
                      {product.marketplace_category && (
                        <span>• {product.marketplace_category}
                          {product.marketplace_subcategory && ` > ${product.marketplace_subcategory}`}
                          {product.marketplace_level_3_category && ` > ${product.marketplace_level_3_category}`}
                        </span>
                      )}
                      {product.manufacturer && <span>• {product.manufacturer}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(product.isDiscovering || isDiscovering) && (
                      <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-1.5 rounded-md">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Searching... (~20 sec)
                      </div>
                    )}
                    <Button
                      onClick={() => handleFindMoreImages(product.id)}
                      disabled={isDiscovering}
                      variant="outline"
                      size="sm"
                      className="rounded-md"
                    >
                      <Sparkles className="h-4 w-4 mr-1" />
                      Find More Images
                    </Button>
                    {!isCompleted && (
                      <Button
                        onClick={() => handleMarkComplete(product.id)}
                        variant="outline"
                        size="sm"
                        className="rounded-md text-green-600 hover:text-green-700 hover:bg-green-50"
                        disabled={!hasApproved || !product.images.some(img => img.is_primary && img.approval_status === 'approved')}
                        title={
                          !hasApproved 
                            ? 'Approve at least one image first' 
                            : !product.images.some(img => img.is_primary && img.approval_status === 'approved')
                            ? 'Select a primary image (⭐) first'
                            : 'Mark complete and delete non-approved images'
                        }
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Mark Complete
                      </Button>
                    )}
                  </div>
                </div>

                {/* Images Grid */}
                {product.images.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-md">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {product.isDiscovering ? 'Discovering images...' : 'No images yet'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-6 gap-3">
                    {product.images.map((image) => {
                      // Check if image is new (created in last 5 minutes)
                      const createdAt = new Date(image.created_at);
                      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
                      const isNew = createdAt > fiveMinutesAgo;

                      return (
                        <div key={image.id} className="relative">
                          <button
                            onClick={() => handleImageClick(product.id, image.id, image.approval_status, image.is_downloaded)}
                            className={cn(
                              'relative aspect-square rounded-md overflow-hidden transition-all group w-full',
                              'hover:scale-105 hover:shadow-lg',
                              image.approval_status === 'approved' && 'ring-4 ring-green-500',
                              image.approval_status === 'pending' && 'ring-2 ring-gray-300 hover:ring-blue-400',
                              image.approval_status === 'rejected' && 'ring-4 ring-red-500 opacity-60'
                            )}
                          >
                            <img
                              src={image.url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                            
                            {/* New/Existing Badge */}
                            <div className="absolute top-2 left-2">
                              {isNew ? (
                                <span className="px-2 py-0.5 text-xs font-medium bg-blue-500 text-white rounded-md shadow-lg">
                                  NEW
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 text-xs font-medium bg-gray-700 text-white rounded-md shadow-lg">
                                  EXISTING
                                </span>
                              )}
                            </div>

                            {/* Status Indicator */}
                            <div className="absolute top-2 right-2">
                              {image.approval_status === 'approved' ? (
                                <CheckCircle2 className="h-6 w-6 text-green-500 drop-shadow-lg bg-white rounded-full" />
                              ) : image.approval_status === 'rejected' ? (
                                <XCircle className="h-6 w-6 text-red-500 drop-shadow-lg bg-white rounded-full" />
                              ) : (
                                <div className="h-6 w-6 rounded-full bg-white/80 border-2 border-gray-300" />
                              )}
                            </div>

                            {/* Hover Overlay */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                              <span className="text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity text-sm">
                                {image.approval_status === 'approved' 
                                  ? 'Click to Reject' 
                                  : image.approval_status === 'rejected'
                                  ? 'Click to Re-approve'
                                  : 'Click to Approve'}
                              </span>
                            </div>
                          </button>

                          {/* Primary Star Button - Only show for approved images */}
                          {image.approval_status === 'approved' && (
                            <button
                              onClick={(e) => handleSetPrimary(product.id, image.id, e)}
                              className={cn(
                                'absolute -bottom-3 left-1/2 -translate-x-1/2 z-10',
                                'p-1.5 rounded-full transition-all shadow-lg',
                                image.is_primary 
                                  ? 'bg-yellow-400 hover:bg-yellow-500' 
                                  : 'bg-white hover:bg-gray-100 border-2 border-gray-300'
                              )}
                              title={image.is_primary ? 'Primary image' : 'Set as primary'}
                            >
                              <Star 
                                className={cn(
                                  'h-4 w-4',
                                  image.is_primary ? 'text-yellow-900 fill-yellow-900' : 'text-gray-600'
                                )} 
                              />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}

        {/* Load More */}
        {!loading && hasMore && (
          <div className="text-center mt-8">
            <Button onClick={loadMore} variant="outline" className="rounded-md">
              Load More Products
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
