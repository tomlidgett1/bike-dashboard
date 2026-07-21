import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import {
  campaignImagePrompt,
  getInstagramCampaign,
  updateInstagramCampaignStatus,
} from "@/lib/instagram/campaigns";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteParams = {
  params: Promise<{ id: string; dayIndex: string }>;
};

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;
    const { id, dayIndex: rawDayIndex } = await params;
    const dayIndex = Number(rawDayIndex);
    if (!Number.isInteger(dayIndex) || dayIndex < 1 || dayIndex > 10) {
      return NextResponse.json({ error: "Invalid campaign day." }, { status: 400 });
    }

    const campaign = await getInstagramCampaign(auth.user.id, id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    if (!["generating", "ready"].includes(campaign.status)) {
      return NextResponse.json(
        { error: "Scheduled or completed campaign days cannot be regenerated." },
        { status: 409 },
      );
    }
    const day = campaign.days.find((item) => item.dayIndex === dayIndex);
    if (!day) {
      return NextResponse.json({ error: "Campaign day not found." }, { status: 404 });
    }

    const imageModule = await import("@/lib/instagram/generate-image");
    const generateInstagramImageForStore =
      imageModule.generateInstagramImageForStore ??
      imageModule.default?.generateInstagramImageForStore;
    if (typeof generateInstagramImageForStore !== "function") {
      throw new Error(
        "Image generation service failed to load. Refresh and try again.",
      );
    }

    const result = await generateInstagramImageForStore({
      ownerUserId: auth.user.id,
      existingPostId: day.id,
      prompt: campaignImagePrompt({
        objective: campaign.objective,
        styleBible: campaign.styleBible,
        day,
      }),
      caption: day.caption,
      storeUsername: null,
      destination: "post",
      aspect: campaign.aspect,
      includeLogo: campaign.includeLogo,
      productId: campaign.productId,
      autoCaption: false,
    });

    const admin = createServiceRoleClient();
    const { count } = await admin
      .from("store_instagram_posts")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .is("image_url", null);
    if ((count || 0) === 0) {
      await updateInstagramCampaignStatus({
        campaignId: id,
        ownerUserId: auth.user.id,
        status: "ready",
      });
    }

    const updated = await getInstagramCampaign(auth.user.id, id);
    return NextResponse.json({
      success: true,
      campaign: updated,
      day: updated?.days.find((item) => item.dayIndex === dayIndex),
      image: result,
    });
  } catch (error) {
    console.error("[ig-campaign-day] generate failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not generate campaign day.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;
    const { id, dayIndex: rawDayIndex } = await params;
    const dayIndex = Number(rawDayIndex);
    const body = await request.json().catch(() => ({}));
    const caption = typeof body.caption === "string" ? body.caption.trim() : "";
    if (!Number.isInteger(dayIndex) || dayIndex < 1 || dayIndex > 10) {
      return NextResponse.json({ error: "Invalid campaign day." }, { status: 400 });
    }
    if (!caption) {
      return NextResponse.json({ error: "Caption is required." }, { status: 400 });
    }

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("store_instagram_posts")
      .update({ caption })
      .eq("campaign_id", id)
      .eq("day_index", dayIndex)
      .eq("user_id", auth.user.id)
      .in("status", ["draft", "scheduled"])
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Could not save caption: ${error.message}`);
    if (!data) {
      return NextResponse.json(
        { error: "Campaign day not found or cannot be edited." },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ig-campaign-day] update failed:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not save caption.",
      },
      { status: 500 },
    );
  }
}
