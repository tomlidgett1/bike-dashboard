/**
 * Lightspeed Category Management API
 *
 * GET    /api/lightspeed/categories/manage — list categories with product counts
 * POST   /api/lightspeed/categories/manage — create category
 * PUT    /api/lightspeed/categories/manage — update category
 * DELETE /api/lightspeed/categories/manage — delete category
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createLightspeedClient } from '@/lib/services/lightspeed';
import type { LightspeedCategory } from '@/lib/services/lightspeed';

async function requireLightspeedStore(): Promise<
  | { error: NextResponse }
  | { supabase: Awaited<ReturnType<typeof createClient>>; user: { id: string } }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorised. Please log in first.' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('account_type, bicycle_store')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
    return {
      error: NextResponse.json(
        { error: 'Access denied. Only verified bicycle stores can manage categories.' },
        { status: 403 }
      ),
    };
  }

  const { data: connection } = await supabase
    .from('lightspeed_connections')
    .select('status')
    .eq('user_id', user.id)
    .eq('status', 'connected')
    .single();

  if (!connection) {
    return {
      error: NextResponse.json(
        { error: 'No active Lightspeed connection found. Please connect your Lightspeed account first.' },
        { status: 400 }
      ),
    };
  }

  return { supabase, user };
}

async function getProductCountsByCategory(userId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  const counts = new Map<string, number>();
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from('products_all_ls')
      .select('category_id')
      .eq('user_id', userId)
      .range(from, to);

    if (error) {
      console.error('[categories/manage] products_all_ls error:', error);
      break;
    }

    if (data && data.length > 0) {
      for (const row of data) {
        const catId = row.category_id ? String(row.category_id) : 'uncategorised';
        counts.set(catId, (counts.get(catId) ?? 0) + 1);
      }
      page++;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  return counts;
}

function buildFullPathName(
  name: string,
  parentId: string | undefined,
  categoriesById: Map<string, LightspeedCategory>
): string {
  const trimmedName = name.trim();
  if (!parentId || parentId === '0') {
    return trimmedName;
  }

  const parent = categoriesById.get(parentId);
  if (!parent?.fullPathName) {
    return trimmedName;
  }

  return `${parent.fullPathName}/${trimmedName}`;
}

export async function GET() {
  try {
    const auth = await requireLightspeedStore();
    if ('error' in auth) return auth.error;

    const { user, supabase } = auth;
    const client = createLightspeedClient(user.id);
    const [categories, productCounts] = await Promise.all([
      client.getAllCategories({ archived: 'false' }),
      getProductCountsByCategory(user.id, supabase),
    ]);

    const sorted = [...categories].sort((a, b) => {
      const pathCompare = (a.fullPathName || a.name).localeCompare(b.fullPathName || b.name);
      if (pathCompare !== 0) return pathCompare;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      success: true,
      categories: sorted.map((category) => ({
        categoryID: category.categoryID,
        name: category.name,
        fullPathName: category.fullPathName,
        nodeDepth: category.nodeDepth,
        parentID: category.parentID ?? '0',
        productCount: productCounts.get(String(category.categoryID)) ?? 0,
        createTime: category.createTime,
        timeStamp: category.timeStamp,
      })),
      uncategorisedProductCount: productCounts.get('uncategorised') ?? 0,
    });
  } catch (error) {
    console.error('[categories/manage GET] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load categories' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireLightspeedStore();
    if ('error' in auth) return auth.error;

    const { user } = auth;
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const parentID = body.parentID != null ? String(body.parentID) : '0';

    if (!name) {
      return NextResponse.json({ error: 'Category name is required.' }, { status: 400 });
    }

    const client = createLightspeedClient(user.id);
    const existing = await client.getAllCategories({ archived: 'false' });
    const byId = new Map(existing.map((cat) => [String(cat.categoryID), cat]));
    const fullPathName =
      typeof body.fullPathName === 'string' && body.fullPathName.trim()
        ? body.fullPathName.trim()
        : buildFullPathName(name, parentID, byId);

    const category = await client.createCategory({ name, fullPathName, parentID });

    return NextResponse.json({
      success: true,
      category: {
        categoryID: category.categoryID,
        name: category.name,
        fullPathName: category.fullPathName,
        nodeDepth: category.nodeDepth,
        parentID: category.parentID ?? '0',
        productCount: 0,
      },
    });
  } catch (error) {
    console.error('[categories/manage POST] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create category' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireLightspeedStore();
    if ('error' in auth) return auth.error;

    const { user, supabase } = auth;
    const body = await request.json();
    const categoryID = body.categoryID != null ? String(body.categoryID) : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (!categoryID) {
      return NextResponse.json({ error: 'categoryID is required.' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: 'Category name is required.' }, { status: 400 });
    }

    const client = createLightspeedClient(user.id);
    const existing = await client.getAllCategories({ archived: 'false' });
    const current = existing.find((cat) => String(cat.categoryID) === categoryID);

    if (!current) {
      return NextResponse.json({ error: 'Category not found in Lightspeed.' }, { status: 404 });
    }

    const parentID = body.parentID != null ? String(body.parentID) : current.parentID ?? '0';
    const byId = new Map(existing.map((cat) => [String(cat.categoryID), cat]));
    const fullPathName =
      typeof body.fullPathName === 'string' && body.fullPathName.trim()
        ? body.fullPathName.trim()
        : buildFullPathName(name, parentID, byId);

    const category = await client.updateCategory(categoryID, { name, fullPathName, parentID });

    const productCounts = await getProductCountsByCategory(user.id, supabase);

    return NextResponse.json({
      success: true,
      category: {
        categoryID: category.categoryID,
        name: category.name,
        fullPathName: category.fullPathName,
        nodeDepth: category.nodeDepth,
        parentID: category.parentID ?? '0',
        productCount: productCounts.get(String(category.categoryID)) ?? 0,
      },
    });
  } catch (error) {
    console.error('[categories/manage PUT] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update category' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireLightspeedStore();
    if ('error' in auth) return auth.error;

    const { user } = auth;
    const body = await request.json();
    const categoryID = body.categoryID != null ? String(body.categoryID) : '';

    if (!categoryID) {
      return NextResponse.json({ error: 'categoryID is required.' }, { status: 400 });
    }

    const client = createLightspeedClient(user.id);
    const category = await client.deleteCategory(categoryID);

    return NextResponse.json({
      success: true,
      category: {
        categoryID: category.categoryID,
        name: category.name,
      },
    });
  } catch (error) {
    console.error('[categories/manage DELETE] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete category' },
      { status: 500 }
    );
  }
}
