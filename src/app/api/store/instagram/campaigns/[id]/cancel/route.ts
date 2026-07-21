import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import {
  getInstagramCampaign,
  updateInstagramCampaignStatus,
} from "@/lib/instagram/campaigns";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;
    const { id } = await params;
    const campaign = await getInstagramCampaign(auth.user.id, id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    if (["completed", "cancelled"].includes(campaign.status)) {
      return NextResponse.json(
        { error: "This campaign cannot be cancelled." },
        { status: 409 },
      );
    }

    const admin = createServiceRoleClient();

    // Building / ready campaigns: hard delete so they leave Schedule entirely.
    if (["generating", "ready", "failed"].includes(campaign.status)) {
      const { error: postsError } = await admin
        .from("store_instagram_posts")
        .delete()
        .eq("campaign_id", id)
        .eq("user_id", auth.user.id);
      if (postsError) {
        throw new Error(`Could not delete campaign posts: ${postsError.message}`);
      }

      const { error: campaignError } = await admin
        .from("store_instagram_campaigns")
        .delete()
        .eq("id", id)
        .eq("user_id", auth.user.id);
      if (campaignError) {
        throw new Error(`Could not delete campaign: ${campaignError.message}`);
      }

      return NextResponse.json({ success: true, deleted: true });
    }

    // Scheduled / posting: unschedule remaining posts and mark cancelled.
    const { error } = await admin
      .from("store_instagram_posts")
      .update({
        status: "draft",
        scheduled_at: null,
        error_message: null,
      })
      .eq("campaign_id", id)
      .eq("user_id", auth.user.id)
      .eq("status", "scheduled");
    if (error) throw new Error(`Could not cancel scheduled posts: ${error.message}`);

    await updateInstagramCampaignStatus({
      campaignId: id,
      ownerUserId: auth.user.id,
      status: "cancelled",
    });
    return NextResponse.json({ success: true, deleted: false });
  } catch (error) {
    console.error("[ig-campaign] cancel failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not cancel campaign.",
      },
      { status: 500 },
    );
  }
}
