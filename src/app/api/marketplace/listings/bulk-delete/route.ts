import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { refreshPublicMarketplaceAfterMutation } from "@/lib/server/refresh-public-marketplace";

type TabStatus = "active" | "inactive" | "sold" | "expired" | "draft" | "archived";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyStatusFilter(query: any, status: TabStatus) {
  if (status === "sold") {
    return query
      .not("sold_at", "is", null)
      .or("listing_status.is.null,listing_status.neq.removed");
  }
  if (status === "active") {
    return query
      .is("sold_at", null)
      .or("listing_status.is.null,listing_status.eq.active");
  }
  if (status === "archived") {
    return query.eq("listing_status", "archived");
  }
  return query.eq("listing_status", status);
}

async function deleteListingRow(
  adminClient: ReturnType<typeof createServiceRoleClient>,
  id: string,
  listingStatus: string | null,
) {
  if (listingStatus === "draft") {
    const { error } = await adminClient.from("products").delete().eq("id", id);
    if (error) throw error;
    return;
  }

  const { error } = await adminClient
    .from("products")
    .update({ listing_status: "removed", is_active: false })
    .eq("id", id);

  if (error) throw error;
}

/**
 * DELETE /api/marketplace/listings/bulk-delete
 * Body: { listingIds?: string[] } | { deleteAll: true, status?: TabStatus }
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const listingIds: string[] | undefined = Array.isArray(body.listingIds)
      ? body.listingIds.filter((id: unknown) => typeof id === "string" && id.length > 0)
      : undefined;
    const deleteAll = body.deleteAll === true;
    const status = body.status as TabStatus | undefined;

    if (!deleteAll && (!listingIds || listingIds.length === 0)) {
      return NextResponse.json(
        { error: "Provide listingIds or deleteAll: true" },
        { status: 400 },
      );
    }

    const adminClient = createServiceRoleClient();

    let rows: { id: string; listing_status: string | null }[] = [];

    if (deleteAll) {
      let query = adminClient
        .from("products")
        .select("id, listing_status")
        .eq("user_id", user.id)
        .in("listing_source", ["manual", "facebook_import"]);

      if (status) {
        query = applyStatusFilter(query, status);
      } else {
        query = query.or("listing_status.is.null,listing_status.neq.removed");
      }

      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      rows = data ?? [];
    } else {
      const { data, error } = await adminClient
        .from("products")
        .select("id, listing_status")
        .eq("user_id", user.id)
        .in("listing_source", ["manual", "facebook_import"])
        .in("id", listingIds!);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      rows = data ?? [];

      if (rows.length !== listingIds!.length) {
        return NextResponse.json(
          { error: "One or more listings were not found" },
          { status: 404 },
        );
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ success: true, deletedCount: 0 });
    }

    for (const row of rows) {
      await deleteListingRow(adminClient, row.id, row.listing_status);
    }

    await refreshPublicMarketplaceAfterMutation();

    return NextResponse.json({
      success: true,
      deletedCount: rows.length,
    });
  } catch (error) {
    console.error("[listings/bulk-delete]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
