import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ============================================================
// Mobile Upload - Upload Image to Session
// POST /api/mobile-upload/session/[token]/upload
// No authentication required - uses session token for access
// ============================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = await createClient();

    // Fetch session by token
    const { data: session, error: sessionError } = await supabase
      .from("mobile_upload_sessions")
      .select("*")
      .eq("session_token", token)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Check if session has expired
    if (new Date(session.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Session has expired. Please generate a new QR code." },
        { status: 410 }
      );
    }

    // Parse the form data
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (!validTypes.includes(file.type.toLowerCase())) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, WebP, and HEIC are supported." },
        { status: 400 }
      );
    }

    // Validate file size (15MB max for mobile photos)
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size exceeds 15MB limit" },
        { status: 400 }
      );
    }

    // Generate storage path: mobile-uploads/{token}/{timestamp}-{random}.jpg
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const extension = file.type.includes("png") ? "png" : file.type.includes("webp") ? "webp" : "jpg";
    const storagePath = `mobile-uploads/${token}/${timestamp}-${randomSuffix}.${extension}`;

    // Update session status to uploading
    await supabase
      .from("mobile_upload_sessions")
      .update({ status: "uploading" })
      .eq("session_token", token);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(storagePath, file, {
        cacheControl: "31536000", // 1 year cache
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[Mobile Upload] Storage error:", uploadError);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(uploadData.path);

    // Update session with new image (append to images array)
    const newImage = {
      id: `mobile-${timestamp}-${randomSuffix}`,
      url: urlData.publicUrl,
      storagePath: uploadData.path,
      uploadedAt: new Date().toISOString(),
    };

    const currentImages = session.images || [];
    const updatedImages = [...currentImages, newImage];

    const { error: updateError } = await supabase
      .from("mobile_upload_sessions")
      .update({ 
        images: updatedImages,
        status: "pending", // Back to pending after upload
      })
      .eq("session_token", token);

    if (updateError) {
      console.error("[Mobile Upload] Error updating session images:", updateError);
      // Image was uploaded successfully, just couldn't update session
      // Don't return error, return success with warning
    }

    console.log(`[Mobile Upload] Image uploaded to session ${token}: ${urlData.publicUrl}`);

    return NextResponse.json({
      success: true,
      data: {
        id: newImage.id,
        url: urlData.publicUrl,
        storagePath: uploadData.path,
        totalImages: updatedImages.length,
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

