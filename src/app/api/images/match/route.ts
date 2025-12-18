/**
 * Image Matching API
 * POST /api/images/match - Find canonical product matches
 * PUT /api/images/match - Confirm/reject a match
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  findCanonicalProductMatch,
  confirmMatch,
  rejectMatchAndCreateNew,
} from '@/lib/services/image-matching';

/**
 * POST - Find canonical product match for a product
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json();
    const { productId } = body;

    if (!productId) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 });
    }

    // Get product details
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, upc, description, category_name, manufacturer_name, user_id')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Verify user owns the product
    if (product.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 403 });
    }

    // Find match
    const matchResult = await findCanonicalProductMatch({
      id: product.id,
      upc: product.upc,
      description: product.description,
      categoryName: product.category_name,
      manufacturerName: product.manufacturer_name,
    });

    return NextResponse.json({
      success: true,
      data: matchResult,
    });
  } catch (error) {
    console.error('Match search error:', error);
    const message = error instanceof Error ? error.message : 'Match search failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT - Confirm or reject a match
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json();
    const { queueItemId, action, canonicalProductId, newProductData } = body;

    if (!queueItemId || !action) {
      return NextResponse.json(
        { error: 'Queue item ID and action required' },
        { status: 400 }
      );
    }

    if (action === 'confirm') {
      if (!canonicalProductId) {
        return NextResponse.json(
          { error: 'Canonical product ID required for confirmation' },
          { status: 400 }
        );
      }

      await confirmMatch(queueItemId, canonicalProductId);

      return NextResponse.json({
        success: true,
        message: 'Match confirmed',
      });
    } else if (action === 'reject') {
      if (!newProductData) {
        return NextResponse.json(
          { error: 'New product data required for rejection' },
          { status: 400 }
        );
      }

      const canonicalId = await rejectMatchAndCreateNew(queueItemId, newProductData);

      return NextResponse.json({
        success: true,
        message: 'New canonical product created',
        canonicalProductId: canonicalId,
      });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Match action error:', error);
    const message = error instanceof Error ? error.message : 'Match action failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}















