import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const cleanedToken = token.trim();
  if (!cleanedToken) {
    return json({ error: "Missing text upload token" }, 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json({ error: "Log in or create an account to finish this listing." }, 401);
  }

  const admin = createServiceRoleClient();
  const { data: session, error } = await admin
    .from("marketplace_text_upload_sessions")
    .select("id, session_token, status, expires_at, claimed_user_id, form_data, uploaded_images")
    .eq("session_token", cleanedToken)
    .maybeSingle<{
      id: string;
      session_token: string;
      status: string;
      expires_at: string;
      claimed_user_id: string | null;
      form_data: Record<string, unknown>;
      uploaded_images: unknown[];
    }>();

  if (error) {
    console.error("[text-upload] session lookup failed:", error);
    return json({ error: "Could not load this text upload." }, 500);
  }

  if (!session) {
    return json({ error: "This text upload link was not found." }, 404);
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return json({ error: "This text upload link has expired." }, 410);
  }

  if (session.status !== "ready" && session.status !== "claimed") {
    return json({ error: "This text upload is not ready yet." }, 409);
  }

  if (session.claimed_user_id && session.claimed_user_id !== user.id) {
    return json({ error: "This text upload has already been claimed." }, 403);
  }

  if (!session.claimed_user_id) {
    const { error: claimError } = await admin
      .from("marketplace_text_upload_sessions")
      .update({
        claimed_user_id: user.id,
        claimed_at: new Date().toISOString(),
        status: "claimed",
      })
      .eq("id", session.id);

    if (claimError) {
      console.error("[text-upload] session claim failed:", claimError);
      return json({ error: "Could not claim this text upload." }, 500);
    }
  }

  return json({
    ok: true,
    formData: session.form_data,
    uploadedImages: session.uploaded_images || [],
  });
}
