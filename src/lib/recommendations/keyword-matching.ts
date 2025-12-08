/**
 * Keyword-Based Recommendations
 * 
 * Matches products based on keywords extracted from user's browsing history.
 * Works even if manufacturer_name is not populated.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface RecommendationResult {
  productIds: string[];
  score: number;
  algorithm: string;
}

export interface UserPreferences {
  favorite_keywords: Array<{ keyword: string; score: number }>;
}

/**
 * Get keyword-based recommendations
 * Finds products containing keywords from user's browsing history
 */
export async function getKeywordBasedRecommendations(
  supabase: SupabaseClient,
  userId: string,
  options: {
    limit?: number;
    excludeProductIds?: string[];
  } = {}
): Promise<RecommendationResult> {
  const { limit = 50, excludeProductIds = [] } = options;

  try {
    console.log('[Algorithm] Getting keyword-based recommendations for user:', userId);

    // Get user's favorite keywords
    const { data: prefs, error: prefsError } = await supabase
      .from('user_preferences')
      .select('favorite_keywords')
      .eq('user_id', userId)
      .single();

    if (prefsError || !prefs || !prefs.favorite_keywords) {
      console.log('[Algorithm] No keyword preferences found for user');
      return { productIds: [], score: 0, algorithm: 'keyword_based' };
    }

    const preferences = prefs as UserPreferences;
    
    if (preferences.favorite_keywords.length === 0) {
      console.log('[Algorithm] Empty favorite_keywords array');
      return { productIds: [], score: 0, algorithm: 'keyword_based' };
    }

    // Get top 5 keywords
    const topKeywords = preferences.favorite_keywords
      .slice(0, 5)
      .map(k => k.keyword);

    console.log('[Algorithm] Searching for keywords:', topKeywords);

    // Build search conditions for each keyword
    const searchConditions = topKeywords.flatMap(kw => [
      `display_name.ilike.%${kw}%`,
      `description.ilike.%${kw}%`
    ]).join(',');

    // Search products containing these keywords
    const { data: products, error: searchError } = await supabase
      .from('products')
      .select(`
        id,
        display_name,
        description,
        marketplace_category,
        price,
        product_scores!left (
          popularity_score
        )
      `)
      .eq('is_active', true)
      .or(searchConditions)
      .limit(limit * 3); // Get more for scoring

    if (searchError) {
      console.error('[Algorithm] Keyword search error:', searchError);
      return { productIds: [], score: 0, algorithm: 'keyword_based' };
    }

    if (!products || products.length === 0) {
      console.log('[Algorithm] No products found matching keywords');
      return { productIds: [], score: 0, algorithm: 'keyword_based' };
    }

    console.log('[Algorithm] Found', products.length, 'products with keyword matches');

    // Score products by keyword matches
    const scoredProducts = products.map((product: any) => {
      const text = `${product.display_name || ''} ${product.description || ''}`.toLowerCase();
      let keywordMatchScore = 0;

      // Calculate keyword match score
      topKeywords.forEach((keyword: string) => {
        if (text.includes(keyword.toLowerCase())) {
          // Find the keyword's frequency score from user preferences
          const keywordData = preferences.favorite_keywords.find(
            k => k.keyword === keyword
          );
          const keywordWeight = keywordData?.score || 1;
          
          // Count occurrences in the text
          const regex = new RegExp(keyword, 'gi');
          const occurrences = (text.match(regex) || []).length;
          
          keywordMatchScore += keywordWeight * occurrences;
        }
      });

      return {
        id: product.id,
        keywordMatchScore,
        popularityScore: product.product_scores?.popularity_score || 0,
      };
    });

    // Filter out products with no keyword matches
    const matchedProducts = scoredProducts.filter(p => p.keywordMatchScore > 0);

    // Sort by combined score (keyword match + popularity)
    matchedProducts.sort((a, b) => {
      // Keyword match is primary, popularity is tiebreaker
      const scoreA = a.keywordMatchScore * 10 + a.popularityScore;
      const scoreB = b.keywordMatchScore * 10 + b.popularityScore;
      return scoreB - scoreA;
    });

    // Exclude specified products
    const filteredProductIds = matchedProducts
      .map(p => p.id)
      .filter(id => !excludeProductIds.includes(id))
      .slice(0, limit);

    console.log('[Algorithm] Keyword-based recommendations:', filteredProductIds.length);

    return {
      productIds: filteredProductIds,
      score: 0.95, // High score - very relevant!
      algorithm: 'keyword_based',
    };
  } catch (error) {
    console.error('[Algorithm] Keyword-based exception:', error);
    return { productIds: [], score: 0, algorithm: 'keyword_based' };
  }
}





