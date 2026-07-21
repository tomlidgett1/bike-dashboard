import { NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import { listInstagramPosts } from "@/lib/instagram/publish";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const posts = await listInstagramPosts(auth.user.id, 30);
    return NextResponse.json(
      { success: true, posts },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[ig-posts] failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load Instagram posts.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
