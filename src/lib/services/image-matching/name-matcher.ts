// ============================================================
// Name Matcher - Fuzzy Name Matching
// ============================================================

import { createClient } from '@/lib/supabase/server';
import type { CanonicalProductMatch } from './types';

/**
 * Finds matches by product name using PostgreSQL fuzzy matching
 * Uses trigram similarity for fuzzy matching
 */
export async function matchByName(
  productName: string,
  options?: {
    minSimilarity?: number;
    limit?: number;
    category?: string | null;
    manufacturer?: string | null;
  }
): Promise<CanonicalProductMatch[]> {
  if (!productName || productName.trim() === '') {
    return [];
  }

  const {
    minSimilarity = 0.3, // 30% similarity threshold
    limit = 5,
    category,
    manufacturer,
  } = options || {};

  const supabase = await createClient();
  const normalizedName = normalizeProductName(productName);

  // Build query with optional filters
  let query = supabase
    .from('canonical_products')
    .select('id, upc, normalized_name, category, manufacturer, image_count')
    .gte('similarity', minSimilarity) // This is a virtual column we calculate
    .order('similarity', { ascending: false })
    .limit(limit);

  // Add category filter if provided
  if (category) {
    query = query.eq('category', category);
  }

  // Add manufacturer filter if provided
  if (manufacturer) {
    query = query.ilike('manufacturer', `%${manufacturer}%`);
  }

  // Use RPC function for trigram similarity matching
  const { data, error } = await supabase.rpc('search_canonical_products_by_name', {
    search_term: normalizedName,
    min_similarity: minSimilarity,
    result_limit: limit,
    filter_category: category || null,
    filter_manufacturer: manufacturer || null,
  });

  if (error) {
    console.error('Error matching by name:', error);
    return [];
  }

  if (!data || data.length === 0) {
    return [];
  }

  return data.map((item: any) => ({
    id: item.id,
    upc: item.upc,
    normalizedName: item.normalized_name,
    category: item.category,
    manufacturer: item.manufacturer,
    imageCount: item.image_count || 0,
    confidence: Math.round(item.similarity * 100), // Convert similarity to percentage
  }));
}

/**
 * Gets the best name match (highest confidence)
 */
export async function getBestNameMatch(
  productName: string,
  options?: {
    category?: string | null;
    manufacturer?: string | null;
  }
): Promise<CanonicalProductMatch | null> {
  const matches = await matchByName(productName, {
    ...options,
    minSimilarity: 0.7, // Higher threshold for "best" match
    limit: 1,
  });

  return matches.length > 0 ? matches[0] : null;
}

/**
 * Normalizes product name for consistent matching
 * - Converts to lowercase
 * - Removes extra whitespace
 * - Removes special characters (except hyphens)
 */
export function normalizeProductName(name: string): string {
  if (!name) return '';

  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Multiple spaces to single space
    .replace(/[^\w\s-]/g, '') // Remove special chars except hyphens
    .replace(/\s*-\s*/g, '-'); // Normalize hyphens
}

/**
 * Extracts key terms from product name for better matching
 * - Brand name
 * - Model number
 * - Key descriptors
 */
export function extractKeyTerms(productName: string): string[] {
  if (!productName) return [];

  const normalized = normalizeProductName(productName);
  const words = normalized.split(/\s+/);

  // Filter out common words that don't add matching value
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
  ]);

  return words
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, 10); // Limit to first 10 meaningful terms
}

/**
 * Calculates a simple Levenshtein distance between two strings
 * Used as fallback when trigram matching is not available
 */
export function calculateLevenshteinDistance(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  const matrix: number[][] = [];

  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= s1.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2[i - 1] === s1[j - 1]) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1,     // insertion
          matrix[i - 1]![j]! + 1      // deletion
        );
      }
    }
  }

  return matrix[s2.length]![s1.length]!;
}

/**
 * Calculates similarity percentage using Levenshtein distance
 */
export function calculateSimilarityPercentage(str1: string, str2: string): number {
  const distance = calculateLevenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  
  if (maxLength === 0) return 100;
  
  return Math.round(((maxLength - distance) / maxLength) * 100);
}







