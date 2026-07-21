import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import {
  createInstagramCampaign,
  listInstagramCampaigns,
} from "@/lib/instagram/campaigns";
import { isInstagramPostAspect } from "@/lib/instagram/formats";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;
    const campaigns = await listInstagramCampaigns(auth.user.id);
    return NextResponse.json(
      { success: true, campaigns },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[ig-campaigns] list failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load campaigns.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const body = await request.json().catch(() => ({}));
    const objective =
      typeof body.objective === "string" ? body.objective.trim() : "";
    const durationDays = body.durationDays === 10 ? 10 : 5;
    const aspect = isInstagramPostAspect(body.aspect) ? body.aspect : "square";
    const includeLogo = body.includeLogo === true;
    const productId =
      typeof body.productId === "string" && body.productId.trim()
        ? body.productId.trim()
        : null;
    const storeUsername =
      typeof body.storeUsername === "string" ? body.storeUsername.trim() : "";
    const startAt =
      typeof body.startAt === "string" ? new Date(body.startAt) : new Date("");

    if (!objective) {
      return NextResponse.json(
        { error: "Describe the campaign objective." },
        { status: 400 },
      );
    }
    if (objective.length > 1200) {
      return NextResponse.json(
        { error: "Campaign objective is too long." },
        { status: 400 },
      );
    }
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json(
        { error: "Choose a valid campaign start date and time." },
        { status: 400 },
      );
    }
    if (startAt.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "Campaign start must be in the future." },
        { status: 400 },
      );
    }

    const admin = createServiceRoleClient();
    const staleBefore = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await admin
      .from("store_instagram_campaigns")
      .update({
        status: "failed",
        last_error: "Generation did not complete. You can build a new campaign.",
      })
      .eq("user_id", auth.user.id)
      .eq("status", "generating")
      .lt("updated_at", staleBefore);

    const { count } = await admin
      .from("store_instagram_campaigns")
      .select("id", { count: "exact", head: true })
      .eq("user_id", auth.user.id)
      .eq("status", "generating");
    if ((count || 0) > 0) {
      return NextResponse.json(
        {
          error:
            "A campaign is already being generated. Finish or cancel it first.",
        },
        { status: 409 },
      );
    }

    let productName: string | null = null;
    let productImageUrl: string | null = null;
    let productFacts: string | null = null;
    if (productId) {
      const {
        formatInstagramProductFacts,
        resolveInstagramCatalogueProduct,
      } = await import("@/lib/instagram/catalogue");
      const product = await resolveInstagramCatalogueProduct({
        ownerUserId: auth.user.id,
        productId,
      });
      productName = product.name;
      productImageUrl = product.imageUrl;
      productFacts = formatInstagramProductFacts(product);
    }

    const campaign = await createInstagramCampaign({
      ownerUserId: auth.user.id,
      objective,
      durationDays,
      aspect,
      includeLogo,
      startAt: startAt.toISOString(),
      storeName: auth.profile.business_name,
      storeUsername,
      productId,
      productName,
      productImageUrl,
      productFacts,
    });

    return NextResponse.json({ success: true, campaign });
  } catch (error) {
    console.error("[ig-campaigns] create failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not build campaign.",
      },
      { status: 500 },
    );
  }
}
