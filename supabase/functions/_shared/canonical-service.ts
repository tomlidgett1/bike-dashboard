/**
 * Canonical Service Module
 * 
 * Centralised service for managing canonical products and their categorisation.
 * Provides consistent logic across all product upload flows.
 */

import { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { categoriseProductBatch } from './ai-categorisation.ts';
import {
  inferDeterministicCategory,
  loadCanonicalTaxonomy,
  resolveCategoryPath,
} from './category-taxonomy.ts';

// ============================================================
// Types
// ============================================================

export interface ProductData {
  description: string;
  upc?: string | null;
  category_name?: string | null;
  manufacturer_name?: string | null;
}

export interface CategoryResult {
  marketplace_category: string;
  marketplace_subcategory: string;
  marketplace_level_3_category: string | null;
  display_name: string;
}

export interface CanonicalProductResult {
  canonical_product_id: string;
  categories?: CategoryResult;
  isNew: boolean;
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Normalises a UPC code for consistent matching
 */
function normalizeUPC(upc: string | null | undefined): string | null {
  if (!upc) return null;
  // Remove all whitespace and convert to uppercase
  const normalized = upc.trim().toUpperCase().replace(/\s+/g, '');
  if (normalized.length === 0) return null;
  return normalized;
}

/**
 * Normalises a product name for matching
 */
function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, ' '); // Collapse whitespace
}

// ============================================================
// Core Functions
// ============================================================

/**
 * Finds or creates a canonical product
 * Optionally runs AI categorisation if the canonical product is new or uncategorised
 */
export async function findOrCreateCanonical(
  supabase: SupabaseClient,
  product: ProductData,
  options: {
    runAiCategorisation?: boolean;
    openaiApiKey?: string;
  } = {}
): Promise<CanonicalProductResult> {
  const { runAiCategorisation = false, openaiApiKey } = options;
  
  const normalizedUpc = normalizeUPC(product.upc);
  const normalizedName = normalizeProductName(product.description);
  
  let canonical_product_id: string;
  let isNew = false;
  let categories: CategoryResult | undefined;

  // ============================================================
  // Step 1: Try to find existing canonical product
  // ============================================================
  
  if (normalizedUpc) {
    // Try to match by UPC
    const { data: existingByUpc, error: upcError } = await supabase
      .from('canonical_products')
      .select('id, marketplace_category, marketplace_subcategory, marketplace_level_3_category, display_name, cleaned, categorisation_status')
      .eq('upc', normalizedUpc)
      .maybeSingle();
    
    if (existingByUpc) {
      console.log(`[CANONICAL SERVICE] Found existing canonical by UPC: ${existingByUpc.id}`);
      canonical_product_id = existingByUpc.id;
      
      // Check if it needs categorisation
      if (
        runAiCategorisation &&
        (existingByUpc.categorisation_status !== 'classified' || !existingByUpc.marketplace_category)
      ) {
        console.log(`[CANONICAL SERVICE] Existing canonical needs categorisation`);
        categories = await categoriseCanonicalProduct(supabase, canonical_product_id, openaiApiKey!);
      } else if (existingByUpc.marketplace_category) {
        categories = {
          marketplace_category: existingByUpc.marketplace_category,
          marketplace_subcategory: existingByUpc.marketplace_subcategory,
          marketplace_level_3_category: existingByUpc.marketplace_level_3_category,
          display_name: existingByUpc.display_name || product.description,
        };
      }
      
      return { canonical_product_id, categories, isNew: false };
    }
  }
  
  // Try to match by normalized_name (for products without UPC)
  const { data: existingByName, error: nameError } = await supabase
    .from('canonical_products')
    .select('id, marketplace_category, marketplace_subcategory, marketplace_level_3_category, display_name, cleaned, categorisation_status')
    .eq('normalized_name', normalizedName)
    .maybeSingle();
  
  if (existingByName) {
    console.log(`[CANONICAL SERVICE] Found existing canonical by name: ${existingByName.id}`);
    canonical_product_id = existingByName.id;
    
    // Check if it needs categorisation
    if (
      runAiCategorisation &&
      (existingByName.categorisation_status !== 'classified' || !existingByName.marketplace_category)
    ) {
      console.log(`[CANONICAL SERVICE] Existing canonical needs categorisation`);
      categories = await categoriseCanonicalProduct(supabase, canonical_product_id, openaiApiKey!);
    } else if (existingByName.marketplace_category) {
      categories = {
        marketplace_category: existingByName.marketplace_category,
        marketplace_subcategory: existingByName.marketplace_subcategory,
        marketplace_level_3_category: existingByName.marketplace_level_3_category,
        display_name: existingByName.display_name || product.description,
      };
    }
    
    return { canonical_product_id, categories, isNew: false };
  }

  // ============================================================
  // Step 2: Create new canonical product
  // ============================================================
  
  console.log(`[CANONICAL SERVICE] Creating new canonical product`);
  isNew = true;
  
  const { data: newCanonical, error: insertError } = await supabase
    .from('canonical_products')
    .insert({
      upc: normalizedUpc,
      normalized_name: normalizedName,
      category: product.category_name || null,
      manufacturer: product.manufacturer_name || null,
      cleaned: false, // Will be set to true after AI categorisation
      categorisation_status: 'pending',
    })
    .select('id')
    .single();
  
  if (insertError) {
    throw new Error(`Failed to create canonical product: ${insertError.message}`);
  }
  
  canonical_product_id = newCanonical.id;
  console.log(`[CANONICAL SERVICE] Created new canonical: ${canonical_product_id}`);
  
  // ============================================================
  // Step 3: Run AI categorisation if requested
  // ============================================================
  
  if (runAiCategorisation && openaiApiKey) {
    console.log(`[CANONICAL SERVICE] Running AI categorisation on new canonical`);
    categories = await categoriseCanonicalProduct(supabase, canonical_product_id, openaiApiKey);
  }
  
  return { canonical_product_id, categories, isNew };
}

/**
 * Categorises a canonical product using AI
 * Updates the canonical_products table with the results
 */
export async function categoriseCanonicalProduct(
  supabase: SupabaseClient,
  canonicalId: string,
  openaiApiKey: string
): Promise<CategoryResult> {
  const { data: canonical, error: fetchError } = await supabase
    .from('canonical_products')
    .select('id, normalized_name, category, manufacturer')
    .eq('id', canonicalId)
    .single();
  
  if (fetchError || !canonical) {
    throw new Error(`Failed to fetch canonical product: ${fetchError?.message}`);
  }

  const attemptedAt = new Date().toISOString();
  const productInput = {
    id: canonical.id,
    normalized_name: canonical.normalized_name,
    category: canonical.category,
    manufacturer: canonical.manufacturer,
  };

  await supabase
    .from('canonical_products')
    .update({
      categorisation_status: 'processing',
      categorisation_error: null,
      categorisation_attempted_at: attemptedAt,
    })
    .eq('id', canonicalId);

  try {
    const { paths, promptTaxonomy } = await loadCanonicalTaxonomy(supabase);
    const deterministicId = await inferDeterministicCategory(supabase, productInput);

    if (deterministicId) {
      const { data: updated, error: updateError } = await supabase
        .from('canonical_products')
        .update({
          marketplace_category_id: deterministicId,
          categorisation_status: 'classified',
          categorisation_source: 'deterministic',
          categorisation_confidence: 0.95,
          categorisation_error: null,
          categorisation_attempted_at: attemptedAt,
          categorised_at: attemptedAt,
        })
        .eq('id', canonicalId)
        .select('marketplace_category, marketplace_subcategory, marketplace_level_3_category, display_name')
        .single();

      if (updateError || !updated) {
        throw new Error(`Failed to save deterministic category: ${updateError?.message}`);
      }

      return {
        marketplace_category: updated.marketplace_category,
        marketplace_subcategory: updated.marketplace_subcategory,
        marketplace_level_3_category: updated.marketplace_level_3_category,
        display_name: updated.display_name || canonical.normalized_name,
      };
    }

    const [result] = await categoriseProductBatch(
      [productInput],
      openaiApiKey,
      promptTaxonomy,
    );

    if (!result?.success) {
      throw new Error(result?.error || 'AI did not return a valid category');
    }

    const category = resolveCategoryPath(
      paths,
      result.category,
      result.subcategory,
      result.level3,
    );
    if (!category) {
      throw new Error(
        `AI category is not in the canonical taxonomy: ${result.category} > ${result.subcategory}`,
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from('canonical_products')
      .update({
        marketplace_category_id: category.id,
        display_name: result.displayName,
        cleaned: true,
        categorisation_status: 'classified',
        categorisation_source: 'ai',
        categorisation_confidence: 0.85,
        categorisation_error: null,
        categorisation_attempted_at: attemptedAt,
        categorised_at: attemptedAt,
      })
      .eq('id', canonicalId)
      .select('marketplace_category, marketplace_subcategory, marketplace_level_3_category, display_name')
      .single();

    if (updateError || !updated) {
      throw new Error(`Failed to update canonical product: ${updateError?.message}`);
    }

    console.log(
      `✅ [CANONICAL SERVICE] Categorised ${canonical.normalized_name} as ${updated.marketplace_category} > ${updated.marketplace_subcategory}`,
    );

    return {
      marketplace_category: updated.marketplace_category,
      marketplace_subcategory: updated.marketplace_subcategory,
      marketplace_level_3_category: updated.marketplace_level_3_category,
      display_name: updated.display_name || result.displayName,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown categorisation error';
    await supabase
      .from('canonical_products')
      .update({
        categorisation_status: 'needs_review',
        categorisation_error: message,
        categorisation_attempted_at: attemptedAt,
      })
      .eq('id', canonicalId);
    throw error;
  }
}

/**
 * Batch categorise multiple canonical products
 * Useful for backfilling or processing uncategorised products
 */
export async function batchCategoriseCanonicals(
  supabase: SupabaseClient,
  canonicalIds: string[],
  openaiApiKey: string,
  batchSize: number = 20
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  const { paths, promptTaxonomy } = await loadCanonicalTaxonomy(supabase);

  for (let i = 0; i < canonicalIds.length; i += batchSize) {
    const batch = canonicalIds.slice(i, i + batchSize);
    const { data: canonicals, error: fetchError } = await supabase
      .from('canonical_products')
      .select('id, normalized_name, category, manufacturer')
      .in('id', batch);

    if (fetchError || !canonicals) {
      console.error(`❌ Failed to fetch batch: ${fetchError?.message}`);
      failed += batch.length;
      continue;
    }

    const attemptedAt = new Date().toISOString();
    await supabase
      .from('canonical_products')
      .update({
        categorisation_status: 'processing',
        categorisation_error: null,
        categorisation_attempted_at: attemptedAt,
      })
      .in('id', batch);

    const inputs = canonicals.map((canonical) => ({
      id: canonical.id,
      normalized_name: canonical.normalized_name,
      category: canonical.category,
      manufacturer: canonical.manufacturer,
    }));
    const deterministic = await Promise.all(
      inputs.map(async (input) => ({
        input,
        categoryId: await inferDeterministicCategory(supabase, input),
      })),
    );
    const unresolved: typeof inputs = [];

    for (const match of deterministic) {
      if (!match.categoryId) {
        unresolved.push(match.input);
        continue;
      }

      const { error: updateError } = await supabase
        .from('canonical_products')
        .update({
          marketplace_category_id: match.categoryId,
          categorisation_status: 'classified',
          categorisation_source: 'deterministic',
          categorisation_confidence: 0.95,
          categorisation_error: null,
          categorisation_attempted_at: attemptedAt,
          categorised_at: attemptedAt,
        })
        .eq('id', match.input.id);

      if (updateError) {
        failed++;
        console.error(`❌ Failed deterministic update ${match.input.id}: ${updateError.message}`);
      } else {
        success++;
      }
    }

    if (unresolved.length === 0) continue;

    const results = await categoriseProductBatch(
      unresolved.map(c => ({
        id: c.id,
        normalized_name: c.normalized_name,
        category: c.category,
        manufacturer: c.manufacturer,
      })),
      openaiApiKey,
      promptTaxonomy,
    );

    for (const result of results) {
      if (result.success) {
        const category = resolveCategoryPath(
          paths,
          result.category,
          result.subcategory,
          result.level3,
        );
        if (!category) {
          result.success = false;
          result.error = 'AI result did not resolve to a canonical category node';
        }
      }

      if (result.success) {
        const category = resolveCategoryPath(
          paths,
          result.category,
          result.subcategory,
          result.level3,
        )!;
        const { error: updateError } = await supabase
          .from('canonical_products')
          .update({
            marketplace_category_id: category.id,
            display_name: result.displayName,
            cleaned: true,
            categorisation_status: 'classified',
            categorisation_source: 'ai',
            categorisation_confidence: 0.85,
            categorisation_error: null,
            categorisation_attempted_at: attemptedAt,
            categorised_at: attemptedAt,
          })
          .eq('id', result.id);

        if (updateError) {
          console.error(`❌ Failed to update ${result.id}: ${updateError.message}`);
          failed++;
        } else {
          success++;
        }
      } else {
        await supabase
          .from('canonical_products')
          .update({
            categorisation_status: 'needs_review',
            categorisation_error: result.error || 'AI categorisation failed',
            categorisation_attempted_at: attemptedAt,
          })
          .eq('id', result.id);
        failed++;
      }
    }
  }

  return { success, failed };
}







