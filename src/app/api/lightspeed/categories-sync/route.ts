import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/lightspeed/categories-sync
 * Fetches all categories from Lightspeed and user's sync preferences
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get Lightspeed connection
    const { data: connection } = await supabase
      .from('lightspeed_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'connected')
      .single();

    if (!connection) {
      return NextResponse.json({ error: 'Lightspeed not connected' }, { status: 400 });
    }

    // Fetch categories directly from Lightspeed
    const { createLightspeedClient } = await import('@/lib/services/lightspeed');
    const client = createLightspeedClient(user.id);
    
    const lightspeedCategories = await client.getCategories({ archived: 'false' });

    // Get user's sync preferences
    const { data: preferences } = await supabase
      .from('lightspeed_category_sync_preferences')
      .select('*')
      .eq('user_id', user.id);

    // Create a map of preferences for easy lookup
    const preferencesMap = new Map(
      (preferences || []).map(p => [p.category_id, p])
    );

    // Merge Lightspeed categories with user preferences
    const categoriesWithPreferences = lightspeedCategories.map((cat: any) => ({
      categoryId: cat.categoryID,
      name: cat.name,
      fullPath: cat.fullPathName || cat.name,
      isEnabled: preferencesMap.get(cat.categoryID)?.is_enabled ?? false,
      lastSyncedAt: preferencesMap.get(cat.categoryID)?.last_synced_at,
      productCount: preferencesMap.get(cat.categoryID)?.product_count ?? 0,
      hasPreference: preferencesMap.has(cat.categoryID),
    }));

    // Add special "No Category" option at the top
    const noCategoryOption = {
      categoryId: '__UNCATEGORIZED__',
      name: 'No Category',
      fullPath: 'Products without a category',
      isEnabled: preferencesMap.get('__UNCATEGORIZED__')?.is_enabled ?? false,
      lastSyncedAt: preferencesMap.get('__UNCATEGORIZED__')?.last_synced_at,
      productCount: preferencesMap.get('__UNCATEGORIZED__')?.product_count ?? 0,
      hasPreference: preferencesMap.has('__UNCATEGORIZED__'),
    };

    const allCategories = [noCategoryOption, ...categoriesWithPreferences];

    return NextResponse.json({
      categories: allCategories,
      totalCategories: allCategories.length,
      enabledCount: allCategories.filter(c => c.isEnabled).length,
    });

  } catch (error) {
    console.error('Error fetching category sync preferences:', error);
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/lightspeed/categories-sync
 * Updates user's category sync preferences
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
    const { categories } = body; // Array of { categoryId, name, fullPath, isEnabled }

    if (!Array.isArray(categories)) {
      return NextResponse.json({ error: 'Invalid request format' }, { status: 400 });
    }

    // Upsert preferences for each category
    const upsertPromises = categories.map(cat =>
      supabase
        .from('lightspeed_category_sync_preferences')
        .upsert({
          user_id: user.id,
          category_id: cat.categoryId,
          category_name: cat.name,
          category_path: cat.fullPath,
          is_enabled: cat.isEnabled,
        }, {
          onConflict: 'user_id,category_id',
        })
    );

    await Promise.all(upsertPromises);

    // Get updated preferences
    const { data: updatedPreferences } = await supabase
      .from('lightspeed_category_sync_preferences')
      .select('*')
      .eq('user_id', user.id);

    return NextResponse.json({
      success: true,
      message: 'Category preferences updated',
      preferences: updatedPreferences,
    });

  } catch (error) {
    console.error('Error updating category sync preferences:', error);
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}

