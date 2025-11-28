// ============================================================
// Image Processing Service - Main Entry Point
// ============================================================

import { createClient } from '@/lib/supabase/server';
import type {
  ProcessedImage,
  ImageVariants,
  ImageFormats,
  ProcessImageResult,
  UploadImageOptions,
  ImageUploadResult,
  ImageSize,
} from './types';
import { IMAGE_SIZES } from './types';
import {
  generateStoragePath,
  calculateDimensions,
  getCDNUrl,
  generateCacheVersion,
} from './optimizer';

/**
 * Uploads an image to Supabase Storage
 * This is a server-side function
 */
export async function uploadToStorage(
  file: File,
  path: string
): Promise<{ path: string; publicUrl: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from('product-images')
    .upload(path, file, {
      cacheControl: '31536000', // 1 year
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload image: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from('product-images')
    .getPublicUrl(data.path);

  return {
    path: data.path,
    publicUrl: urlData.publicUrl,
  };
}

/**
 * Creates a product image record in the database
 */
export async function createProductImageRecord(
  canonicalProductId: string,
  storagePath: string,
  options: {
    variants: ImageVariants;
    formats: ImageFormats;
    width: number;
    height: number;
    fileSize: number;
    mimeType: string;
    isPrimary?: boolean;
    sortOrder?: number;
    uploadedBy?: string;
  }
): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('product_images')
    .insert({
      canonical_product_id: canonicalProductId,
      storage_path: storagePath,
      variants: options.variants,
      formats: options.formats,
      width: options.width,
      height: options.height,
      file_size: options.fileSize,
      mime_type: options.mimeType,
      is_primary: options.isPrimary || false,
      sort_order: options.sortOrder || 0,
      uploaded_by: options.uploadedBy || null,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create image record: ${error.message}`);
  }

  return data.id;
}

/**
 * Main function to upload and process an image
 * This is simplified for client-side usage - in production,
 * you'd do the heavy processing on a server/edge function
 */
export async function uploadProductImage(
  file: File,
  canonicalProductId: string,
  options?: UploadImageOptions
): Promise<ImageUploadResult> {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('User not authenticated');
  }

  // Upload original image
  const originalPath = generateStoragePath(
    canonicalProductId,
    'canonical',
    'original',
    'jpeg'
  );

  const { publicUrl } = await uploadToStorage(file, originalPath);

  // For now, we'll just create variants with the same image
  // In production, you'd process different sizes here
  const variants: ImageVariants = {
    thumbnail: originalPath,
    small: originalPath,
    medium: originalPath,
    large: originalPath,
    original: originalPath,
  };

  const formats: ImageFormats = {
    jpeg: variants,
    webp: {},
    avif: {},
  };

  // Get image dimensions (skip on server-side)
  let dimensions = { width: 800, height: 600 }; // Default dimensions
  
  if (typeof window !== 'undefined') {
    try {
      dimensions = await getImageDimensionsFromFile(file);
    } catch (error) {
      console.warn('Could not get image dimensions, using defaults:', error);
    }
  }

  // Create database record
  const imageId = await createProductImageRecord(canonicalProductId, originalPath, {
    variants,
    formats,
    width: dimensions.width,
    height: dimensions.height,
    fileSize: file.size,
    mimeType: file.type,
    isPrimary: options?.isPrimary,
    sortOrder: options?.sortOrder,
    uploadedBy: user.id,
  });

  return {
    imageId,
    canonicalProductId,
    publicUrl,
    variants,
    formats,
  };
}

/**
 * Gets image dimensions from a file
 */
async function getImageDimensionsFromFile(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('This function must run in the browser'));
      return;
    }
    
    const img = new window.Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      resolve({ width: img.width, height: img.height });
      URL.revokeObjectURL(url);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
      URL.revokeObjectURL(url);
    };

    img.src = url;
  });
}

/**
 * Gets all images for a canonical product
 */
export async function getProductImages(
  canonicalProductId: string
): Promise<
  Array<{
    id: string;
    storagePath: string;
    variants: ImageVariants;
    formats: ImageFormats;
    isPrimary: boolean;
    sortOrder: number;
    publicUrl: string;
  }>
> {
  console.log('[getProductImages] Fetching images for canonical:', canonicalProductId);
  
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('product_images')
    .select('*')
    .eq('canonical_product_id', canonicalProductId)
    .order('sort_order', { ascending: true });

  console.log('[getProductImages] Query result:', { count: data?.length, error });

  if (error) {
    console.error('[getProductImages] Database error:', error);
    throw new Error(`Failed to fetch images: ${error.message}`);
  }

  const images = (data || []).map((img) => ({
    id: img.id,
    storagePath: img.storage_path,
    variants: img.variants as ImageVariants,
    formats: img.formats as ImageFormats,
    isPrimary: img.is_primary,
    sortOrder: img.sort_order,
    publicUrl: getCDNUrl(img.storage_path),
  }));
  
  console.log('[getProductImages] Returning images:', images.length);
  return images;
}

/**
 * Sets an image as primary
 */
export async function setPrimaryImage(imageId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('product_images')
    .update({ is_primary: true })
    .eq('id', imageId);

  if (error) {
    throw new Error(`Failed to set primary image: ${error.message}`);
  }
}

/**
 * Deletes an image
 */
export async function deleteProductImage(imageId: string): Promise<void> {
  const supabase = await createClient();

  // Get image details
  const { data: image, error: fetchError } = await supabase
    .from('product_images')
    .select('storage_path')
    .eq('id', imageId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch image: ${fetchError.message}`);
  }

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('product-images')
    .remove([image.storage_path]);

  if (storageError) {
    console.error('Failed to delete from storage:', storageError);
    // Continue anyway to delete database record
  }

  // Delete database record
  const { error: dbError } = await supabase
    .from('product_images')
    .delete()
    .eq('id', imageId);

  if (dbError) {
    throw new Error(`Failed to delete image record: ${dbError.message}`);
  }
}

/**
 * Reorders images
 */
export async function reorderImages(
  imageIds: string[],
  canonicalProductId: string
): Promise<void> {
  const supabase = await createClient();

  // Update sort order for each image
  const updates = imageIds.map((id, index) =>
    supabase
      .from('product_images')
      .update({ sort_order: index })
      .eq('id', id)
      .eq('canonical_product_id', canonicalProductId)
  );

  await Promise.all(updates);
}

// Re-export types and utilities
export * from './types';
export * from './optimizer';

