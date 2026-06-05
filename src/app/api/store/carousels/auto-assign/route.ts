/**
 * Auto-assign uncategorised products to store carousels.
 *
 * GET  — preview proposed assignments (no mutations)
 * POST — apply an approved proposal
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireBicycleStore } from '@/lib/store/online-products-store-auth';
import {
  applyAutoAssignActions,
  buildAutoAssignProposal,
  fetchAutoAssignContext,
  type AutoAssignAction,
} from '@/lib/store/auto-assign-carousels';

export async function GET() {
  try {
    const auth = await requireBicycleStore();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { supabase, user } = auth;
    const { products, carousels } = await fetchAutoAssignContext(supabase, user.id);
    const proposal = buildAutoAssignProposal(products, carousels);

    return NextResponse.json({ proposal });
  } catch (error) {
    console.error('[auto-assign] GET failed:', error);
    return NextResponse.json({ error: 'Failed to build auto-assign preview' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireBicycleStore();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { supabase, user } = auth;
    const body = await request.json();
    const actions = (body.actions ?? []) as AutoAssignAction[];

    if (!Array.isArray(actions) || actions.length === 0) {
      return NextResponse.json({ error: 'No actions to apply' }, { status: 400 });
    }

    const { products, carousels } = await fetchAutoAssignContext(supabase, user.id);
    const validProductIds = new Set(products.map((p) => p.id));
    const validCarouselIds = new Set(carousels.map((c) => c.id));

    for (const action of actions) {
      if (action.type === 'create') {
        const ids = action.product_ids ?? [];
        if (ids.some((id) => !validProductIds.has(id))) {
          return NextResponse.json({ error: 'Invalid product in proposal' }, { status: 400 });
        }
      } else if (action.type === 'update') {
        if (!validCarouselIds.has(action.carousel_id)) {
          return NextResponse.json({ error: 'Invalid carousel in proposal' }, { status: 400 });
        }
        if (action.add_product_ids.some((id) => !validProductIds.has(id))) {
          return NextResponse.json({ error: 'Invalid product in proposal' }, { status: 400 });
        }
      }
    }

    const result = await applyAutoAssignActions(supabase, user.id, actions, carousels);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[auto-assign] POST failed:', error);
    return NextResponse.json({ error: 'Failed to apply auto-assign' }, { status: 500 });
  }
}
