// ============================================================
// UPC Matcher - Exact UPC Matching
// ============================================================

import { createClient } from '@/lib/supabase/server';
import type { CanonicalProductMatch } from './types';

/**
 * Finds an exact match by UPC
 * Returns 100% confidence if found
 */
export async function matchByUPC(upc: string): Promise<CanonicalProductMatch | null> {
  if (!upc || upc.trim() === '') {
    return null;
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('canonical_products')
    .select('id, upc, normalized_name, category, manufacturer, image_count')
    .eq('upc', upc.trim())
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    upc: data.upc,
    normalizedName: data.normalized_name,
    category: data.category,
    manufacturer: data.manufacturer,
    imageCount: data.image_count || 0,
    confidence: 100, // Exact UPC match = 100% confidence
  };
}

/**
 * Validates UPC format
 */
export function isValidUPC(upc: string): boolean {
  if (!upc) return false;
  
  const cleaned = upc.trim().replace(/\s/g, '');
  
  // UPC-A (12 digits) or EAN-13 (13 digits)
  return /^\d{12,13}$/.test(cleaned);
}

/**
 * Normalizes UPC for consistent storage and matching
 */
export function normalizeUPC(upc: string): string {
  if (!upc) return '';
  
  // Remove spaces and convert to uppercase
  return upc.trim().replace(/\s/g, '').toUpperCase();
}










