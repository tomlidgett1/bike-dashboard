import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/store/instagram/posts/[id]
 * Hard-delete a scheduled single post (not part of a campaign).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    const admin = createServiceRoleClient();
    const { data: post, error: fetchError } = await admin
      .from("store_instagram_posts")
      .select("id, status, campaign_id")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Could not load post: ${fetchError.message}`);
    }
    if (!post) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }
    if (post.campaign_id) {
      return NextResponse.json(
        { error: "Campaign posts cannot be deleted here." },
        { status: 409 },
      );
    }
    if (post.status !== "scheduled") {
      return NextResponse.json(
        { error: "Only scheduled posts can be removed from the schedule." },
        { status: 409 },
      );
    }

    const { error: deleteError } = await admin
      .from("store_instagram_posts")
      .delete()
      .eq("id", id)
      .eq("user_id", auth.user.id);

    if (deleteError) {
      throw new Error(`Could not delete post: ${deleteError.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ig-posts] delete failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not delete scheduled post.",
      },
      { status: 500 },
    );
  }
}
