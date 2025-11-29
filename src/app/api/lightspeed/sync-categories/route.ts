import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createLightspeedClient } from '@/lib/services/lightspeed';

/**
 * POST /api/lightspeed/sync-categories
 * Instantly syncs products from selected categories
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { categoryIds } = body;

    if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
      return NextResponse.json({ error: 'No categories selected' }, { status: 400 });
    }

    // Create Lightspeed client
    const client = createLightspeedClient(user.id);

    // Create sync log
    const { data: syncLog } = await supabase
      .from('lightspeed_sync_logs')
      .insert({
        user_id: user.id,
        sync_type: 'manual',
        status: 'in_progress',
        entities_synced: ['products'],
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    const startTime = Date.now();
    let totalProductsSynced = 0;
    let totalProductsCreated = 0;

    // Sync each category
    for (const categoryId of categoryIds) {
      try {
        // Fetch items from this category with stock > 0
        const items = await client.getItems({
          categoryID: categoryId,
          archived: 'false',
        });

        // Filter items with positive stock
        const itemsWithStock = [];
        for (const item of items) {
          const itemShopsResponse = await client.getItemShops({ itemID: item.itemID });
          const itemShopsArray = Array.isArray(itemShopsResponse.ItemShop) 
            ? itemShopsResponse.ItemShop 
            : itemShopsResponse.ItemShop ? [itemShopsResponse.ItemShop] : [];
          const totalStock = itemShopsArray.reduce((sum, shop) => sum + parseInt(shop.qoh || '0'), 0);
          
          if (totalStock > 0) {
            itemsWithStock.push({ ...item, stock: totalStock });
          }
        }

        // Insert/update products
        for (const item of itemsWithStock) {
          const price = item.Prices?.ItemPrice?.[0]?.amount || '0';
          
          // Get category info
          const categories = await client.getCategories({ categoryID: categoryId });
          const category = categories[0];

          const productData = {
            user_id: user.id,
            lightspeed_item_id: item.itemID,
            name: item.description || 'Unnamed Product',
            sku: item.customSku || item.systemSku,
            price: parseFloat(price),
            stock: item.stock,
            category_id: categoryId,
            category_name: category?.name || '',
            category_path: category?.fullPathName || category?.name || '',
            image_url: item.Images?.Image?.[0]
              ? `${item.Images.Image[0].baseImageURL}${item.Images.Image[0].publicID}`
              : null,
            lightspeed_data: item,
            last_synced_at: new Date().toISOString(),
          };

          const { error } = await supabase
            .from('products')
            .upsert(productData, {
              onConflict: 'user_id,lightspeed_item_id',
            });

          if (!error) {
            totalProductsSynced++;
            // Check if it's a new product
            const { data: existing } = await supabase
              .from('products')
              .select('id')
              .eq('user_id', user.id)
              .eq('lightspeed_item_id', item.itemID)
              .single();
            
            if (!existing) {
              totalProductsCreated++;
            }
          }
        }

        // Update category sync preference
        await supabase
          .from('lightspeed_category_sync_preferences')
          .update({
            last_synced_at: new Date().toISOString(),
            product_count: itemsWithStock.length,
          })
          .eq('user_id', user.id)
          .eq('category_id', categoryId);

      } catch (categoryError) {
        console.error(`Error syncing category ${categoryId}:`, categoryError);
        // Continue with other categories
      }
    }

    const duration = Date.now() - startTime;

    // Update sync log
    if (syncLog) {
      await supabase
        .from('lightspeed_sync_logs')
        .update({
          status: 'completed',
          records_processed: totalProductsSynced,
          records_created: totalProductsCreated,
          completed_at: new Date().toISOString(),
          duration_ms: duration,
        })
        .eq('id', syncLog.id);
    }

    // Update last sync time on connection
    await supabase
      .from('lightspeed_connections')
      .update({
        last_sync_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    return NextResponse.json({
      success: true,
      message: `Synced ${totalProductsSynced} products from ${categoryIds.length} categories`,
      productsProcessed: totalProductsSynced,
      productsCreated: totalProductsCreated,
      categoriesSynced: categoryIds.length,
      durationMs: duration,
    });

  } catch (error) {
    console.error('Error syncing categories:', error);
    return NextResponse.json(
      { error: 'Failed to sync categories' },
      { status: 500 }
    );
  }
}





