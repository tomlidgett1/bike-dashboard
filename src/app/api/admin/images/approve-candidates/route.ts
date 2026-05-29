/**
 * Image Workbench Candidate Approval API
 * Saves operator-selected Serper candidates as approved canonical product images.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface CandidateImage {
  url: string;
  thumbnailUrl?: string;
  title?: string;
  source?: string;
  domain?: string;
  width?: number;
  height?: number;
}

function scheduleCloudinaryUpload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  supabaseUrl: string,
  accessToken: string,
  imageId: string,
  candidate: CandidateImage,
  canonicalProductId: string,
  index: number,
) {
  void fetch(`${supabaseUrl}/functions/v1/upload-to-cloudinary`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageUrl: candidate.url,
      listingId: `canonical-${canonicalProductId}`,
      index,
    }),
  })
    .then(async (uploadResponse) => {
      const uploadResult = await uploadResponse.json();
      if (!uploadResponse.ok || !uploadResult.success) return;
      const uploaded = uploadResult.data;
      await supabase
        .from('product_images')
        .update({
          cloudinary_url: uploaded.url,
          cloudinary_public_id: uploaded.publicId,
          width: uploaded.width || candidate.width || null,
          height: uploaded.height || candidate.height || null,
          is_downloaded: true,
        })
        .eq('id', imageId);
    })
    .catch(() => undefined);
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

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      return NextResponse.json({ error: 'No active session' }, { status: 401 });
    }

    const body = await request.json();
    const canonicalProductId = body.canonicalProductId as string | undefined;
    const selectedCandidates = (body.selectedCandidates || []) as CandidateImage[];
    const approvedImageIds = (body.approvedImageIds || []) as string[];
    const primaryCandidateUrl = body.primaryCandidateUrl as string | undefined;
    const primaryImageId = body.primaryImageId as string | undefined;
    const searchQuery = body.searchQuery as string | undefined;
    const rejectPending = body.rejectPending !== false;
    const quickMode = body.quickMode === true;

    if (!canonicalProductId) {
      return NextResponse.json({ error: 'canonicalProductId is required' }, { status: 400 });
    }

    if (selectedCandidates.length === 0 && approvedImageIds.length === 0 && !primaryImageId) {
      return NextResponse.json({ error: 'Select at least one image to approve' }, { status: 400 });
    }

    const { data: canonical, error: canonicalError } = await supabase
      .from('canonical_products')
      .select('id')
      .eq('id', canonicalProductId)
      .single();

    if (canonicalError || !canonical) {
      return NextResponse.json({ error: 'Canonical product not found' }, { status: 404 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      return NextResponse.json({ error: 'Supabase URL not configured' }, { status: 500 });
    }

    const savedImageIds: string[] = [];
    const uploadFailures: Array<{ url: string; error: string }> = [];

    if (quickMode && selectedCandidates.length > 0) {
      if (!primaryCandidateUrl) {
        return NextResponse.json({ error: 'primaryCandidateUrl is required' }, { status: 400 });
      }

      await supabase
        .from('product_images')
        .update({ is_primary: false })
        .eq('canonical_product_id', canonicalProductId);

      const quickSavedIds: string[] = [];
      const savedIdByUrl = new Map<string, string>();

      for (let index = 0; index < selectedCandidates.length; index++) {
        const candidate = selectedCandidates[index];
        if (!candidate?.url) continue;

        const { data: inserted, error: insertError } = await supabase
          .from('product_images')
          .insert({
            canonical_product_id: canonicalProductId,
            external_url: candidate.url,
            width: candidate.width || null,
            height: candidate.height || null,
            is_downloaded: false,
            approval_status: 'approved',
            is_primary: candidate.url === primaryCandidateUrl,
            sort_order: index,
            source: 'serper_workbench',
            uploaded_by: user.id,
          })
          .select('id')
          .single();

        if (insertError || !inserted) {
          uploadFailures.push({ url: candidate.url, error: insertError?.message || 'Failed to save image' });
          continue;
        }

        quickSavedIds.push(inserted.id);
        savedIdByUrl.set(candidate.url, inserted.id);
        scheduleCloudinaryUpload(
          supabase,
          supabaseUrl,
          accessToken,
          inserted.id,
          candidate,
          canonicalProductId,
          index,
        );
      }

      const finalPrimaryId = savedIdByUrl.get(primaryCandidateUrl) || quickSavedIds[0];

      if (!finalPrimaryId) {
        const detail = uploadFailures[0]?.error;
        return NextResponse.json(
          {
            error: detail ? `No images could be saved: ${detail}` : 'No images could be saved',
            uploadFailures,
          },
          { status: 400 },
        );
      }

      await supabase
        .from('product_images')
        .update({ is_primary: false })
        .eq('canonical_product_id', canonicalProductId);

      await supabase
        .from('product_images')
        .update({ is_primary: true, approval_status: 'approved' })
        .eq('id', finalPrimaryId)
        .eq('canonical_product_id', canonicalProductId);

      if (rejectPending && quickSavedIds.length > 0) {
        await supabase
          .from('product_images')
          .update({ approval_status: 'rejected' })
          .eq('canonical_product_id', canonicalProductId)
          .eq('approval_status', 'pending')
          .not('id', 'in', `(${quickSavedIds.join(',')})`);
      }

      await supabase
        .from('canonical_products')
        .update({
          image_review_status: 'ready',
          image_reviewed_at: new Date().toISOString(),
          image_reviewed_by: user.id,
          image_review_source: 'serper_workbench',
          image_review_search_query: searchQuery || null,
          image_review_error: uploadFailures[0]?.error || null,
        })
        .eq('id', canonicalProductId);

      await supabase
        .from('products')
        .update({
          image_review_status: 'ready',
          image_reviewed_at: new Date().toISOString(),
          image_reviewed_by: user.id,
          image_review_source: 'canonical',
        })
        .eq('canonical_product_id', canonicalProductId);

      return NextResponse.json({
        success: true,
        quickMode: true,
        primaryImageId: finalPrimaryId,
        savedImageIds: quickSavedIds,
        uploadFailures,
      });
    }

    for (let index = 0; index < selectedCandidates.length; index++) {
      const candidate = selectedCandidates[index];
      if (!candidate.url) continue;

      try {
        const uploadResponse = await fetch(`${supabaseUrl}/functions/v1/upload-to-cloudinary`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageUrl: candidate.url,
            listingId: `canonical-${canonicalProductId}`,
            index,
          }),
        });

        const uploadResult = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadResult.success) {
          uploadFailures.push({ url: candidate.url, error: uploadResult.error || 'Cloudinary upload failed' });
          continue;
        }

        const uploaded = uploadResult.data;
        const { data: inserted, error: insertError } = await supabase
          .from('product_images')
          .insert({
            canonical_product_id: canonicalProductId,
            external_url: candidate.url,
            cloudinary_url: uploaded.url,
            cloudinary_public_id: uploaded.publicId,
            width: uploaded.width || candidate.width || null,
            height: uploaded.height || candidate.height || null,
            is_downloaded: true,
            approval_status: 'approved',
            is_primary: candidate.url === primaryCandidateUrl,
            sort_order: index,
            source: 'serper_workbench',
            uploaded_by: user.id,
          })
          .select('id')
          .single();

        if (insertError) {
          uploadFailures.push({ url: candidate.url, error: insertError.message });
          continue;
        }

        savedImageIds.push(inserted.id);
      } catch (error) {
        uploadFailures.push({ url: candidate.url, error: error instanceof Error ? error.message : 'Upload failed' });
      }
    }

    if (approvedImageIds.length > 0) {
      const { error: approveExistingError } = await supabase
        .from('product_images')
        .update({ approval_status: 'approved' })
        .eq('canonical_product_id', canonicalProductId)
        .in('id', approvedImageIds);

      if (approveExistingError) {
        return NextResponse.json({ error: approveExistingError.message }, { status: 500 });
      }
    }

    const finalPrimaryId = primaryImageId || savedImageIds.find((id, index) => selectedCandidates[index]?.url === primaryCandidateUrl) || approvedImageIds[0] || savedImageIds[0];

    if (!finalPrimaryId) {
      await supabase
        .from('canonical_products')
        .update({
          image_review_status: uploadFailures.length > 0 ? 'failed' : 'pending',
          image_review_error: uploadFailures[0]?.error || 'No primary image selected',
        })
        .eq('id', canonicalProductId);

      return NextResponse.json({ error: 'No primary image could be selected', uploadFailures }, { status: 400 });
    }

    await supabase
      .from('product_images')
      .update({ is_primary: false })
      .eq('canonical_product_id', canonicalProductId);

    const { error: primaryError } = await supabase
      .from('product_images')
      .update({ is_primary: true, approval_status: 'approved' })
      .eq('id', finalPrimaryId)
      .eq('canonical_product_id', canonicalProductId);

    if (primaryError) {
      return NextResponse.json({ error: primaryError.message }, { status: 500 });
    }

    if (rejectPending) {
      const allApprovedIds = [...approvedImageIds, ...savedImageIds, finalPrimaryId];
      if (allApprovedIds.length > 0) {
        await supabase
          .from('product_images')
          .update({ approval_status: 'rejected' })
          .eq('canonical_product_id', canonicalProductId)
          .eq('approval_status', 'pending')
          .not('id', 'in', `(${allApprovedIds.join(',')})`);
      }
    }

    await supabase
      .from('canonical_products')
      .update({
        image_review_status: 'ready',
        image_reviewed_at: new Date().toISOString(),
        image_reviewed_by: user.id,
        image_review_source: 'serper_workbench',
        image_review_search_query: searchQuery || null,
        image_review_error: uploadFailures[0]?.error || null,
      })
      .eq('id', canonicalProductId);

    await supabase
      .from('products')
      .update({
        image_review_status: 'ready',
        image_reviewed_at: new Date().toISOString(),
        image_reviewed_by: user.id,
        image_review_source: 'canonical',
      })
      .eq('canonical_product_id', canonicalProductId);

    return NextResponse.json({
      success: true,
      primaryImageId: finalPrimaryId,
      savedImageIds,
      uploadFailures,
    });
  } catch (error) {
    console.error('[IMAGE WORKBENCH] Approval error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to approve candidates' },
      { status: 500 }
    );
  }
}
