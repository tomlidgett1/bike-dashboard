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
 */
export async function createCanonicalProduct(
  supabase: SupabaseClient,
  product: ProductData
): Promise<string> {
  const normalizedUpc = normalizeUPC(product.upc);
  const normalizedName = normalizeProductName(product.description);
  
  // If no UPC, generate a deterministic one based on normalized name
  // This ensures the same product gets the same temp UPC
  const upc = normalizedUpc || `TEMP-${normalizedName.replace(/\s/g, '-').substring(0, 50)}`;
  
  console.log(`[CREATE CANONICAL] Upserting canonical product with UPC: ${upc}`);
  
  // Use upsert to handle duplicates gracefully
  const { data, error } = await supabase
    .from('canonical_products')
    .upsert({
      upc: upc,
      normalized_name: normalizedName,
      category: product.category_name || null,
      manufacturer: product.manufacturer_name || null,
    }, {
      onConflict: 'upc',
      ignoreDuplicates: false, // Return existing if duplicate
    })
    .select('id')
    .single();

  if (error) {
    console.error(`[CREATE CANONICAL] Error upserting:`, error);
    
    // If upsert failed, try to fetch existing by UPC
    const { data: existing } = await supabase
      .from('canonical_products')
      .select('id')
      .eq('upc', upc)
      .single();
    
    if (existing) {
      console.log(`[CREATE CANONICAL] Found existing canonical by UPC: ${upc}`);
      return existing.id;
    }
    
    throw new Error(`Failed to create canonical product: ${error.message}`);
  }

  console.log(`[CREATE CANONICAL] Success! ID: ${data.id}`);
  return data.id;
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

  // Bulk fetch existing canonical products by UPC
  if (upcMap.size > 0) {
    const upcs = Array.from(upcMap.keys());
    console.log(`🔎 [CANONICAL MATCHING] Searching for existing canonical products with UPCs:`, upcs.slice(0, 5), '...');
    
    const { data: existingCanonical, error: fetchError } = await supabase
      .from('canonical_products')
      .select('id, upc')
      .in('upc', upcs);

    if (fetchError) {
      console.error(`❌ [CANONICAL MATCHING] Error fetching canonical products:`, fetchError);
    } else if (existingCanonical) {
      console.log(`✅ [CANONICAL MATCHING] Found ${existingCanonical.length} existing canonical products`);
      
      existingCanonical.forEach((canonical) => {
        const productIndexes = upcMap.get(canonical.upc);
        if (productIndexes) {
          productIndexes.forEach((index) => {
            canonicalMap.set(index, canonical.id);
          });
        }
      });
      
      console.log(`🔗 [CANONICAL MATCHING] Matched ${canonicalMap.size} products to existing canonical`);
    } else {
      console.log(`⚠️  [CANONICAL MATCHING] No existing canonical products found`);
    }
  }

  // For products without UPC match, try name matching or create new
  let nameMatched = 0;
  let newCreated = 0;
  let errors = 0;
  
  console.log(`🔄 [CANONICAL MATCHING] Processing ${products.length - canonicalMap.size} unmatched products...`);
  
  for (let i = 0; i < products.length; i++) {
    if (canonicalMap.has(i)) continue; // Already matched by UPC

    const product = products[i]!;

    // Try name matching
    try {
      const nameMatch = await matchByName(supabase, product.description, 0.85);
      if (nameMatch && nameMatch.confidence >= 85) {
        console.log(`✓ [CANONICAL MATCHING] Name matched product ${i}: "${product.description}" (${nameMatch.confidence}% confidence)`);
        canonicalMap.set(i, nameMatch.id);
        nameMatched++;
        continue;
      }
    } catch (error) {
      console.error(`⚠️  [CANONICAL MATCHING] Name match failed for product ${i}:`, error);
    }

    // Create new canonical product if no match found
    try {
      console.log(`+ [CANONICAL MATCHING] Creating new canonical for product ${i}: "${product.description}"`);
      const newCanonicalId = await createCanonicalProduct(supabase, product);
      canonicalMap.set(i, newCanonicalId);
      newCreated++;
    } catch (error) {
      console.error(`❌ [CANONICAL MATCHING] Failed to create canonical for product ${i}:`, error);
      errors++;
    }
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

