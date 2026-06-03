/**
 * Enterprise-grade image compression utility
 * Uses Canvas API for client-side image optimization
 * 
 * Performance targets:
 * - Reduce 5MB photos to ~200KB (96% reduction)
 * - Process in <500ms per image
 * - Strip EXIF data for privacy
 */

export interface CompressionOptions {
  maxDimension?: number;  // Max width/height in pixels
  quality?: number;       // JPEG quality 0-1
  mimeType?: string;      // Output format
}

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

type LoadedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
};

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxDimension: 1920,     // Sufficient for web display
  quality: 0.8,           // Good quality, ~80% size reduction
  mimeType: 'image/jpeg', // Best compression ratio
};

/**
 * Compress an image file using Canvas API
 * - Resizes to max dimension while maintaining aspect ratio
 * - Converts to JPEG for optimal compression
 * - Strips EXIF data automatically (canvas doesn't preserve it)
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressedImage> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const originalSize = file.size;

  // Decode with camera/EXIF orientation applied before canvas strips metadata.
  const img = await loadImage(file);
  
  // Calculate new dimensions
  const { width, height } = calculateDimensions(
    img.width,
    img.height,
    opts.maxDimension
  );

  // Create canvas and draw resized image
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Use high-quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Draw oriented pixels (this strips EXIF data after preserving the visible orientation)
  ctx.drawImage(img.source, 0, 0, width, height);
  img.close?.();

  // Convert to blob
  const blob = await canvasToBlob(canvas, opts.mimeType, opts.quality);
  
  const compressedSize = blob.size;
  const compressionRatio = originalSize > 0 
    ? Math.round((1 - compressedSize / originalSize) * 100) 
    : 0;

  console.log(
    `[Image Compression] ${file.name}: ${formatBytes(originalSize)} → ${formatBytes(compressedSize)} (${compressionRatio}% reduction)`
  );

  return {
    blob,
    width,
    height,
    originalSize,
    compressedSize,
    compressionRatio,
  };
}

/**
 * Compress multiple images in parallel with concurrency limit
 */
export async function compressImages(
  files: File[],
  options: CompressionOptions = {},
  concurrency: number = 3,
  onProgress?: (completed: number, total: number) => void
): Promise<CompressedImage[]> {
  const results: CompressedImage[] = [];
  let completed = 0;

  // Process in batches for controlled concurrency
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(file => compressImage(file, options))
    );
    results.push(...batchResults);
    completed += batch.length;
    onProgress?.(completed, files.length);
  }

  return results;
}

/**
 * Load an image file into an HTMLImageElement
 */
async function loadImage(file: File): Promise<LoadedImage> {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      } as ImageBitmapOptions);

      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Fall back to HTMLImageElement below for older browsers or unsupported formats.
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src); // Clean up
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Calculate new dimensions maintaining aspect ratio
 */
function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxDimension: number
): { width: number; height: number } {
  // If already smaller than max, keep original size
  if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
    return { width: originalWidth, height: originalHeight };
  }

  // Calculate scale factor
  const scale = Math.min(
    maxDimension / originalWidth,
    maxDimension / originalHeight
  );

  return {
    width: Math.round(originalWidth * scale),
    height: Math.round(originalHeight * scale),
  };
}

/**
 * Convert canvas to blob with specified format and quality
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      },
      mimeType,
      quality
    );
  });
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Convert compressed image blob to File for upload
 */
export function compressedToFile(
  compressed: CompressedImage,
  originalName: string
): File {
  // Generate new filename with .jpg extension
  const baseName = originalName.replace(/\.[^.]+$/, '');
  const newName = `${baseName}.jpg`;
  
  return new File([compressed.blob], newName, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

/**
 * Quick check if compression would be beneficial
 * Skip compression for already-small images
 */
export function shouldCompress(file: File): boolean {
  // Skip non-image files
  if (!file.type.startsWith('image/')) {
    return false;
  }

  // JPEGs often carry camera orientation in EXIF even when they are small. Run them
  // through canvas so the uploaded pixels are upright after EXIF is stripped.
  if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
    return true;
  }
  
  // Skip already-small non-JPEG images.
  if (file.size < 300 * 1024) {
    return false;
  }
  
  return true;
}










