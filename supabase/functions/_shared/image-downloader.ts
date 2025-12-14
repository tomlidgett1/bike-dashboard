// ============================================================
// Image Downloader and Validator
// ============================================================

interface ImageDownloadResult {
  success: boolean;
  blob?: Blob;
  width?: number;
  height?: number;
  fileSize?: number;
  mimeType?: string;
  error?: string;
}

interface ImageValidationResult {
  valid: boolean;
  error?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  mimeType?: string;
}

/**
 * Downloads an image from a URL with validation
 */
export async function downloadImage(url: string): Promise<ImageDownloadResult> {
  console.log(`📥 [DOWNLOAD] Fetching image from: ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BikeMarketplace/1.0; +https://bikemarketplace.com)',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      return {
        success: false,
        error: `Invalid content type: ${contentType}`,
      };
    }

    const blob = await response.blob();
    const fileSize = blob.size;

    console.log(`✓ [DOWNLOAD] Downloaded ${(fileSize / 1024 / 1024).toFixed(2)}MB, type: ${contentType}`);

    // Basic validation
    if (fileSize > 10 * 1024 * 1024) {
      return {
        success: false,
        error: 'File size exceeds 10MB limit',
      };
    }

    if (fileSize < 10 * 1024) {
      return {
        success: false,
        error: 'File size too small (likely a placeholder)',
      };
    }

    return {
      success: true,
      blob,
      fileSize,
      mimeType: contentType,
    };
  } catch (error) {
    console.error(`❌ [DOWNLOAD] Error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Download failed',
    };
  }
}

/**
 * Validates image dimensions using browser APIs
 * Note: In Deno, we'll skip dimension validation and do basic checks only
 */
export async function validateImage(blob: Blob): Promise<ImageValidationResult> {
  const fileSize = blob.size;
  const mimeType = blob.type;

  // Basic validation
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!validTypes.includes(mimeType)) {
    return {
      valid: false,
      error: `Unsupported image type: ${mimeType}`,
    };
  }

  if (fileSize < 10 * 1024) {
    return {
      valid: false,
      error: 'Image too small (likely a placeholder)',
    };
  }

  if (fileSize > 10 * 1024 * 1024) {
    return {
      valid: false,
      error: 'Image too large (>10MB)',
    };
  }

  console.log(`✓ [VALIDATE] Image passed basic validation: ${(fileSize / 1024).toFixed(0)}KB`);

  return {
    valid: true,
    fileSize,
    mimeType,
  };
}

/**
 * Converts blob to File-like object for upload
 */
export function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type });
}

/**
 * Generates a clean filename from URL
 */
export function generateFilename(url: string, index: number): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const extension = pathname.split('.').pop()?.toLowerCase() || 'jpg';
    
    // Clean filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    
    return `ai-discovered-${index}-${timestamp}-${random}.${extension}`;
  } catch {
    return `ai-discovered-${index}-${Date.now()}.jpg`;
  }
}














