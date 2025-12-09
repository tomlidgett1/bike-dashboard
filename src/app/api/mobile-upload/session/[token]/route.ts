import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ============================================================
// Mobile Upload Session Operations
// GET /api/mobile-upload/session/[token] - Get session status
// PATCH /api/mobile-upload/session/[token] - Update session status
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = await createClient();

    // Fetch session by token (no auth required for mobile access)
    const { data: session, error } = await supabase
      .from("mobile_upload_sessions")
      .select("*")
      .eq("session_token", token)
      .single();

    if (error || !session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Check if session has expired
    if (new Date(session.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Session has expired", expired: true },
        { status: 410 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        sessionToken: session.session_token,
        images: session.images || [],
        status: session.status,
        expiresAt: session.expires_at,
        createdAt: session.created_at,
      },
    });
  } catch (error) {
    console.error("[Mobile Upload] Error fetching session:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = await createClient();
    const body = await request.json();

    // Validate status
    const validStatuses = ["pending", "uploading", "complete", "expired"];
    if (body.status && !validStatuses.includes(body.status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    // Check session exists and hasn't expired
    const { data: existing, error: fetchError } = await supabase
      .from("mobile_upload_sessions")
      .select("expires_at")
      .eq("session_token", token)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (new Date(existing.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Session has expired" },
        { status: 410 }
      );
    }

    // Update the session
    const { data: session, error } = await supabase
      .from("mobile_upload_sessions")
      .update({ status: body.status })
      .eq("session_token", token)
      .select()
      .single();

    if (error) {
      console.error("[Mobile Upload] Error updating session:", error);
      return NextResponse.json(
        { error: "Failed to update session" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        status: session.status,
      },
    });
  } catch (error) {
    console.error("[Mobile Upload] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}






