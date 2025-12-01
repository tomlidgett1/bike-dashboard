/**
 * Admin Image Approval API
 * POST /api/admin/images/approve - Approve/reject images with max 5 validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface ApprovalRequest {
  canonicalProductId: string;
  approveImageIds: string[]; // Images to approve
  rejectPendingImages?: boolean; // Reject all other pending images
}

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

    const body: ApprovalRequest = await request.json();
    const { canonicalProductId, approveImageIds, rejectPendingImages = true } = body;

    if (!canonicalProductId || !approveImageIds || !Array.isArray(approveImageIds)) {
      return NextResponse.json(
        { error: 'Invalid request: canonicalProductId and approveImageIds array required' },
        { status: 400 }
      );
    }

    console.log(`[ADMIN APPROVE] User ${user.id} approving ${approveImageIds.length} images for product ${canonicalProductId}`);

    // Verify product exists
    const { data: product, error: productError } = await supabase
      .from('canonical_products')
      .select('id')
      .eq('id', canonicalProductId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Get current approved images count
    const { data: currentApproved, error: countError } = await supabase
      .from('product_images')
      .select('id')
      .eq('canonical_product_id', canonicalProductId)
      .eq('approval_status', 'approved');

    if (countError) {
      return NextResponse.json({ error: 'Failed to check current images' }, { status: 500 });
    }

    const currentApprovedCount = currentApproved?.length || 0;
    const totalAfterApproval = currentApprovedCount + approveImageIds.length;

    // Enforce max 5 images
    if (totalAfterApproval > 5) {
      return NextResponse.json(
        { 
          error: `Cannot approve ${approveImageIds.length} images. Product already has ${currentApprovedCount} approved images. Maximum is 5 total.`,
          currentApprovedCount,
          requestedApprovalCount: approveImageIds.length,
          maxAllowed: 5,
        },
        { status: 400 }
      );
    }

    // Approve selected images
    if (approveImageIds.length > 0) {
      const { error: approveError } = await supabase
        .from('product_images')
        .update({ approval_status: 'approved' })
        .in('id', approveImageIds)
        .eq('canonical_product_id', canonicalProductId);

      if (approveError) {
        console.error('[ADMIN APPROVE] Approval error:', approveError);
        return NextResponse.json({ error: 'Failed to approve images' }, { status: 500 });
      }

      console.log(`[ADMIN APPROVE] Approved ${approveImageIds.length} images`);
    }

    // Reject other pending images if requested
    if (rejectPendingImages) {
      const { error: rejectError } = await supabase
        .from('product_images')
        .update({ approval_status: 'rejected' })
        .eq('canonical_product_id', canonicalProductId)
        .eq('approval_status', 'pending')
        .not('id', 'in', `(${approveImageIds.join(',')})`);

      if (rejectError) {
        console.error('[ADMIN APPROVE] Reject error:', rejectError);
        // Don't fail the request, just log
      } else {
        console.log(`[ADMIN APPROVE] Rejected remaining pending images`);
      }
    }

    // Get updated counts
    const { data: updatedImages } = await supabase
      .from('product_images')
      .select('approval_status')
      .eq('canonical_product_id', canonicalProductId);

    const counts = {
      approved: updatedImages?.filter(img => img.approval_status === 'approved').length || 0,
      pending: updatedImages?.filter(img => img.approval_status === 'pending').length || 0,
      rejected: updatedImages?.filter(img => img.approval_status === 'rejected').length || 0,
    };

    return NextResponse.json({
      success: true,
      message: `Approved ${approveImageIds.length} images`,
      counts,
    });
  } catch (error) {
    console.error('[ADMIN APPROVE] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to approve images';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

