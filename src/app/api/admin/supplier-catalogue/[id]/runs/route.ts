import { NextResponse } from "next/server";
import { requireSupplierCatalogueManager } from "@/lib/supplier-catalogue/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/supplier-catalogue/[id]/runs
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const auth = await requireSupplierCatalogueManager(supabase);
    if (!auth.authorized) return auth.response;

    const { id } = await context.params;
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("supplier_catalogue_scrape_runs")
      .select(
        "id, status, phase, progress, products_found, products_upserted, images_processed, error_message, coverage_status, authoritative_total, authoritative_source, discovered_url_count, ingested_url_count, failed_url_count, unresolved_url_count, coverage_summary, started_at, finished_at, created_at",
      )
      .eq("catalogue_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ runs: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load runs",
      },
      { status: 500 },
    );
  }
}
