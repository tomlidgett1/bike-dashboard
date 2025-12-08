/**
 * Canonical Service Module
 * 
 * Centralised service for managing canonical products and their categorisation.
 * Provides consistent logic across all product upload flows.
 */

import { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { categoriseProductBatch, CategorisationResult } from './ai-categorisation.ts';

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
      .select('id, marketplace_category, marketplace_subcategory, marketplace_level_3_category, display_name, cleaned')
      .eq('upc', normalizedUpc)
      .maybeSingle();
    
    if (existingByUpc) {
      console.log(`[CANONICAL SERVICE] Found existing canonical by UPC: ${existingByUpc.id}`);
      canonical_product_id = existingByUpc.id;
      
      // Check if it needs categorisation
      if (runAiCategorisation && (!existingByUpc.cleaned || !existingByUpc.marketplace_category)) {
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
    .select('id, marketplace_category, marketplace_subcategory, marketplace_level_3_category, display_name, cleaned')
    .eq('normalized_name', normalizedName)
    .maybeSingle();
  
  if (existingByName) {
    console.log(`[CANONICAL SERVICE] Found existing canonical by name: ${existingByName.id}`);
    canonical_product_id = existingByName.id;
    
    // Check if it needs categorisation
    if (runAiCategorisation && (!existingByName.cleaned || !existingByName.marketplace_category)) {
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
  
  // Fetch the canonical product
  const { data: canonical, error: fetchError } = await supabase
    .from('canonical_products')
    .select('id, normalized_name, category, manufacturer')
    .eq('id', canonicalId)
    .single();
  
  if (fetchError || !canonical) {
    throw new Error(`Failed to fetch canonical product: ${fetchError?.message}`);
  }
  
  // Run AI categorisation (batch of 1)
  const results = await categoriseProductBatch(
    [{
      id: canonical.id,
      normalized_name: canonical.normalized_name,
      category: canonical.category,
      manufacturer: canonical.manufacturer,
    }],
    openaiApiKey
  );
  
  const result = results[0];
  
  if (!result || !result.success) {
    throw new Error(`AI categorisation failed: ${result?.error || 'Unknown error'}`);
  }
  
  // Update the canonical product with categories
  const { error: updateError } = await supabase
    .from('canonical_products')
    .update({
      marketplace_category: result.category,
      marketplace_subcategory: result.subcategory,
      marketplace_level_3_category: result.level3,
      display_name: result.displayName,
      cleaned: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', canonicalId);
  
  if (updateError) {
    throw new Error(`Failed to update canonical product: ${updateError.message}`);
  }
  
  console.log(`✅ [CANONICAL SERVICE] Categorised ${canonical.normalized_name} as ${result.category} > ${result.subcategory}`);
  
  return {
    marketplace_category: result.category,
    marketplace_subcategory: result.subcategory,
    marketplace_level_3_category: result.level3,
    display_name: result.displayName,
  };
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
  
  // Process in batches
  for (let i = 0; i < canonicalIds.length; i += batchSize) {
    const batch = canonicalIds.slice(i, i + batchSize);
    
    // Fetch canonical products
    const { data: canonicals, error: fetchError } = await supabase
      .from('canonical_products')
      .select('id, normalized_name, category, manufacturer')
      .in('id', batch);
    
    if (fetchError || !canonicals) {
      console.error(`❌ Failed to fetch batch: ${fetchError?.message}`);
      failed += batch.length;
      continue;
    }
    
    // Run AI categorisation
    const results = await categoriseProductBatch(
      canonicals.map(c => ({
        id: c.id,
        normalized_name: c.normalized_name,
        category: c.category,
        manufacturer: c.manufacturer,
      })),
      openaiApiKey
    );
    
    // Update each canonical product
    for (const result of results) {
      if (result.success) {
        const { error: updateError } = await supabase
          .from('canonical_products')
          .update({
            marketplace_category: result.category,
            marketplace_subcategory: result.subcategory,
            marketplace_level_3_category: result.level3,
            display_name: result.displayName,
            cleaned: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', result.id);
        
        if (updateError) {
          console.error(`❌ Failed to update ${result.id}: ${updateError.message}`);
          failed++;
        } else {
          success++;
        }
      } else {
        failed++;
      }
    }
  }
  
  return { success, failed };
}

