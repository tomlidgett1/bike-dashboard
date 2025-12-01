/**
 * Onboarding-Based Recommendations
 * 
 * Uses user's onboarding preferences to generate initial recommendations
 * for new users who haven't browsed anything yet.
 * 
 * This solves the "cold start" problem - users get personalized recommendations
 * immediately after signup!
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface RecommendationResult {
  productIds: string[];
  score: number;
  algorithm: string;
}

interface OnboardingPreferences {
  riding_styles?: string[]; // ["mountain", "road", "gravel"]
  preferred_brands?: string[]; // ["Specialized", "Trek", "Shimano"]
  experience_level?: string; // "beginner", "intermediate", "advanced"
  budget_range?: string; // "500-1000", "1000-2500", etc.
  interests?: string[]; // ["complete-bikes", "wheels", "accessories"]
}

/**
 * Map riding styles to bike types/categories
 */
function mapRidingStyleToCategories(ridingStyle: string): { category?: string; bike_type?: string } {
  const styleMap: Record<string, { category?: string; bike_type?: string }> = {
    'mountain': { category: 'Bicycles', bike_type: 'Mountain' },
    'road': { category: 'Bicycles', bike_type: 'Road' },
    'gravel': { category: 'Bicycles', bike_type: 'Gravel' },
    'track': { category: 'Bicycles', bike_type: 'Track' },
    'bmx': { category: 'Bicycles', bike_type: 'BMX' },
    'commuter': { category: 'Bicycles', bike_type: 'Commuter' },
  };
  
  return styleMap[ridingStyle.toLowerCase()] || { category: 'Bicycles' };
}

/**
 * Map interests to marketplace categories
 */
function mapInterestToCategory(interest: string): string | null {
  const interestMap: Record<string, string> = {
    'complete-bikes': 'Bicycles',
    'wheels': 'Wheels & Tyres',
    'accessories': 'Parts',
    'components': 'Parts',
    'apparel': 'Apparel',
    'nutrition': 'Nutrition',
    'frames': 'Frames',
    'groupsets': 'Drivetrain',
  };
  
  return interestMap[interest.toLowerCase()] || null;
}

/**
 * Parse budget range to min/max values
 */
function parseBudgetRange(budgetRange: string): { min: number; max: number } {
  // Format: "1000-2500" or "2500+"
  if (budgetRange.includes('+')) {
    const min = parseInt(budgetRange.replace('+', ''));
    return { min, max: 999999 };
  }
  
  const [min, max] = budgetRange.split('-').map(v => parseInt(v.trim()));
  return { min: min || 0, max: max || 999999 };
}

/**
 * Get recommendations based on onboarding preferences
 * Used for brand new users who haven't browsed anything yet
 */
export async function getOnboardingBasedRecommendations(
  supabase: SupabaseClient,
  userId: string,
  options: {
    limit?: number;
  } = {}
): Promise<RecommendationResult> {
  const { limit = 50 } = options;

  try {
    console.log('[Algorithm] Getting onboarding-based recommendations for user:', userId);

    // Get user's onboarding preferences
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('preferences')
      .eq('user_id', userId)
      .single();

    if (userError || !user?.preferences) {
      console.log('[Algorithm] No onboarding preferences found');
      return { productIds: [], score: 0, algorithm: 'onboarding_based' };
    }

    const prefs = user.preferences as OnboardingPreferences;
    console.log('[Algorithm] Onboarding preferences:', prefs);

    // Simplified: Get ALL products within budget, then score in code
    let query = supabase
      .from('products')
      .select('id, description, display_name, price, marketplace_category, bike_type, manufacturer_name')
      .eq('is_active', true);

    // Only filter by budget (most restrictive filter)
    if (prefs.budget_range) {
      const { min, max } = parseBudgetRange(prefs.budget_range);
      query = query.gte('price', min).lte('price', max);
      console.log('[Algorithm] Budget filter:', min, '-', max);
    }

    // Get lots of products for scoring
    query = query.limit(500);
    
    const { data: products, error: productsError } = await query;

    if (productsError) {
      console.error('[Algorithm] Onboarding query error:', productsError);
      return { productIds: [], score: 0, algorithm: 'onboarding_based' };
    }

    if (!products || products.length === 0) {
      console.log('[Algorithm] No products found within budget/criteria');
      return { productIds: [], score: 0, algorithm: 'onboarding_based' };
    }

    console.log('[Algorithm] Found', products.length, 'products to score based on preferences');

    // Score products based on preference matches
    const scoredProducts = products.map(product => {
      let matchScore = 0;
      const text = `${product.display_name || ''} ${product.description || ''} ${product.manufacturer_name || ''}`.toLowerCase();

      // Score by brand matches (high value)
      if (prefs.preferred_brands) {
        prefs.preferred_brands.forEach(brand => {
          if (text.includes(brand.toLowerCase())) {
            matchScore += 5; // High score for brand match
          }
        });
      }

      // Score by riding style match
      if (prefs.riding_styles) {
        prefs.riding_styles.forEach(style => {
          const mapping = mapRidingStyleToCategories(style);
          if (mapping.bike_type && product.bike_type === mapping.bike_type) {
            matchScore += 3;
          }
        });
      }

      // Score by interest/category match
      if (prefs.interests) {
        prefs.interests.forEach(interest => {
          const category = mapInterestToCategory(interest);
          if (category && product.marketplace_category === category) {
            matchScore += 2;
          }
        });
      }

      // Score by price fit (within budget)
      if (prefs.budget_range && product.price) {
        const { min, max } = parseBudgetRange(prefs.budget_range);
        if (product.price >= min && product.price <= max) {
          matchScore += 1;
        }
      }

      return {
        id: product.id,
        matchScore,
      };
    });

    // Sort by match score
    scoredProducts.sort((a, b) => b.matchScore - a.matchScore);

    // Return top matches (even if score is 0 - within budget is still relevant)
    const topProducts = scoredProducts.slice(0, limit);
    const productIds = topProducts.map(p => p.id);

    console.log('[Algorithm] Onboarding-based scoring complete:');
    console.log('  - Products scored:', scoredProducts.length);
    console.log('  - Products with score > 0:', scoredProducts.filter(p => p.matchScore > 0).length);
    console.log('  - Top 3 scores:', topProducts.slice(0, 3).map(p => p.matchScore));
    console.log('  - Returning:', productIds.length, 'product IDs');

    return {
      productIds,
      score: 1.0, // High score - these match user's stated preferences!
      algorithm: 'onboarding_based',
    };
  } catch (error) {
    console.error('[Algorithm] Onboarding-based exception:', error);
    return { productIds: [], score: 0, algorithm: 'onboarding_based' };
  }
}

