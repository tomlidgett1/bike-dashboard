import { NextRequest, NextResponse } from "next/server";
import { fetchLinqAttachmentDownloadUrl } from "@/lib/nest/linq-attachments";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function requireStoreUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("account_type, bicycle_store")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.account_type !== "bicycle_store" || profile?.bicycle_store !== true) {
    return null;
  }

  return user;
}

/**
 * Lazy-load LINQ attachment bytes via a fresh signed URL (see LINQ attachments guide).
 * GET /api/store/linq-attachment?id={attachmentId}
 */
export async function GET(request: NextRequest) {
  const user = await requireStoreUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const attachmentId = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!attachmentId) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  try {
    const downloadUrl = await fetchLinqAttachmentDownloadUrl(attachmentId);
    if (!downloadUrl) {
      return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    }

    return NextResponse.redirect(downloadUrl, {
      status: 302,
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    console.error("[linq-attachment] resolve failed:", error);
    return NextResponse.json({ error: "Could not load attachment." }, { status: 502 });
  }
}
