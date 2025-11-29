// ============================================================
// Canonical Product Matching Helper for Edge Functions
// ============================================================

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

interface ProductData {
  user_id: string;
  upc: string | null;
  description: string;
  category_name: string | null;
  manufacturer_name?: string | null;
}

interface MatchResult {
  canonicalProductId: string | null;
  confidence: number;
  matchType: 'upc_exact' | 'name_fuzzy' | 'none';
  shouldAutoLink: boolean;
}

/**
 * Normalizes UPC for matching
 */
function normalizeUPC(upc: string | null): string | null {
  if (!upc) return null;
  return upc.trim().replace(/\s/g, '').toUpperCase();
}

/**
 * Normalizes product name for matching
 */
function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s*-\s*/g, '-');
}

/**
 * Finds canonical product match by UPC
 */
async function matchByUPC(
  supabase: SupabaseClient,
  upc: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('canonical_products')
    .select('id')
    .eq('upc', upc)
    .single();

  if (error || !data) return null;
  return data.id;
}

/**
 * Finds canonical product match by name using fuzzy matching
 */
async function matchByName(
  supabase: SupabaseClient,
  productName: string,
  minSimilarity: number = 0.85
): Promise<{ id: string; confidence: number } | null> {
  const normalizedName = normalizeProductName(productName);

  const { data, error } = await supabase.rpc('search_canonical_products_by_name', {
    search_term: normalizedName,
    min_similarity: minSimilarity,
    result_limit: 1,
    filter_category: null,
    filter_manufacturer: null,
  });

  if (error || !data || data.length === 0) return null;

  return {
    id: data[0].id,
    confidence: data[0].similarity * 100,
  };
}

/**
 * Main matching function
 */
export async function findCanonicalMatch(
  supabase: SupabaseClient,
  product: ProductData
): Promise<MatchResult> {
  // Strategy 1: Try exact UPC match
  if (product.upc) {
    const normalizedUpc = normalizeUPC(product.upc);
    if (normalizedUpc) {
      const canonicalId = await matchByUPC(supabase, normalizedUpc);
      if (canonicalId) {
        return {
          canonicalProductId: canonicalId,
          confidence: 100,
          matchType: 'upc_exact',
          shouldAutoLink: true,
        };
      }
    }
  }

  // Strategy 2: Try fuzzy name match
  const nameMatch = await matchByName(supabase, product.description, 0.85);
  if (nameMatch && nameMatch.confidence >= 85) {
    return {
      canonicalProductId: nameMatch.id,
      confidence: nameMatch.confidence,
      matchType: 'name_fuzzy',
      shouldAutoLink: true,
    };
  }

  // No good match found
  return {
    canonicalProductId: null,
    confidence: 0,
    matchType: 'none',
    shouldAutoLink: false,
  };
}

/**
 * Creates a new canonical product
 * Uses UPSERT to avoid duplicates
 * For products without UPC, checks existing by normalized_name first
 */
export async function createCanonicalProduct(
  supabase: SupabaseClient,
  product: ProductData
): Promise<string> {
  const normalizedUpc = normalizeUPC(product.upc);
  const normalizedName = normalizeProductName(product.description);
  
  // If product has a real UPC, use it
  if (normalizedUpc) {
    console.log(`[CREATE CANONICAL] Upserting canonical product with UPC: ${normalizedUpc}`);
    
    const { data, error } = await supabase
      .from('canonical_products')
      .upsert({
        upc: normalizedUpc,
        normalized_name: normalizedName,
        category: product.category_name || null,
        manufacturer: product.manufacturer_name || null,
      }, {
        onConflict: 'upc',
        ignoreDuplicates: false,
      })
      .select('id')
      .single();

    if (error) {
      // Try to fetch existing
      const { data: existing } = await supabase
        .from('canonical_products')
        .select('id')
        .eq('upc', normalizedUpc)
        .single();
      
      if (existing) {
        return existing.id;
      }
      throw error;
    }

    return data.id;
  }
  
  // No UPC: Check if a canonical product with this normalized_name already exists
  console.log(`[CREATE CANONICAL] No UPC - searching by normalized_name: "${normalizedName}"`);
  
  const { data: existing, error: searchError } = await supabase
    .from('canonical_products')
    .select('id')
    .eq('normalized_name', normalizedName)
    .maybeSingle();
  
  if (existing) {
    console.log(`[CREATE CANONICAL] Found existing canonical by name: ${existing.id}`);
    return existing.id;
  }
  
  // Create new with NULL UPC (no TEMP prefix!)
  console.log(`[CREATE CANONICAL] Creating new canonical without UPC`);
  
  const { data: newCanonical, error: insertError } = await supabase
    .from('canonical_products')
    .insert({
      upc: null, // No UPC
      normalized_name: normalizedName,
      category: product.category_name || null,
      manufacturer: product.manufacturer_name || null,
    })
    .select('id')
    .single();

  if (insertError) {
    throw new Error(`Failed to create canonical product: ${insertError.message}`);
  }

  console.log(`[CREATE CANONICAL] Created new canonical: ${newCanonical.id}`);
  return newCanonical.id;
}

/**
 * Processes products in bulk for canonical matching
 * Returns a map of product index to canonical_product_id
 */
export async function matchProductsBulk(
  supabase: SupabaseClient,
  products: ProductData[]
): Promise<Map<number, string>> {
  console.log(`🔍 [CANONICAL MATCHING] Starting bulk match for ${products.length} products`);
  
  const canonicalMap = new Map<number, string>();

  // Group products by UPC for bulk UPC matching
  const upcMap = new Map<string, number[]>();
  products.forEach((product, index) => {
    if (product.upc) {
      const normalizedUpc = normalizeUPC(product.upc);
      if (normalizedUpc) {
        if (!upcMap.has(normalizedUpc)) {
          upcMap.set(normalizedUpc, []);
        }
        upcMap.get(normalizedUpc)!.push(index);
      }
    }
  });
  
  console.log(`📊 [CANONICAL MATCHING] Found ${upcMap.size} unique UPCs to match`);

  // Bulk fetch existing canonical products by UPC in batches
  if (upcMap.size > 0) {
    const upcs = Array.from(upcMap.keys());
    console.log(`🔎 [CANONICAL MATCHING] Searching for existing canonical products with UPCs:`, upcs.slice(0, 5), '...');
    
    // Process UPC lookups in batches of 1000 to avoid query limits
    const UPC_BATCH_SIZE = 1000;
    const allExistingCanonical: any[] = [];
    
    for (let i = 0; i < upcs.length; i += UPC_BATCH_SIZE) {
      const upcBatch = upcs.slice(i, i + UPC_BATCH_SIZE);
      const { data: batchData } = await supabase
        .from('canonical_products')
        .select('id, upc')
        .in('upc', upcBatch);
      
      if (batchData) {
        allExistingCanonical.push(...batchData);
      }
    }

    console.log(`✅ [CANONICAL MATCHING] Found ${allExistingCanonical.length} existing canonical products`);
    
    allExistingCanonical.forEach((canonical) => {
      const productIndexes = upcMap.get(canonical.upc);
      if (productIndexes) {
        productIndexes.forEach((index) => {
          canonicalMap.set(index, canonical.id);
        });
      }
    });
    
    console.log(`🔗 [CANONICAL MATCHING] Matched ${canonicalMap.size} products to existing canonical`);
  }

  // For products without UPC match, try name matching or create new
  let nameMatched = 0;
  let newCreated = 0;
  let errors = 0;
  
  console.log(`🔄 [CANONICAL MATCHING] Processing ${products.length - canonicalMap.size} unmatched products...`);
  
  // Get all unmatched product indexes
  const unmatchedIndexes = products
    .map((_, index) => index)
    .filter(index => !canonicalMap.has(index));
  
  if (unmatchedIndexes.length === 0) {
    console.log(`✅ [CANONICAL MATCHING] All products matched by UPC!`);
  } else {
    // Process unmatched products individually (safer for deduplication)
    console.log(`🔄 [CANONICAL MATCHING] Processing ${unmatchedIndexes.length} unmatched products...`);
    
    // Process in parallel batches
    const BATCH_SIZE = 20;
    
    for (let i = 0; i < unmatchedIndexes.length; i += BATCH_SIZE) {
      const batchIndexes = unmatchedIndexes.slice(i, i + BATCH_SIZE);
      
      await Promise.all(
        batchIndexes.map(async (index) => {
          const product = products[index]!;
          
          try {
            const canonicalId = await createCanonicalProduct(supabase, product);
            canonicalMap.set(index, canonicalId);
            newCreated++;
          } catch (error) {
            console.error(`❌ [CANONICAL MATCHING] Failed to create canonical for product ${index}:`, error);
            errors++;
          }
        })
      );
      
      console.log(`📊 Progress: ${Math.min(i + BATCH_SIZE, unmatchedIndexes.length)}/${unmatchedIndexes.length} processed`);
    }
    
    console.log(`✅ [CANONICAL MATCHING] Created/matched ${newCreated} canonical products`);
  }

  console.log(`\n📈 [CANONICAL MATCHING] Summary:`);
  console.log(`   - Total products: ${products.length}`);
  console.log(`   - UPC matched: ${canonicalMap.size - nameMatched - newCreated}`);
  console.log(`   - Name matched: ${nameMatched}`);
  console.log(`   - New created: ${newCreated}`);
  console.log(`   - Errors: ${errors}`);
  console.log(`   - Final mapped: ${canonicalMap.size}/${products.length}\n`);

  return canonicalMap;
}

