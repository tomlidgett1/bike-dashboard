/**
 * Upload a user-provided image for the CRM email agent.
 *
 * The returned URL is added to the agent's verified image allow-list for the
 * turn, so generated emails can safely use it in <img> tags.
 */

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

const MAX_BYTES = 10 * 1024 * 1024;
const VALID_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif"]);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("account_type, bicycle_store")
      .eq("user_id", user.id)
      .single();

    if (!profile || profile.account_type !== "bicycle_store" || !profile.bicycle_store) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!VALID_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Use JPEG, PNG, WebP or AVIF." },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image must be less than 10MB" }, { status: 400 });
    }

    const input = Buffer.from(await file.arrayBuffer());
    const image = sharp(input).rotate();
    const metadata = await image.metadata();
    const output = await image
      .resize({
        width: 1600,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 84, effort: 4 })
      .toBuffer();
    const outputMetadata = await sharp(output).metadata();

    const safeName =
      file.name
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-z0-9_-]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "image";
    const path = `crm-email-images/${user.id}/${Date.now()}-${safeName}.webp`;

    const adminStorage = createServiceRoleClient().storage;
    const { error: uploadError } = await adminStorage.from("listing-images").upload(path, output, {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: false,
    });

    if (uploadError) {
      console.error("[crm] image upload failed:", uploadError);
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: urlData } = adminStorage.from("listing-images").getPublicUrl(path);

    return NextResponse.json({
      image: {
        id: crypto.randomUUID(),
        url: urlData.publicUrl,
        name: file.name || `${safeName}.webp`,
        width: outputMetadata.width ?? metadata.width ?? null,
        height: outputMetadata.height ?? metadata.height ?? null,
      },
    });
  } catch (error) {
    console.error("[crm] image upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
