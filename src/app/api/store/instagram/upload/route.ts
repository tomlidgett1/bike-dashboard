import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import { uploadInstagramImageFiles } from "@/lib/instagram/upload";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/store/instagram/upload
 * multipart/form-data with one or more `files` fields.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const form = await request.formData();
    const entries = form.getAll("files");
    const files: Array<{ bytes: Buffer; name?: string }> = [];

    for (const entry of entries) {
      if (!(entry instanceof File)) continue;
      if (!entry.type.startsWith("image/")) {
        return NextResponse.json(
          { error: "Only image files can be uploaded." },
          { status: 400 },
        );
      }
      if (entry.size > 12 * 1024 * 1024) {
        return NextResponse.json(
          { error: `${entry.name || "A photo"} is too large (max 12MB).` },
          { status: 400 },
        );
      }
      files.push({
        bytes: Buffer.from(await entry.arrayBuffer()),
        name: entry.name,
      });
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Choose at least one photo to upload." },
        { status: 400 },
      );
    }

    const uploaded = await uploadInstagramImageFiles({
      ownerUserId: auth.user.id,
      files,
    });

    return NextResponse.json({
      success: true,
      images: uploaded.map((item) => ({
        url: item.url,
        publicId: item.publicId,
      })),
      imageUrls: uploaded.map((item) => item.url),
    });
  } catch (error) {
    console.error("[ig-upload] failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not upload photos.",
      },
      { status: 500 },
    );
  }
}
