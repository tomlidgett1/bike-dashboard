// ============================================================
// Image Processing Types
// ============================================================

export type ImageSize = 'thumbnail' | 'small' | 'medium' | 'large' | 'original';
export type ImageFormat = 'jpeg' | 'webp' | 'avif' | 'png';

export interface ImageDimensions {
  width: number;
  height: number;
}

export const IMAGE_SIZES: Record<ImageSize, number> = {
  thumbnail: 150,
  small: 400,
  medium: 800,
  large: 1200,
  original: 0, // 0 means no resize
};

export const IMAGE_FORMATS: ImageFormat[] = ['webp', 'avif', 'jpeg'];

export interface ProcessedImage {
  size: ImageSize;
  format: ImageFormat;
  path: string;
  width: number;
  height: number;
  fileSize: number;
}

export interface ImageVariants {
  thumbnail: string;
  small: string;
  medium: string;
  large: string;
  original: string;
}

export interface ImageFormats {
  webp: Partial<ImageVariants>;
  avif: Partial<ImageVariants>;
  jpeg: Partial<ImageVariants>;
}

export interface ProcessImageResult {
  originalPath: string;
  variants: ImageVariants;
  formats: ImageFormats;
  processedImages: ProcessedImage[];
  totalSize: number;
  width: number;
  height: number;
  mimeType: string;
}

export interface UploadImageOptions {
  canonicalProductId?: string;
  userId?: string;
  productId?: string;
  isPrimary?: boolean;
  sortOrder?: number;
}

export interface ImageUploadResult {
  imageId: string;
  canonicalProductId: string;
  publicUrl: string;
  variants: ImageVariants;
  formats: ImageFormats;
}











