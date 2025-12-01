/**
 * Generate Recommendations Edge Function
 * 
 * Background job that pre-generates recommendations for active users.
 * Runs every 15 minutes via cron job.
 * 
 * Invocation: cron schedule or manual trigger
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================
// Configuration
// ============================================================

const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ACTIVE_USER_WINDOW_HOURS = 24; // Consider users active if they interacted in last 24h
const BATCH_SIZE = 100; // Process users in batches
const MAX_USERS_PER_RUN = 1000; // Limit per execution to avoid timeouts

// ============================================================
// Types
// ============================================================

interface RecommendationResult {
  productIds: string[];
  score: number;
  algorithm: string;
}

// ============================================================
// Algorithm Implementations (Simplified for Edge Function)
// ============================================================

async function getTrendingProducts(
  supabase: any,
  limit: number = 50
): Promise<string[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, product_scores!left(trending_score)')
    .eq('is_active', true)
    .not('product_scores.trending_score', 'is', null)
    .order('product_scores(trending_score)', { ascending: false })
    .limit(limit);

  if (error || !data) {
    console.error('[Edge] Trending products error:', error);
    return [];
  }

  return data.map((p: any) => p.id);
}

async function getCategoryBasedRecommendations(
  supabase: any,
  userId: string,
  limit: number = 50
): Promise<string[]> {
  // Get user preferences
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('favorite_categories, favorite_price_range')
    .eq('user_id', userId)
    .single();

  if (!prefs || !prefs.favorite_categories || prefs.favorite_categories.length === 0) {
    return [];
  }

  const topCategories = prefs.favorite_categories.slice(0, 3).map((c: any) => c.category);

  let query = supabase
    .from('products')
    .select('id, marketplace_category, price, product_scores!left(popularity_score)')
    .eq('is_active', true)
    .in('marketplace_category', topCategories)
    .order('product_scores(popularity_score)', { ascending: false })
    .limit(limit);

  // Apply price range filter
  if (prefs.favorite_price_range) {
    const { min, max } = prefs.favorite_price_range;
    query = query.gte('price', min * 0.7).lte('price', max * 1.3);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data.map((p: any) => p.id);
}

async function getCollaborativeRecommendations(
  supabase: any,
  userId: string,
  limit: number = 50
): Promise<string[]> {
  // Get user's viewed products
  const { data: userViews } = await supabase
    .from('user_interactions')
    .select('product_id')
    .eq('user_id', userId)
    .eq('interaction_type', 'view')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(20);

  if (!userViews || userViews.length === 0) {
    return [];
  }

  const viewedProductIds = userViews.map((v: any) => v.product_id).filter(Boolean);

  // Find similar users
  const { data: similarUsers } = await supabase
    .from('user_interactions')
    .select('user_id, product_id')
    .in('product_id', viewedProductIds)
    .neq('user_id', userId)
    .eq('interaction_type', 'view')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(1000);

  if (!similarUsers || similarUsers.length === 0) {
    return [];
  }

  // Count overlap
  const userOverlap = new Map<string, number>();
  similarUsers.forEach((interaction: any) => {
    const count = userOverlap.get(interaction.user_id) || 0;
    userOverlap.set(interaction.user_id, count + 1);
  });

  const topSimilarUsers = Array.from(userOverlap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([uid]) => uid);

  // Get their views
  const { data: recommendations } = await supabase
    .from('user_interactions')
    .select('product_id')
    .in('user_id', topSimilarUsers)
    .eq('interaction_type', 'view')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  if (!recommendations) {
    return [];
  }

  // Count frequency
  const productFrequency = new Map<string, number>();
  recommendations.forEach((rec: any) => {
    if (rec.product_id && !viewedProductIds.includes(rec.product_id)) {
      const count = productFrequency.get(rec.product_id) || 0;
      productFrequency.set(rec.product_id, count + 1);
    }
  });

  return Array.from(productFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([pid]) => pid);
}

async function getKeywordBasedRecommendations(
  supabase: any,
  userId: string,
  limit: number = 50
): Promise<string[]> {
  try {
    // Get user keywords
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('favorite_keywords')
      .eq('user_id', userId)
      .single();

    if (!prefs?.favorite_keywords || prefs.favorite_keywords.length === 0) {
      return [];
    }

    const topKeywords = prefs.favorite_keywords.slice(0, 5).map((k: any) => k.keyword);
    
    // Build search query
    const searchConditions = topKeywords.flatMap((kw: string) => [
      `display_name.ilike.%${kw}%`,
      `description.ilike.%${kw}%`
    ]).join(',');

    const { data: products } = await supabase
      .from('products')
      .select('id, display_name, description')
      .eq('is_active', true)
      .or(searchConditions)
      .limit(limit * 2);

    if (!products || products.length === 0) return [];

    // Score by keyword matches
    const scored = products.map((p: any) => {
      const text = `${p.display_name || ''} ${p.description || ''}`.toLowerCase();
      let score = 0;
      
      topKeywords.forEach((kw: string) => {
        if (text.includes(kw.toLowerCase())) {
          const kwData = prefs.favorite_keywords.find((k: any) => k.keyword === kw);
          score += kwData?.score || 1;
        }
      });
      
      return { id: p.id, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(p => p.id);
  } catch (error) {
    console.error('[Edge] Keyword recommendations error:', error);
    return [];
  }
}

async function getOnboardingBasedRecommendations(
  supabase: any,
  userId: string,
  limit: number = 50
): Promise<string[]> {
  try {
    // Get user preferences
    const { data: user } = await supabase
      .from('users')
      .select('preferences')
      .eq('user_id', userId)
      .single();

    if (!user?.preferences) return [];

    const prefs = user.preferences;
    
    // Build query based on preferences
    let query = supabase
      .from('products')
      .select('id, price, marketplace_category, bike_type')
      .eq('is_active', true);

    // Apply budget filter
    if (prefs.budget_range) {
      const [min, max] = prefs.budget_range.split('-').map((v: string) => parseInt(v));
      if (min) query = query.gte('price', min);
      if (max) query = query.lte('price', max);
    }

    // Apply category/interest filters
    if (prefs.interests && prefs.interests.length > 0) {
      // Simple mapping
      const categories = prefs.interests.map((i: string) => {
        if (i.includes('bike')) return 'Bicycles';
        if (i.includes('wheel')) return 'Wheels & Tyres';
        if (i.includes('apparel')) return 'Apparel';
        return null;
      }).filter(Boolean);
      
      if (categories.length > 0) {
        query = query.in('marketplace_category', categories);
      }
    }

    query = query.limit(limit);
    const { data } = await query;
    
    return data?.map((p: any) => p.id) || [];
  } catch (error) {
    return [];
  }
}

async function generateHybridRecommendations(
  supabase: any,
  userId: string,
  limit: number = 50
): Promise<string[]> {
  const allRecommendations = new Map<string, number>();

  // Check interaction history
  const { count: interactionCount } = await supabase
    .from('user_interactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  const promises: Promise<any>[] = [];

  // Always try onboarding-based (for new users)
  promises.push(getOnboardingBasedRecommendations(supabase, userId, 40));
  promises.push(getTrendingProducts(supabase, 30));

  // Add interaction-based if user has history
  if (interactionCount && interactionCount > 0) {
    promises.push(getCategoryBasedRecommendations(supabase, userId, 30));
    promises.push(getCollaborativeRecommendations(supabase, userId, 30));
    promises.push(getKeywordBasedRecommendations(supabase, userId, 30));
  }

  const results = await Promise.all(promises);
  
  // Convert array results to recommendation format
  const formattedResults = results.map((ids, index) => {
    if (Array.isArray(ids)) {
      // Determine algorithm name from position
      const algoNames = ['onboarding_based', 'trending', 'category_based', 'collaborative', 'keyword_based'];
      return { productIds: ids, algorithm: algoNames[index] || 'unknown', score: 1.0 };
    }
    return ids;
  }).filter((r: any) => r.productIds && r.productIds.length > 0);

  // Aggregate with weights
  const addWithWeight = (ids: string[], weight: number) => {
    ids.forEach((id, index) => {
      const positionScore = 1.0 - (index / ids.length) * 0.9;
      const score = weight * positionScore;
      const existing = allRecommendations.get(id) || 0;
      allRecommendations.set(id, existing + score);
    });
  };

  // Weight each algorithm
  formattedResults.forEach((result: any) => {
    const weights: Record<string, number> = {
      'onboarding_based': 1.0,
      'keyword_based': 0.95,
      'category_based': 0.9,
      'trending': 0.85,
      'collaborative': 0.8,
      'popular': 0.7,
    };
    addWithWeight(result.productIds, weights[result.algorithm] || 0.5);
  });

  // Sort by score
  const ranked = Array.from(allRecommendations.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  return ranked;
}

// ============================================================
// Main Handler
// ============================================================

serve(async (req) => {
  try {
    // Verify authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[Edge] Starting recommendation generation...');

    // Get active users (those who interacted in last 24 hours)
    const activeUsersCutoff = new Date(
      Date.now() - ACTIVE_USER_WINDOW_HOURS * 60 * 60 * 1000
    ).toISOString();

    const { data: activeUsers, error: usersError } = await supabase
      .from('user_preferences')
      .select('user_id, last_active_at')
      .gte('last_active_at', activeUsersCutoff)
      .order('last_active_at', { ascending: false })
      .limit(MAX_USERS_PER_RUN);

    if (usersError) {
      throw new Error(`Failed to fetch active users: ${usersError.message}`);
    }

    if (!activeUsers || activeUsers.length === 0) {
      console.log('[Edge] No active users found');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No active users to process',
          processed: 0,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Edge] Found ${activeUsers.length} active users`);

    // Process users in batches
    let processedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < activeUsers.length; i += BATCH_SIZE) {
      const batch = activeUsers.slice(i, i + BATCH_SIZE);
      console.log(`[Edge] Processing batch ${i / BATCH_SIZE + 1}...`);

      await Promise.all(
        batch.map(async (userRecord) => {
          try {
            const userId = userRecord.user_id;
            console.log(`[Edge] Processing user: ${userId}`);

            // Check if valid cache exists
            const { data: existingCache, error: cacheCheckError } = await supabase
              .from('recommendation_cache')
              .select('expires_at')
              .eq('user_id', userId)
              .eq('recommendation_type', 'personalized')
              .gte('expires_at', new Date().toISOString())
              .limit(1)
              .single();

            if (cacheCheckError && cacheCheckError.code !== 'PGRST116') {
              console.error(`[Edge] Cache check error for user ${userId}:`, cacheCheckError);
            }

            // Skip if valid cache exists
            if (existingCache) {
              console.log(`[Edge] User ${userId} has valid cache, skipping`);
              return;
            }

            console.log(`[Edge] Generating recommendations for user ${userId}...`);
            
            // Generate recommendations
            const productIds = await generateHybridRecommendations(
              supabase,
              userId,
              50
            );

            console.log(`[Edge] Generated ${productIds.length} recommendations for user ${userId}`);

            if (productIds.length === 0) {
              console.log(`[Edge] No recommendations for user ${userId}`);
              return;
            }

            // Delete old cache entries
            await supabase
              .from('recommendation_cache')
              .delete()
              .eq('user_id', userId)
              .eq('recommendation_type', 'personalized');

            // Insert new cache
            const expiresAt = new Date(Date.now() + CACHE_DURATION_MS);
            const { error: insertError } = await supabase
              .from('recommendation_cache')
              .insert({
                user_id: userId,
                recommended_products: productIds,
                recommendation_type: 'personalized',
                score: 1.0,
                algorithm_version: 'v1.0',
                expires_at: expiresAt.toISOString(),
              });

            if (insertError) {
              console.error(`[Edge] Failed to insert cache for user ${userId}:`, insertError);
              throw insertError;
            }

            console.log(`[Edge] Successfully cached recommendations for user ${userId}`);
            processedCount++;
          } catch (error) {
            console.error(`[Edge] Error processing user ${userRecord.user_id}:`, error);
            errorCount++;
          }
        })
      );
    }

    // Update product scores
    console.log('[Edge] Calculating product scores...');
    const { error: scoresError } = await supabase.rpc('calculate_popularity_scores');
    if (scoresError) {
      console.error('[Edge] Failed to calculate scores:', scoresError);
    }

    // Clean expired cache
    console.log('[Edge] Cleaning expired cache...');
    const { error: cleanError } = await supabase.rpc('clean_expired_recommendations');
    if (cleanError) {
      console.error('[Edge] Failed to clean cache:', cleanError);
    }

    const result = {
      success: true,
      processed: processedCount,
      errors: errorCount,
      total_active_users: activeUsers.length,
      timestamp: new Date().toISOString(),
    };

    console.log('[Edge] Recommendation generation complete:', result);

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Edge] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

