import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import {
  getInstagramCampaign,
  updateInstagramCampaignStatus,
} from "@/lib/instagram/campaigns";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const captions = Array.isArray(body.captions)
      ? (body.captions as unknown[])
          .filter(
            (item): item is { dayIndex: number; caption: string } =>
              Boolean(
                item &&
                  typeof item === "object" &&
                  Number.isInteger((item as { dayIndex?: unknown }).dayIndex) &&
                  typeof (item as { caption?: unknown }).caption === "string",
              ),
          )
          .map((item) => ({
            dayIndex: item.dayIndex,
            caption: item.caption.trim(),
          }))
      : [];

    const campaign = await getInstagramCampaign(auth.user.id, id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    if (!["generating", "ready"].includes(campaign.status)) {
      return NextResponse.json(
        { error: "This campaign cannot be scheduled again." },
        { status: 409 },
      );
    }
    if (campaign.days.length !== campaign.durationDays) {
      return NextResponse.json(
        { error: "The campaign plan is incomplete." },
        { status: 409 },
      );
    }
    if (campaign.days.some((day) => !day.imageUrl)) {
      return NextResponse.json(
        { error: "Generate every campaign image before scheduling." },
        { status: 409 },
      );
    }
    if (new Date(campaign.startAt).getTime() <= Date.now()) {
      return NextResponse.json(
        {
          error:
            "The campaign start time has passed. Start over and choose a future time.",
        },
        { status: 409 },
      );
    }

    const admin = createServiceRoleClient();
    for (const day of campaign.days) {
      const caption =
        captions.find((item) => item.dayIndex === day.dayIndex)?.caption ||
        day.caption.trim();
      if (!caption) {
        return NextResponse.json(
          { error: `Add a caption for day ${day.dayIndex}.` },
          { status: 400 },
        );
      }
      const scheduledAt = new Date(
        new Date(campaign.startAt).getTime() +
          (day.dayIndex - 1) * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { error } = await admin
        .from("store_instagram_posts")
        .update({
          caption,
          scheduled_at: scheduledAt,
          status: "scheduled",
          error_message: null,
        })
        .eq("id", day.id)
        .eq("user_id", auth.user.id)
        .eq("status", "draft");
      if (error) {
        throw new Error(`Could not schedule day ${day.dayIndex}: ${error.message}`);
      }
    }

    await updateInstagramCampaignStatus({
      campaignId: id,
      ownerUserId: auth.user.id,
      status: "scheduled",
    });
    const updated = await getInstagramCampaign(auth.user.id, id);
    return NextResponse.json({ success: true, campaign: updated });
  } catch (error) {
    console.error("[ig-campaign] schedule failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not schedule campaign.",
      },
      { status: 500 },
    );
  }
}
