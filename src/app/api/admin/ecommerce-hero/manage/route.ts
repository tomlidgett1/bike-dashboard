/**
 * Product Management API
 * POST /api/admin/ecommerce-hero/manage
 * 
 * Actions:
 * - deactivate: Set is_active = false
 * - activate: Set is_active = true  
 * - delete: Delete product from all tables
 * - remove_image: Remove a specific image from the product
 * - approve_images: Mark images as approved by admin
 * - unapprove_images: Remove admin approval
 * - flag_secondary_review: Flag product for secondary review
 * - unflag_secondary_review: Remove secondary review flag
 * - reorder_image: Move an image up or down in sort order
 * - add_to_product_page: Add an image to the JSONB array so it appears on product page
 * - remove_from_product_page: Remove an image from the JSONB array (hide from product page)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Use regular client for auth check
    const authClient = await createClient();
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Use service role client to bypass RLS for admin operations
    const supabase = createServiceRoleClient();

    const body = await request.json();
    const { action, productId, imageId, direction, source } = body;

    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
    }

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    console.log(`[MANAGE] Action: ${action}, Product: ${productId}, Image: ${imageId || 'N/A'}`);

    switch (action) {
      case 'deactivate': {
        const { error } = await supabase
          .from('products')
          .update({ is_active: false })
          .eq('id', productId);

        if (error) {
          console.error('[MANAGE] Deactivate error:', error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Product deactivated' });
      }

      case 'activate': {
        const { error } = await supabase
          .from('products')
          .update({ is_active: true })
          .eq('id', productId);

        if (error) {
          console.error('[MANAGE] Activate error:', error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Product activated' });
      }

      case 'delete': {
        // Delete from ecommerce_hero_queue first (foreign key)
        await supabase
          .from('ecommerce_hero_queue')
          .delete()
          .eq('product_id', productId);

        // Delete from product_images (foreign key)
        await supabase
          .from('product_images')
          .delete()
          .eq('product_id', productId);

        // Delete from products
        const { error } = await supabase
          .from('products')
          .delete()
          .eq('id', productId);

        if (error) {
          console.error('[MANAGE] Delete error:', error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Product deleted' });
      }

      case 'remove_image': {
        if (!imageId) {
          return NextResponse.json({ error: 'Image ID is required' }, { status: 400 });
        }

        // Check if it's a product_images table ID or JSONB ID
        if (imageId.startsWith('jsonb-')) {
          // It's from JSONB - need to update the images array
          const { data: product, error: fetchError } = await supabase
            .from('products')
            .select('images')
            .eq('id', productId)
            .single();

          if (fetchError || !product) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
          }

          const images = (product.images as any[]) || [];
          const imageIndex = parseInt(imageId.replace('jsonb-', ''));
          
          // Remove the image at the index
          const updatedImages = images.filter((_, idx) => idx !== imageIndex);

          const { error: updateError } = await supabase
            .from('products')
            .update({ 
              images: updatedImages,
              // If no images left, clear cached URLs
              ...(updatedImages.length === 0 ? {
                cached_image_url: null,
                cached_thumbnail_url: null,
                has_displayable_image: false,
              } : {})
            })
            .eq('id', productId);

          if (updateError) {
            console.error('[MANAGE] Remove image (JSONB) error:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
          }
        } else {
          // It's from product_images table
          const { error: deleteError } = await supabase
            .from('product_images')
            .delete()
            .eq('id', imageId);

          if (deleteError) {
            console.error('[MANAGE] Remove image (DB) error:', deleteError);
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
          }

          // Sync the JSONB after deletion
          await supabase.rpc('sync_product_images_to_jsonb', {
            target_product_id: productId,
          });

          // Check if there are any images left
          const { count } = await supabase
            .from('product_images')
            .select('id', { count: 'exact', head: true })
            .eq('product_id', productId);

          if (count === 0) {
            // No images left, clear cached URLs
            await supabase
              .from('products')
              .update({
                cached_image_url: null,
                cached_thumbnail_url: null,
                has_displayable_image: false,
              })
              .eq('id', productId);
          }
        }

        return NextResponse.json({ success: true, message: 'Image removed' });
      }

      case 'approve_images': {
        console.log(`[MANAGE] Approving images for product: ${productId}`);
        
        const { data, error } = await supabase
          .from('products')
          .update({ 
            images_approved_by_admin: true,
            images_approved_at: new Date().toISOString(),
          })
          .eq('id', productId)
          .select('id, images_approved_by_admin, images_approved_at')
          .single();

        if (error) {
          console.error('[MANAGE] Approve images error:', error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        console.log(`[MANAGE] Product approved:`, data);
        return NextResponse.json({ success: true, message: 'Images approved', data });
      }

      case 'unapprove_images': {
        const { error } = await supabase
          .from('products')
          .update({ 
            images_approved_by_admin: false,
            images_approved_at: null,
          })
          .eq('id', productId);

        if (error) {
          console.error('[MANAGE] Unapprove images error:', error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Images approval removed' });
      }

      case 'flag_secondary_review': {
        console.log(`[MANAGE] Flagging product for secondary review: ${productId}`);
        
        const { data, error } = await supabase
          .from('products')
          .update({ 
            needs_secondary_review: true,
            secondary_review_flagged_at: new Date().toISOString(),
          })
          .eq('id', productId)
          .select('id, needs_secondary_review, secondary_review_flagged_at')
          .single();

        if (error) {
          console.error('[MANAGE] Flag secondary review error:', error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        console.log(`[MANAGE] Product flagged for secondary review:`, data);
        return NextResponse.json({ success: true, message: 'Product flagged for secondary review', data });
      }

      case 'unflag_secondary_review': {
        const { error } = await supabase
          .from('products')
          .update({ 
            needs_secondary_review: false,
            secondary_review_flagged_at: null,
          })
          .eq('id', productId);

        if (error) {
          console.error('[MANAGE] Unflag secondary review error:', error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Secondary review flag removed' });
      }

      case 'reorder_image': {
        if (!imageId) {
          return NextResponse.json({ error: 'Image ID is required' }, { status: 400 });
        }
        if (!direction || !['up', 'down'].includes(direction)) {
          return NextResponse.json({ error: 'Direction must be "up" or "down"' }, { status: 400 });
        }
        if (!source || !['product_images', 'jsonb'].includes(source)) {
          return NextResponse.json({ error: 'Source must be "product_images" or "jsonb"' }, { status: 400 });
        }

        if (source === 'product_images') {
          // Get all images for this product ordered by sort_order
          const { data: images, error: fetchError } = await supabase
            .from('product_images')
            .select('id, sort_order')
            .eq('product_id', productId)
            .order('sort_order', { ascending: true });

          if (fetchError || !images || images.length === 0) {
            return NextResponse.json({ error: 'No images found' }, { status: 404 });
          }

          // Find the current image index
          const currentIndex = images.findIndex(img => img.id === imageId);
          if (currentIndex === -1) {
            return NextResponse.json({ error: 'Image not found' }, { status: 404 });
          }

          // Calculate swap index
          const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
          if (swapIndex < 0 || swapIndex >= images.length) {
            return NextResponse.json({ success: true, message: 'Already at boundary' });
          }

          // Swap sort_order values
          const currentImage = images[currentIndex];
          const swapImage = images[swapIndex];

          await supabase
            .from('product_images')
            .update({ sort_order: swapImage.sort_order })
            .eq('id', currentImage.id);

          await supabase
            .from('product_images')
            .update({ sort_order: currentImage.sort_order })
            .eq('id', swapImage.id);

          // Sync JSONB
          await supabase.rpc('sync_product_images_to_jsonb', {
            target_product_id: productId,
          });

        } else {
          // JSONB source - reorder within the images array
          const { data: product, error: fetchError } = await supabase
            .from('products')
            .select('images')
            .eq('id', productId)
            .single();

          if (fetchError || !product) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
          }

          const images = (product.images as any[]) || [];
          
          // Parse the JSONB image index
          const imageIndex = parseInt(imageId.replace('jsonb-', ''));
          if (isNaN(imageIndex) || imageIndex < 0 || imageIndex >= images.length) {
            return NextResponse.json({ error: 'Invalid image index' }, { status: 400 });
          }

          // Calculate swap index
          const swapIndex = direction === 'up' ? imageIndex - 1 : imageIndex + 1;
          if (swapIndex < 0 || swapIndex >= images.length) {
            return NextResponse.json({ success: true, message: 'Already at boundary' });
          }

          // Swap positions in array
          const updatedImages = [...images];
          [updatedImages[imageIndex], updatedImages[swapIndex]] = [updatedImages[swapIndex], updatedImages[imageIndex]];

          // Update order properties
          updatedImages.forEach((img, idx) => {
            img.order = idx;
          });

          const { error: updateError } = await supabase
            .from('products')
            .update({ images: updatedImages })
            .eq('id', productId);

          if (updateError) {
            console.error('[MANAGE] Reorder image (JSONB) error:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
          }
        }

        return NextResponse.json({ success: true, message: 'Image reordered' });
      }

      case 'bulk_reorder_images': {
        const { newOrder, source: imgSource } = body;
        
        if (!newOrder || !Array.isArray(newOrder)) {
          return NextResponse.json({ error: 'newOrder array is required' }, { status: 400 });
        }
        if (!imgSource || !['product_images', 'jsonb'].includes(imgSource)) {
          return NextResponse.json({ error: 'source must be "product_images" or "jsonb"' }, { status: 400 });
        }

        console.log(`[MANAGE] Bulk reorder: ${newOrder.length} images for product ${productId}`);

        if (imgSource === 'product_images') {
          // Update sort_order for each image in the database
          for (const item of newOrder) {
            const { error } = await supabase
              .from('product_images')
              .update({ sort_order: item.sortOrder })
              .eq('id', item.id);

            if (error) {
              console.error('[MANAGE] Bulk reorder DB error:', error);
              return NextResponse.json({ error: error.message }, { status: 500 });
            }
          }

          // Sync JSONB after reordering
          await supabase.rpc('sync_product_images_to_jsonb', {
            target_product_id: productId,
          });

        } else {
          // JSONB source - update the entire images array with new order
          const { data: product, error: fetchError } = await supabase
            .from('products')
            .select('images')
            .eq('id', productId)
            .single();

          if (fetchError || !product) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
          }

          const images = (product.images as any[]) || [];
          
          // Create a map for quick lookup
          const orderMap = new Map(newOrder.map((item: { id: string; sortOrder: number }) => [item.id, item.sortOrder]));
          
          // Sort images by new order
          const sortedImages = [...images].sort((a, b) => {
            const aOrder = orderMap.get(a.id) ?? 999;
            const bOrder = orderMap.get(b.id) ?? 999;
            return aOrder - bOrder;
          });

          // Update order property
          sortedImages.forEach((img, idx) => {
            img.order = idx;
          });

          const { error: updateError } = await supabase
            .from('products')
            .update({ images: sortedImages })
            .eq('id', productId);

          if (updateError) {
            console.error('[MANAGE] Bulk reorder JSONB error:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
          }
        }

        return NextResponse.json({ success: true, message: 'Images reordered' });
      }

      case 'add_to_product_page': {
        // Add an image to the product page by updating approval_status in product_images
        // The sync trigger will then update the JSONB automatically
        const { imageUrl, cardUrl, thumbnailUrl, galleryUrl, detailUrl } = body;
        
        console.log(`[MANAGE] Add to product page: imageId=${imageId}, imageUrl=${imageUrl}`);
        
        if (!imageId && !imageUrl) {
          return NextResponse.json({ error: 'Image ID or URL is required' }, { status: 400 });
        }

        // If we have an image ID, update the product_images record
        if (imageId && !imageId.startsWith('jsonb-') && !imageId.startsWith('added-')) {
          // Update the approval_status to 'approved' so it appears on the product page
          const { error: approvalError } = await supabase
            .from('product_images')
            .update({ approval_status: 'approved' })
            .eq('id', imageId);

          if (approvalError) {
            console.error('[MANAGE] Update approval status error:', approvalError);
            return NextResponse.json({ error: approvalError.message }, { status: 500 });
          }

          // Sync the JSONB (trigger should handle this, but be explicit)
          await supabase.rpc('sync_product_images_to_jsonb', {
            target_product_id: productId,
          });

          console.log(`[MANAGE] Updated product_images approval for ${imageId}`);
          return NextResponse.json({ success: true, message: 'Image added to product page' });
        }

        // For JSONB images or images without a DB record, add directly to JSONB
        const { data: product, error: fetchError } = await supabase
          .from('products')
          .select('images')
          .eq('id', productId)
          .single();

        if (fetchError || !product) {
          return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }

        const currentImages = (product.images as any[]) || [];
        
        // Build the new image object
        const newImage: any = {
          id: imageId || `added-${Date.now()}`,
          url: imageUrl || cardUrl,
          cardUrl: cardUrl,
          thumbnailUrl: thumbnailUrl,
          galleryUrl: galleryUrl,
          detailUrl: detailUrl,
          isPrimary: currentImages.length === 0,
          order: currentImages.length,
          source: 'manual',
        };

        // Check if URL already exists in the array
        const urlToCheck = imageUrl || cardUrl;
        const alreadyExists = currentImages.some(
          (img: any) => img.url === urlToCheck || img.cardUrl === urlToCheck
        );

        if (alreadyExists) {
          return NextResponse.json({ success: true, message: 'Image already on product page' });
        }

        // Add the new image to the array
        const updatedImages = [...currentImages, newImage];

        const { error: updateError } = await supabase
          .from('products')
          .update({ 
            images: updatedImages,
            has_displayable_image: true,
          })
          .eq('id', productId);

        if (updateError) {
          console.error('[MANAGE] Add to product page error:', updateError);
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        console.log(`[MANAGE] Added image to product page: ${urlToCheck}`);
        return NextResponse.json({ success: true, message: 'Image added to product page' });
      }

      case 'remove_from_product_page': {
        // Remove an image from the product page by setting approval_status to 'pending'
        // This hides it from the product page without deleting from DB
        const { imageUrl } = body;
        
        console.log(`[MANAGE] Remove from product page: imageId=${imageId}, imageUrl=${imageUrl}`);
        
        // If we have an image ID, update the product_images record
        if (imageId && !imageId.startsWith('jsonb-') && !imageId.startsWith('added-')) {
          // Update the approval_status to 'pending' so it no longer appears on the product page
          const { error: approvalError } = await supabase
            .from('product_images')
            .update({ approval_status: 'pending' })
            .eq('id', imageId);

          if (approvalError) {
            console.error('[MANAGE] Update approval status error:', approvalError);
            return NextResponse.json({ error: approvalError.message }, { status: 500 });
          }

          // Sync the JSONB (trigger should handle this, but be explicit)
          await supabase.rpc('sync_product_images_to_jsonb', {
            target_product_id: productId,
          });

          // Check if there are any approved images left
          const { count } = await supabase
            .from('product_images')
            .select('id', { count: 'exact', head: true })
            .eq('product_id', productId)
            .eq('approval_status', 'approved');

          if (count === 0) {
            await supabase
              .from('products')
              .update({ has_displayable_image: false })
              .eq('id', productId);
          }

          console.log(`[MANAGE] Updated product_images to pending for ${imageId}`);
          return NextResponse.json({ success: true, message: 'Image removed from product page' });
        }

        // For JSONB images without a DB record, remove from JSONB directly
        if (!imageUrl) {
          return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
        }

        const { data: product, error: fetchError } = await supabase
          .from('products')
          .select('images')
          .eq('id', productId)
          .single();

        if (fetchError || !product) {
          return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }

        const currentImages = (product.images as any[]) || [];
        
        // Filter out the image with matching URL
        const updatedImages = currentImages.filter(
          (img: any) => img.url !== imageUrl && img.cardUrl !== imageUrl
        );

        // Update order for remaining images
        updatedImages.forEach((img: any, idx: number) => {
          img.order = idx;
        });

        const { error: updateError } = await supabase
          .from('products')
          .update({ 
            images: updatedImages,
            has_displayable_image: updatedImages.length > 0,
          })
          .eq('id', productId);

        if (updateError) {
          console.error('[MANAGE] Remove from product page error:', updateError);
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        console.log(`[MANAGE] Removed image from product page: ${imageUrl}`);
        return NextResponse.json({ success: true, message: 'Image removed from product page' });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('[MANAGE] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Operation failed' },
      { status: 500 }
    );
  }
}

