#!/usr/bin/env ts-node

/**
 * Data Migration Script: Convert Existing Products to Canonical System
 * 
 * This script:
 * 1. Finds all products without canonical_product_id
 * 2. Attempts to match them to existing canonical products by UPC
 * 3. Creates new canonical products for unmatched items
 * 4. Links products to their canonical products
 * 
 * Usage:
 *   npm run migrate:canonical
 *   
 * Or with options:
 *   npm run migrate:canonical -- --dry-run --limit=100
 */

import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BATCH_SIZE = 50;

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]!) : undefined;

interface Product {
  id: string;
  user_id: string;
  upc: string | null;
  description: string;
  category_name: string | null;
  manufacturer_name: string | null;
}

interface CanonicalProduct {
  id: string;
  upc: string;
  normalized_name: string;
}

interface MigrationStats {
  totalProducts: number;
  matched: number;
  created: number;
  failed: number;
  errors: string[];
}

async function main() {
  console.log('🚀 Starting canonical product migration...');
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'PRODUCTION'}`);
  if (limit) console.log(`Limit: ${limit} products`);
  console.log('');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Missing Supabase credentials. Check environment variables.');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const stats: MigrationStats = {
    totalProducts: 0,
    matched: 0,
    created: 0,
    failed: 0,
    errors: [],
  };

  // Step 1: Get products without canonical_product_id
  console.log('📋 Fetching products without canonical mapping...');
  
  let query = supabase
    .from('products')
    .select('id, user_id, upc, description, category_name, manufacturer_name')
    .is('canonical_product_id', null)
    .order('created_at', { ascending: true });

  if (limit) {
    query = query.limit(limit);
  }

  const { data: products, error: fetchError } = await query;

  if (fetchError) {
    throw new Error(`Failed to fetch products: ${fetchError.message}`);
  }

  if (!products || products.length === 0) {
    console.log('✅ No products to migrate!');
    return;
  }

  stats.totalProducts = products.length;
  console.log(`Found ${products.length} products to process\n`);

  // Step 2: Get existing canonical products for matching
  console.log('📚 Loading existing canonical products...');
  const { data: existingCanonical } = await supabase
    .from('canonical_products')
    .select('id, upc, normalized_name');

  const canonicalByUPC = new Map<string, string>();
  if (existingCanonical) {
    existingCanonical.forEach((cp: CanonicalProduct) => {
      if (cp.upc) {
        canonicalByUPC.set(normalizeUPC(cp.upc), cp.id);
      }
    });
  }
  console.log(`Loaded ${canonicalByUPC.size} existing canonical products\n`);

  // Step 3: Process products in batches
  console.log('🔄 Processing products...\n');
  
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(products.length / BATCH_SIZE);

    console.log(`Batch ${batchNum}/${totalBatches} (${batch.length} products):`);

    for (const product of batch) {
      try {
        let canonicalId: string | null = null;

        // Try to match by UPC
        if (product.upc) {
          const normalizedUpc = normalizeUPC(product.upc);
          canonicalId = canonicalByUPC.get(normalizedUpc) || null;

          if (canonicalId) {
            stats.matched++;
            console.log(`  ✓ Matched: "${product.description}" → UPC ${product.upc}`);
          }
        }

        // Create new canonical product if no match
        if (!canonicalId) {
          if (isDryRun) {
            console.log(`  ○ Would create: "${product.description}"`);
            stats.created++;
          } else {
            const upc = product.upc 
              ? normalizeUPC(product.upc) 
              : `TEMP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            const { data: newCanonical, error: createError } = await supabase
              .from('canonical_products')
              .insert({
                upc: upc,
                normalized_name: normalizeProductName(product.description),
                category: product.category_name,
                manufacturer: product.manufacturer_name,
              })
              .select('id')
              .single();

            if (createError) {
              throw createError;
            }

            canonicalId = newCanonical.id;
            
            // Add to map for future matches in this batch
            if (product.upc && canonicalId) {
              canonicalByUPC.set(normalizeUPC(product.upc), canonicalId);
            }

            stats.created++;
            console.log(`  + Created: "${product.description}"`);
          }
        }

        // Link product to canonical
        if (canonicalId && !isDryRun) {
          const { error: linkError } = await supabase
            .from('products')
            .update({ canonical_product_id: canonicalId })
            .eq('id', product.id);

          if (linkError) {
            throw linkError;
          }
        }
      } catch (error) {
        stats.failed++;
        const errorMsg = `Failed to process product ${product.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        stats.errors.push(errorMsg);
        console.log(`  ✗ ${errorMsg}`);
      }
    }

    console.log('');
    
    // Small delay between batches
    if (i + BATCH_SIZE < products.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Step 4: Print summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Migration Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total products processed: ${stats.totalProducts}`);
  console.log(`Matched to existing:      ${stats.matched}`);
  console.log(`New canonical created:    ${stats.created}`);
  console.log(`Failed:                   ${stats.failed}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (stats.failed > 0) {
    console.log('\n❌ Errors:');
    stats.errors.forEach(err => console.log(`  - ${err}`));
  }

  if (isDryRun) {
    console.log('\n⚠️  This was a DRY RUN - no changes were made');
    console.log('Run without --dry-run to apply changes');
  } else {
    console.log('\n✅ Migration complete!');
  }
}

// Helper functions
function normalizeUPC(upc: string): string {
  return upc.trim().replace(/\s/g, '').toUpperCase();
}

function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s*-\s*/g, '-');
}

// Run the migration
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });





