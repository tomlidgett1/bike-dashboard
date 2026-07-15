import { NextRequest, NextResponse } from "next/server";
import { requireSupplierScraperManager } from "@/lib/scrapers/supplier-auth";
import { encryptSupplierCredentials } from "@/lib/scrapers/supplier-security";
import {
  loadSupplierScraperRow,
  toStoredSupplierScraper,
} from "@/lib/scrapers/supplier-storage";
import type {
  FieldMapping,
} from "@/lib/scrapers/fesports-field-mapping";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSupplierScraperManager();
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const scraper = await loadSupplierScraperRow(auth, id);
    const body = (await request.json()) as {
      name?: unknown;
      fieldMapping?: unknown;
      status?: unknown;
      username?: unknown;
      password?: unknown;
      alternatePhotoSource?: unknown;
    };
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim().slice(0, 120);
    }
    if (body.fieldMapping && typeof body.fieldMapping === "object") {
      updates.field_mapping = body.fieldMapping as FieldMapping;
    }
    if (body.alternatePhotoSource && typeof body.alternatePhotoSource === "object") {
      const source = body.alternatePhotoSource as Record<string, unknown>;
      const websiteUrl = typeof source.websiteUrl === "string" ? source.websiteUrl.trim() : "";
      updates.config = {
        ...scraper.config,
        alternatePhotoSource: websiteUrl
          ? {
              enabled: source.enabled !== false,
              websiteUrl,
              sourceName:
                typeof source.sourceName === "string" && source.sourceName.trim()
                  ? source.sourceName.trim().slice(0, 120)
                  : new URL(websiteUrl).hostname,
              searchUrlTemplate:
                typeof source.searchUrlTemplate === "string" && source.searchUrlTemplate.trim()
                  ? source.searchUrlTemplate.trim()
                  : null,
            }
          : null,
      };
    }
    if (body.status === "draft" || body.status === "ready" || body.status === "archived") {
      updates.status = body.status;
    }
    if (typeof body.username === "string" || typeof body.password === "string") {
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!password) {
        return NextResponse.json(
          { error: "Enter the supplier password." },
          { status: 400 },
        );
      }
      updates.credential_ciphertext = encryptSupplierCredentials({ username, password });
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No changes provided." }, { status: 400 });
    }

    const { data, error } = await auth.supabase
      .from("store_supplier_scrapers")
      .update(updates)
      .eq("id", id)
      .eq("owner_user_id", auth.user.id)
      .select("*")
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Could not update the supplier scraper.");
    }

    return NextResponse.json({
      success: true,
      scraper: toStoredSupplierScraper(data as never),
    });
  } catch (error) {
    console.error("[supplier-scrapers/update]", error);
    const message =
      error instanceof Error ? error.message : "Could not update the supplier scraper.";
    return NextResponse.json(
      { error: message },
      { status: message === "Supplier scraper not found." ? 404 : 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSupplierScraperManager();
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const { error } = await auth.supabase
      .from("store_supplier_scrapers")
      .update({ status: "archived" })
      .eq("id", id)
      .eq("owner_user_id", auth.user.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[supplier-scrapers/archive]", error);
    return NextResponse.json(
      { error: "Could not archive the supplier scraper." },
      { status: 500 },
    );
  }
}
