import { NextResponse } from "next/server";
import { requireSupplierCatalogueManager } from "@/lib/supplier-catalogue/auth";
import { stopCatalogueCrawl } from "@/lib/supplier-catalogue/advance";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/admin/supplier-catalogue/[id]/stop
 * Stop the active crawl for this catalogue.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const auth = await requireSupplierCatalogueManager(supabase);
    if (!auth.authorized) return auth.response;

    const { id } = await context.params;
    const admin = createServiceRoleClient();
    const { data: catalogue } = await admin
      .from("supplier_catalogues")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (!catalogue) {
      return NextResponse.json({ error: "Catalogue not found" }, { status: 404 });
    }

    const result = await stopCatalogueCrawl(admin, id);

    if (result.cancelledRuns === 0) {
      return NextResponse.json({
        success: true,
        cancelledRuns: 0,
        message: "No active crawl to stop.",
      });
    }

    return NextResponse.json({
      success: true,
      cancelledRuns: result.cancelledRuns,
      message: "Crawl stopped. Any in-flight chunk will exit shortly.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to stop crawl",
      },
      { status: 500 },
    );
  }
}
