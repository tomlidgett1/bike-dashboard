import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nanoid } from "nanoid";

// ============================================================
// Create Mobile Upload Session
// POST /api/mobile-upload/create-session
// Creates a new session for QR code mobile uploads
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication - desktop user must be logged in
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized - Please log in to create an upload session" },
        { status: 401 }
      );
    }

    // Generate a short, URL-safe session token
    const sessionToken = nanoid(16);

    // Calculate expiry (15 minutes from now)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Create the session
    const { data, error } = await supabase
      .from("mobile_upload_sessions")
      .insert({
        session_token: sessionToken,
        user_id: user.id,
        images: [],
        status: "pending",
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) {
      console.error("[Mobile Upload] Error creating session:", error);
      return NextResponse.json(
        { error: "Failed to create upload session" },
        { status: 500 }
      );
    }

    console.log(`[Mobile Upload] Created session ${sessionToken} for user ${user.id}`);

    return NextResponse.json({
      success: true,
      data: {
        sessionId: data.id,
        sessionToken: data.session_token,
        expiresAt: data.expires_at,
      },
    });
  } catch (error) {
    console.error("[Mobile Upload] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}





