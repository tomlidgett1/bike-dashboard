// ============================================================
// Voucher Check API
// ============================================================
// GET: Returns user's voucher eligibility and active vouchers

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface VoucherInfo {
  id: string;
  voucher_type: string;
  amount_cents: number;
  min_purchase_cents: number;
  status: string;
  description: string;
  expires_at: string | null;
  created_at: string;
}

export interface VoucherCheckResponse {
  /** Whether the user is eligible for the first upload promo (has 0 listings) */
  eligibleForFirstUploadPromo: boolean;
  /** Number of active listings the user has */
  listingCount: number;
  /** User's active vouchers */
  activeVouchers: VoucherInfo[];
  /** Best applicable voucher for a given purchase amount (if provided) */
  applicableVoucher: VoucherInfo | null;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorised' },
        { status: 401 }
      );
    }

    // Get optional purchase amount from query params (for finding applicable voucher)
    const searchParams = request.nextUrl.searchParams;
    const purchaseAmountCents = parseInt(searchParams.get('amount_cents') || '0', 10);

    // Count user's active listings
    const { count: listingCount, error: listingError } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .or('listing_status.in.(active,published,sold),is_active.eq.true');

    if (listingError) {
      console.error('[Voucher Check] Error counting listings:', listingError);
    }

    const actualListingCount = listingCount || 0;

    // Fetch user's active vouchers
    const { data: vouchers, error: voucherError } = await supabase
      .from('vouchers')
      .select('id, voucher_type, amount_cents, min_purchase_cents, status, description, expires_at, created_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .or('expires_at.is.null,expires_at.gt.now()');

    if (voucherError) {
      console.error('[Voucher Check] Error fetching vouchers:', voucherError);
      return NextResponse.json(
        { error: 'Failed to fetch vouchers' },
        { status: 500 }
      );
    }

    const activeVouchers: VoucherInfo[] = vouchers || [];

    // Find best applicable voucher if purchase amount provided
    let applicableVoucher: VoucherInfo | null = null;
    if (purchaseAmountCents > 0) {
      const applicable = activeVouchers
        .filter(v => v.min_purchase_cents <= purchaseAmountCents)
        .sort((a, b) => b.amount_cents - a.amount_cents);
      
      applicableVoucher = applicable[0] || null;
    }

    const response: VoucherCheckResponse = {
      eligibleForFirstUploadPromo: actualListingCount === 0,
      listingCount: actualListingCount,
      activeVouchers,
      applicableVoucher,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('[Voucher Check] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

