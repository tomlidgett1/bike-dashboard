import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/data-cleaning/queue
 * 
 * Adds canonical products to the description generation queue.
 * 
 * Body:
 * - productIds: string[] - Array of canonical product IDs to queue
 * - queueAll: boolean - If true, queues all products without descriptions
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const body = await request.json();
    const { productIds, queueAll } = body;

    console.log(`[DATA-CLEANING QUEUE] User ${user.id} queuing products`);
    console.log(`  - productIds: ${productIds?.length || 0}`);
    console.log(`  - queueAll: ${queueAll}`);

    let idsToQueue: string[] = [];

    if (queueAll) {
      // Get all canonical products without descriptions that aren't already queued
      const { data: productsWithoutDesc, error: fetchError } = await supabase
        .from("canonical_products")
        .select("id")
        .is("product_description", null);

      if (fetchError) {
        console.error("[DATA-CLEANING QUEUE] Error fetching products:", fetchError);
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
      }

      // Get already queued products
      const { data: existingQueue } = await supabase
        .from("description_generation_queue")
        .select("canonical_product_id")
        .in("status", ["pending", "processing"]);

      const alreadyQueued = new Set(
        existingQueue?.map((q) => q.canonical_product_id) || []
      );

      idsToQueue = (productsWithoutDesc || [])
        .map((p) => p.id)
        .filter((id) => !alreadyQueued.has(id));

      console.log(`[DATA-CLEANING QUEUE] Found ${idsToQueue.length} products to queue (filtered from ${productsWithoutDesc?.length || 0})`);
    } else if (productIds && Array.isArray(productIds)) {
      // Get already queued products
      const { data: existingQueue } = await supabase
        .from("description_generation_queue")
        .select("canonical_product_id")
        .in("canonical_product_id", productIds)
        .in("status", ["pending", "processing"]);

      const alreadyQueued = new Set(
        existingQueue?.map((q) => q.canonical_product_id) || []
      );

      idsToQueue = productIds.filter((id: string) => !alreadyQueued.has(id));
      console.log(`[DATA-CLEANING QUEUE] Queuing ${idsToQueue.length} of ${productIds.length} selected products`);
    } else {
      return NextResponse.json(
        { error: "Either productIds array or queueAll flag is required" },
        { status: 400 }
      );
    }

    if (idsToQueue.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No new products to queue",
        queued: 0,
        skipped: productIds?.length || 0,
      });
    }

    // Insert into queue (upsert to handle duplicates)
    const queueItems = idsToQueue.map((id) => ({
      canonical_product_id: id,
      status: "pending",
      created_by: user.id,
      created_at: new Date().toISOString(),
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("description_generation_queue")
      .upsert(queueItems, {
        onConflict: "canonical_product_id",
        ignoreDuplicates: false,
      })
      .select("id");

    if (insertError) {
      console.error("[DATA-CLEANING QUEUE] Error inserting queue items:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    console.log(`[DATA-CLEANING QUEUE] Successfully queued ${inserted?.length || 0} products`);

    return NextResponse.json({
      success: true,
      queued: inserted?.length || 0,
      skipped: (productIds?.length || 0) - idsToQueue.length,
    });
  } catch (error) {
    console.error("[DATA-CLEANING QUEUE] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/data-cleaning/queue
 * 
 * Removes items from the queue.
 * 
 * Body:
 * - productIds: string[] - Array of canonical product IDs to remove from queue
 * - clearFailed: boolean - If true, clears all failed items
 * - clearCompleted: boolean - If true, clears all completed items
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const body = await request.json();
    const { productIds, clearFailed, clearCompleted } = body;

    console.log(`[DATA-CLEANING QUEUE] User ${user.id} removing queue items`);

    let deletedCount = 0;

    if (clearFailed) {
      const { count } = await supabase
        .from("description_generation_queue")
        .delete({ count: "exact" })
        .eq("status", "failed");
      deletedCount += count || 0;
    }

    if (clearCompleted) {
      const { count } = await supabase
        .from("description_generation_queue")
        .delete({ count: "exact" })
        .eq("status", "completed");
      deletedCount += count || 0;
    }

    if (productIds && Array.isArray(productIds) && productIds.length > 0) {
      const { count } = await supabase
        .from("description_generation_queue")
        .delete({ count: "exact" })
        .in("canonical_product_id", productIds);
      deletedCount += count || 0;
    }

    console.log(`[DATA-CLEANING QUEUE] Removed ${deletedCount} queue items`);

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
    });
  } catch (error) {
    console.error("[DATA-CLEANING QUEUE] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

