// ============================================================
// Image Matching Service - Main Entry Point
// ============================================================

import { createClient } from '@/lib/supabase/server';
import { matchByUPC, normalizeUPC } from './upc-matcher';
import { matchByName, getBestNameMatch, normalizeProductName } from './name-matcher';
import type {
  MatchResult,
  ProductToMatch,
  MatchQueueItem,
  CreateCanonicalProductInput,
  CanonicalProductMatch,
} from './types';

/**
 * Main matching function - tries UPC first, then name matching
 */
export async function findCanonicalProductMatch(
  product: ProductToMatch
): Promise<MatchResult> {
  // Strategy 1: Try exact UPC match first
  if (product.upc) {
    const normalizedUpc = normalizeUPC(product.upc);
    const upcMatch = await matchByUPC(normalizedUpc);

    if (upcMatch) {
      return {
        canonicalProductId: upcMatch.id,
        confidence: 100,
        matchType: 'upc_exact',
        requiresReview: false,
      };
    }
  }

  // Strategy 2: Try fuzzy name matching
  const nameMatches = await matchByName(product.description, {
    minSimilarity: 0.7, // 70% similarity threshold
    limit: 5,
    category: product.categoryName,
    manufacturer: product.manufacturerName,
  });

  if (nameMatches.length > 0) {
    const bestMatch = nameMatches[0]!;

    // High confidence match (85%+) - auto-match
    if (bestMatch.confidence >= 85) {
      return {
        canonicalProductId: bestMatch.id,
        confidence: bestMatch.confidence,
        matchType: 'name_fuzzy',
        requiresReview: false,
        suggestedMatches: nameMatches,
      };
    }

    // Medium confidence match (70-84%) - suggest for review
    if (bestMatch.confidence >= 70) {
      return {
        canonicalProductId: null,
        confidence: bestMatch.confidence,
        matchType: 'name_fuzzy',
        requiresReview: true,
        suggestedMatches: nameMatches,
      };
    }
  }

  // No good match found
  return {
    canonicalProductId: null,
    confidence: 0,
    matchType: 'none',
    requiresReview: true,
    suggestedMatches: nameMatches,
  };
}

/**
 * Creates a new canonical product
 */
export async function createCanonicalProduct(
  input: CreateCanonicalProductInput
): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('canonical_products')
    .insert({
      upc: normalizeUPC(input.upc),
      normalized_name: normalizeProductName(input.normalizedName),
      category: input.category || null,
      manufacturer: input.manufacturer || null,
      model_year: input.modelYear || null,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create canonical product: ${error.message}`);
  }

  return data.id;
}

/**
 * Links a product to a canonical product
 */
export async function linkProductToCanonical(
  productId: string,
  canonicalProductId: string
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('products')
    .update({ canonical_product_id: canonicalProductId })
    .eq('id', productId);

  if (error) {
    throw new Error(`Failed to link product to canonical: ${error.message}`);
  }
}

/**
 * Processes a match queue item
 */
export async function processMatchQueueItem(queueItemId: string): Promise<MatchResult> {
  const supabase = await createClient();

  // Get queue item
  const { data: queueItem, error: queueError } = await supabase
    .from('image_match_queue')
    .select('*')
    .eq('id', queueItemId)
    .single();

  if (queueError || !queueItem) {
    throw new Error('Queue item not found');
  }

  // Get product details
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, upc, description, category_name, manufacturer_name')
    .eq('id', queueItem.product_id)
    .single();

  if (productError || !product) {
    throw new Error('Product not found');
  }

  // Find match
  const matchResult = await findCanonicalProductMatch({
    id: product.id,
    upc: product.upc,
    description: product.description,
    categoryName: product.category_name,
    manufacturerName: product.manufacturer_name,
  });

  // Update queue item with result
  const updateData: any = {
    match_confidence: matchResult.confidence,
    match_type: matchResult.matchType,
    last_attempt_at: new Date().toISOString(),
    attempts: queueItem.attempts + 1,
  };

  if (matchResult.canonicalProductId) {
    updateData.suggested_canonical_id = matchResult.canonicalProductId;
    updateData.status = 'matched';

    // Auto-link if high confidence
    if (!matchResult.requiresReview) {
      await linkProductToCanonical(product.id, matchResult.canonicalProductId);
    }
  } else if (matchResult.requiresReview) {
    updateData.status = 'manual_review';
    if (matchResult.suggestedMatches && matchResult.suggestedMatches.length > 0) {
      updateData.suggested_canonical_id = matchResult.suggestedMatches[0]!.id;
    }
  } else {
    updateData.status = 'manual_review';
  }

  await supabase
    .from('image_match_queue')
    .update(updateData)
    .eq('id', queueItemId);

  return matchResult;
}

/**
 * Processes all pending queue items for a user
 */
export async function processPendingQueue(
  userId: string,
  limit: number = 10
): Promise<{ processed: number; matched: number; needsReview: number }> {
  const supabase = await createClient();

  // Get pending items
  const { data: queueItems, error } = await supabase
    .from('image_match_queue')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .limit(limit);

  if (error || !queueItems) {
    return { processed: 0, matched: 0, needsReview: 0 };
  }

  let matched = 0;
  let needsReview = 0;

  for (const item of queueItems) {
    try {
      const result = await processMatchQueueItem(item.id);
      if (result.canonicalProductId && !result.requiresReview) {
        matched++;
      } else {
        needsReview++;
      }
    } catch (error) {
      console.error('Error processing queue item:', error);
    }
  }

  return {
    processed: queueItems.length,
    matched,
    needsReview,
  };
}

/**
 * Gets match queue items for a user
 */
export async function getMatchQueue(
  userId: string,
  status?: 'pending' | 'matched' | 'manual_review' | 'completed' | 'failed'
): Promise<MatchQueueItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from('image_match_queue')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data.map(item => ({
    id: item.id,
    productId: item.product_id,
    userId: item.user_id,
    upc: item.upc,
    productName: item.product_name,
    category: item.category,
    manufacturer: item.manufacturer,
    status: item.status,
    matchConfidence: item.match_confidence,
    matchType: item.match_type,
    suggestedCanonicalId: item.suggested_canonical_id,
    attempts: item.attempts,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }));
}

/**
 * Confirms a suggested match and links the product
 */
export async function confirmMatch(
  queueItemId: string,
  canonicalProductId: string
): Promise<void> {
  const supabase = await createClient();

  // Get queue item
  const { data: queueItem, error: queueError } = await supabase
    .from('image_match_queue')
    .select('product_id')
    .eq('id', queueItemId)
    .single();

  if (queueError || !queueItem) {
    throw new Error('Queue item not found');
  }

  // Link product to canonical
  await linkProductToCanonical(queueItem.product_id, canonicalProductId);

  // Update queue item status
  await supabase
    .from('image_match_queue')
    .update({
      status: 'completed',
      suggested_canonical_id: canonicalProductId,
      match_confidence: 100,
      match_type: 'manual',
    })
    .eq('id', queueItemId);
}

/**
 * Rejects suggested match and creates new canonical product
 */
export async function rejectMatchAndCreateNew(
  queueItemId: string,
  productData: CreateCanonicalProductInput
): Promise<string> {
  const supabase = await createClient();

  // Get queue item
  const { data: queueItem, error: queueError } = await supabase
    .from('image_match_queue')
    .select('product_id')
    .eq('id', queueItemId)
    .single();

  if (queueError || !queueItem) {
    throw new Error('Queue item not found');
  }

  // Create new canonical product
  const canonicalId = await createCanonicalProduct(productData);

  // Link product to new canonical
  await linkProductToCanonical(queueItem.product_id, canonicalId);

  // Update queue item status
  await supabase
    .from('image_match_queue')
    .update({
      status: 'completed',
      suggested_canonical_id: canonicalId,
      match_confidence: 100,
      match_type: 'manual',
    })
    .eq('id', queueItemId);

  return canonicalId;
}

// Re-export types
export type {
  MatchResult,
  ProductToMatch,
  MatchQueueItem,
  CreateCanonicalProductInput,
  CanonicalProductMatch,
} from './types';















