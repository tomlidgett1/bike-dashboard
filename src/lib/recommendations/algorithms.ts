/**
 * Recommendation Algorithms
 * 
 * Rule-based recommendation algorithms for the "For You" feed.
 * Implements trending, category-based, similar products, and collaborative filtering.
 */

import { SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// Types
// ============================================================

export interface RecommendationResult {
  productIds: string[];
  score: number;
  algorithm: string;
}

export interface UserPreferences {
  favorite_categories: Array<{ category: string; score: number }>;
  favorite_price_range: { min: number; max: number };
  favorite_brands: Array<{ brand: string; score: number }>;
  favorite_stores: Array<{ store_id: string; score: number }>;
  favorite_keywords?: Array<{ keyword: string; score: number }>;
  interaction_count: number;
}

// ============================================================
// 1. Trending Products Algorithm
// ============================================================

/**
 * Get trending products based on recent engagement
 * No personalization - same for all users
 */
export async function getTrendingProducts(
  supabase: SupabaseClient,
  options: {
    limit?: number;
    categoryFilter?: string;
    excludeProductIds?: string[];
  } = {}
): Promise<RecommendationResult> {
  const { limit = 50, categoryFilter, excludeProductIds = [] } = options;

  try {
    // Simplified query - get product IDs from product_scores first
    // STRICT: Only return products with trending_score > 0
    const { data: scores, error: scoresError } = await supabase
      .from('product_scores')
      .select('product_id, trending_score')
      .gt('trending_score', 0)
      .order('trending_score', { ascending: false })
      .limit(limit);

    console.log('[Algorithm] Trending query returned:', scores?.length || 0, 'products');

    if (scoresError) {
      console.error('[Algorithm] Trending products scores error:', scoresError);
      return { productIds: [], score: 0, algorithm: 'trending' };
    }

    if (!scores || scores.length === 0) {
      console.warn('[Algorithm] No products with trending scores > 0 found');
      return { productIds: [], score: 0, algorithm: 'trending' };
    }

    // Get product IDs
    let productIds = scores.map(s => s.product_id);

    // Filter by category if needed
    if (categoryFilter) {
      const { data: products } = await supabase
        .from('products')
        .select('id')
        .in('id', productIds)
        .eq('marketplace_category', categoryFilter)
        .eq('is_active', true);
      
      productIds = products?.map(p => p.id) || [];
    }

    // Exclude specified IDs
    if (excludeProductIds.length > 0) {
      productIds = productIds.filter(id => !excludeProductIds.includes(id));
    }

    console.log('[Algorithm] Trending products found:', productIds.length);

    return {
      productIds,
      score: 1.0,
      algorithm: 'trending',
    };
  } catch (error) {
    console.error('[Algorithm] Trending products exception:', error);
    return { productIds: [], score: 0, algorithm: 'trending' };
  }
}

// ============================================================
// 2. Category-Based Recommendations
// ============================================================

/**
 * Recommend products from user's favorite categories
 */
export async function getCategoryBasedRecommendations(
  supabase: SupabaseClient,
  userId: string,
  options: {
    limit?: number;
    excludeProductIds?: string[];
  } = {}
): Promise<RecommendationResult> {
  const { limit = 50, excludeProductIds = [] } = options;

  try {
    // Get user preferences
    const { data: prefs, error: prefsError } = await supabase
      .from('user_preferences')
      .select('favorite_categories, favorite_price_range')
      .eq('user_id', userId)
      .single();

    if (prefsError || !prefs || !prefs.favorite_categories) {
      // Fallback to trending if no preferences
      return getTrendingProducts(supabase, { limit, excludeProductIds });
    }

    const preferences = prefs as UserPreferences;
    const topCategories = preferences.favorite_categories.slice(0, 3).map(c => c.category);

    if (topCategories.length === 0) {
      return getTrendingProducts(supabase, { limit, excludeProductIds });
    }

    // Get products from favorite categories
    let query = supabase
      .from('products')
      .select(`
        id,
        marketplace_category,
        price,
        product_scores!left (
          popularity_score
        )
      `)
      .eq('is_active', true)
      .in('marketplace_category', topCategories)
      .order('product_scores(popularity_score)', { ascending: false })
      .limit(limit);

    // Apply price range filter if available
    if (preferences.favorite_price_range) {
      const { min, max } = preferences.favorite_price_range;
      query = query.gte('price', min * 0.7) // 30% below min
                   .lte('price', max * 1.3); // 30% above max
    }

    if (excludeProductIds.length > 0) {
      query = query.not('id', 'in', `(${excludeProductIds.join(',')})`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Algorithm] Category-based error:', error);
      return { productIds: [], score: 0, algorithm: 'category_based' };
    }

    const productIds = (data || []).map(p => p.id);

    return {
      productIds,
      score: 0.9,
      algorithm: 'category_based',
    };
  } catch (error) {
    console.error('[Algorithm] Category-based exception:', error);
    return { productIds: [], score: 0, algorithm: 'category_based' };
  }
}

// ============================================================
// 3. Similar Products Algorithm
// ============================================================

/**
 * Recommend products similar to what user has viewed
 * Based on category, price range, and store
 */
export async function getSimilarProducts(
  supabase: SupabaseClient,
  userId: string,
  options: {
    limit?: number;
    excludeProductIds?: string[];
  } = {}
): Promise<RecommendationResult> {
  const { limit = 50, excludeProductIds = [] } = options;

  try {
    // Get user's recently viewed products
    const { data: recentInteractions, error: interactionsError } = await supabase
      .from('user_interactions')
      .select('product_id, created_at')
      .eq('user_id', userId)
      .eq('interaction_type', 'view')
      .order('created_at', { ascending: false })
      .limit(10);

    if (interactionsError || !recentInteractions || recentInteractions.length === 0) {
      return { productIds: [], score: 0, algorithm: 'similar' };
    }

    const viewedProductIds = recentInteractions.map(i => i.product_id).filter(Boolean);

    if (viewedProductIds.length === 0) {
      return { productIds: [], score: 0, algorithm: 'similar' };
    }

    // Get details of viewed products
    const { data: viewedProducts, error: productsError } = await supabase
      .from('products')
      .select('marketplace_category, marketplace_subcategory, price, user_id')
      .in('id', viewedProductIds);

    if (productsError || !viewedProducts || viewedProducts.length === 0) {
      return { productIds: [], score: 0, algorithm: 'similar' };
    }

    // Extract categories, price ranges, and stores
    const categories = [...new Set(viewedProducts.map(p => p.marketplace_category).filter(Boolean))];
    const subcategories = [...new Set(viewedProducts.map(p => p.marketplace_subcategory).filter(Boolean))];
    const prices = viewedProducts.map(p => p.price).filter(p => p > 0);
    const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    const storeIds = [...new Set(viewedProducts.map(p => p.user_id).filter(Boolean))];

    // Find similar products
    let query = supabase
      .from('products')
      .select(`
        id,
        marketplace_category,
        marketplace_subcategory,
        price,
        user_id,
        product_scores!left (
          popularity_score
        )
      `)
      .eq('is_active', true);

    // Filter by categories
    if (categories.length > 0) {
      query = query.in('marketplace_category', categories);
    }

    // Apply price similarity (within 50% of average)
    if (avgPrice > 0) {
      query = query.gte('price', avgPrice * 0.5)
                   .lte('price', avgPrice * 1.5);
    }

    query = query.order('product_scores(popularity_score)', { ascending: false })
                 .limit(limit);

    // Exclude already viewed products and specified excludes
    const allExcludes = [...excludeProductIds, ...viewedProductIds];
    if (allExcludes.length > 0) {
      query = query.not('id', 'in', `(${allExcludes.join(',')})`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Algorithm] Similar products error:', error);
      return { productIds: [], score: 0, algorithm: 'similar' };
    }

    // Rank by similarity
    const rankedProducts = (data || []).map(product => {
      let similarityScore = 0;

      // Category match
      if (categories.includes(product.marketplace_category)) {
        similarityScore += 3;
      }

      // Subcategory match
      if (subcategories.includes(product.marketplace_subcategory)) {
        similarityScore += 2;
      }

      // Store match
      if (storeIds.includes(product.user_id)) {
        similarityScore += 1;
      }

      // Price similarity
      if (avgPrice > 0 && product.price > 0) {
        const priceDiff = Math.abs(product.price - avgPrice) / avgPrice;
        if (priceDiff < 0.2) {
          similarityScore += 2;
        } else if (priceDiff < 0.5) {
          similarityScore += 1;
        }
      }

      return { id: product.id, similarityScore };
    });

    // Sort by similarity score
    rankedProducts.sort((a, b) => b.similarityScore - a.similarityScore);

    const productIds = rankedProducts.map(p => p.id);

    return {
      productIds,
      score: 0.85,
      algorithm: 'similar',
    };
  } catch (error) {
    console.error('[Algorithm] Similar products exception:', error);
    return { productIds: [], score: 0, algorithm: 'similar' };
  }
}

// ============================================================
// 4. Collaborative Filtering (Users Who Viewed X Also Viewed Y)
// ============================================================

/**
 * Recommend products based on what similar users viewed
 */
export async function getCollaborativeRecommendations(
  supabase: SupabaseClient,
  userId: string,
  options: {
    limit?: number;
    excludeProductIds?: string[];
  } = {}
): Promise<RecommendationResult> {
  const { limit = 50, excludeProductIds = [] } = options;

  try {
    // Get user's viewed products (last 30 days)
    const { data: userViews, error: viewsError } = await supabase
      .from('user_interactions')
      .select('product_id')
      .eq('user_id', userId)
      .eq('interaction_type', 'view')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(20);

    if (viewsError || !userViews || userViews.length === 0) {
      return { productIds: [], score: 0, algorithm: 'collaborative' };
    }

    const viewedProductIds = userViews.map(v => v.product_id).filter(Boolean);

    if (viewedProductIds.length === 0) {
      return { productIds: [], score: 0, algorithm: 'collaborative' };
    }

    // Find other users who viewed the same products
    const { data: similarUsers, error: usersError } = await supabase
      .from('user_interactions')
      .select('user_id, product_id')
      .in('product_id', viewedProductIds)
      .neq('user_id', userId)
      .eq('interaction_type', 'view')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(1000);

    if (usersError || !similarUsers || similarUsers.length === 0) {
      return { productIds: [], score: 0, algorithm: 'collaborative' };
    }

    // Count overlap to find most similar users
    const userOverlap = new Map<string, number>();
    similarUsers.forEach(interaction => {
      const count = userOverlap.get(interaction.user_id) || 0;
      userOverlap.set(interaction.user_id, count + 1);
    });

    // Get top 10 most similar users
    const topSimilarUsers = Array.from(userOverlap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([uid]) => uid);

    if (topSimilarUsers.length === 0) {
      return { productIds: [], score: 0, algorithm: 'collaborative' };
    }

    // Get products viewed by similar users
    const { data: recommendations, error: recsError } = await supabase
      .from('user_interactions')
      .select('product_id')
      .in('user_id', topSimilarUsers)
      .eq('interaction_type', 'view')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (recsError || !recommendations) {
      return { productIds: [], score: 0, algorithm: 'collaborative' };
    }

    // Count frequency and exclude already viewed
    const productFrequency = new Map<string, number>();
    recommendations.forEach(rec => {
      if (rec.product_id && !viewedProductIds.includes(rec.product_id) && !excludeProductIds.includes(rec.product_id)) {
        const count = productFrequency.get(rec.product_id) || 0;
        productFrequency.set(rec.product_id, count + 1);
      }
    });

    // Sort by frequency
    const productIds = Array.from(productFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([pid]) => pid);

    return {
      productIds,
      score: 0.8,
      algorithm: 'collaborative',
    };
  } catch (error) {
    console.error('[Algorithm] Collaborative filtering exception:', error);
    return { productIds: [], score: 0, algorithm: 'collaborative' };
  }
}

// ============================================================
// 5. Popular Products (Fallback)
// ============================================================

/**
 * Get popular products by overall popularity score
 */
export async function getPopularProducts(
  supabase: SupabaseClient,
  options: {
    limit?: number;
    excludeProductIds?: string[];
  } = {}
): Promise<RecommendationResult> {
  const { limit = 50, excludeProductIds = [] } = options;

  try {
    // Simplified query - get from product_scores first
    const { data: scores, error: scoresError } = await supabase
      .from('product_scores')
      .select('product_id, popularity_score')
      .gt('popularity_score', 0)
      .order('popularity_score', { ascending: false })
      .limit(limit);

    if (scoresError || !scores || scores.length === 0) {
      console.error('[Algorithm] Popular products error:', scoresError);
      return { productIds: [], score: 0, algorithm: 'popular' };
    }

    let productIds = scores.map(s => s.product_id);

    // Exclude specified IDs
    if (excludeProductIds.length > 0) {
      productIds = productIds.filter(id => !excludeProductIds.includes(id));
    }

    console.log('[Algorithm] Popular products found:', productIds.length);

    return {
      productIds,
      score: 0.7,
      algorithm: 'popular',
    };
  } catch (error) {
    console.error('[Algorithm] Popular products exception:', error);
    return { productIds: [], score: 0, algorithm: 'popular' };
  }
}

// ============================================================
// 6. Hybrid Recommendation Engine
// ============================================================

/**
 * Combine multiple algorithms with diversity and deduplication
 */
export async function generateHybridRecommendations(
  supabase: SupabaseClient,
  userId: string | null,
  options: {
    limit?: number;
    diversityFactor?: number; // 0-1, higher = more diversity
  } = {}
): Promise<string[]> {
  const { limit = 50, diversityFactor = 0.2 } = options;

  try {
    console.log('[Hybrid] Starting hybrid recommendations for user:', userId || 'anonymous', 'limit:', limit);
    const allRecommendations: Map<string, { score: number; sources: string[] }> = new Map();

    // Run algorithms in parallel
    const promises: Promise<RecommendationResult>[] = [];

    if (userId) {
      // Check if user has interaction history
      const { count: interactionCount } = await supabase
        .from('user_interactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      // NEW: Onboarding-based recommendations (HIGHEST priority for new users!)
      const { getOnboardingBasedRecommendations } = await import('./onboarding-recommendations');
      promises.push(getOnboardingBasedRecommendations(supabase, userId, { limit: 40 }));

      // If user has browsing history, use interaction-based algorithms too
      if (interactionCount && interactionCount > 0) {
        promises.push(getCategoryBasedRecommendations(supabase, userId, { limit: 30 }));
        promises.push(getSimilarProducts(supabase, userId, { limit: 30 }));
        promises.push(getCollaborativeRecommendations(supabase, userId, { limit: 30 }));
        
        // Keyword-based recommendations
        const { getKeywordBasedRecommendations } = await import('./keyword-matching');
        promises.push(getKeywordBasedRecommendations(supabase, userId, { limit: 30 }));
      } else {
        console.log('[Hybrid] New user - using onboarding preferences only');
      }
    }

    // Non-personalized algorithms
    promises.push(getTrendingProducts(supabase, { limit: 30 }));
    promises.push(getPopularProducts(supabase, { limit: 30 }));

    console.log('[Hybrid] Running', promises.length, 'algorithms...');
    const results = await Promise.all(promises);
    
    console.log('[Hybrid] Algorithm results:', results.map(r => ({
      algorithm: r.algorithm,
      count: r.productIds.length,
      score: r.score,
    })));

    // Aggregate scores
    results.forEach(result => {
      console.log('[Hybrid] Processing algorithm:', result.algorithm, 'with', result.productIds.length, 'products');
      result.productIds.forEach((productId, index) => {
        const existing = allRecommendations.get(productId);
        // Position-based score decay (first item = 1.0, last = 0.1)
        const positionScore = 1.0 - (index / result.productIds.length) * 0.9;
        const score = result.score * positionScore;

        if (existing) {
          existing.score += score;
          existing.sources.push(result.algorithm);
        } else {
          allRecommendations.set(productId, {
            score,
            sources: [result.algorithm],
          });
        }
      });
    });

    console.log('[Hybrid] Total unique products in map:', allRecommendations.size);

    // Sort by combined score
    const ranked = Array.from(allRecommendations.entries())
      .sort((a, b) => b[1].score - a[1].score);

    console.log('[Hybrid] Ranked products:', ranked.length);

    // Simplify diversity for now - just return top scored products
    const finalRecommendations = ranked.slice(0, limit).map(([id]) => id);
    
    console.log('[Hybrid] Final recommendations count:', finalRecommendations.length);
    console.log('[Hybrid] Sample IDs:', finalRecommendations.slice(0, 3));
    
    return finalRecommendations;
  } catch (error) {
    console.error('[Algorithm] Hybrid recommendations exception:', error);
    return [];
  }
}

