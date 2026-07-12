import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;
    const body = await request.json().catch(() => null) as {
      customerId?: unknown;
      note?: unknown;
    } | null;
    const customerId = typeof body?.customerId === "string" ? body.customerId.trim() : "";
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 5000) : "";
    if (!customerId || !note) {
      return NextResponse.json({ error: "A customer and note are required." }, { status: 400 });
    }

    const { data: store, error: storeError } = await auth.supabase
      .from("stores")
      .select("id")
      .eq("owner_user_id", auth.user.id)
      .maybeSingle();
    if (storeError) throw storeError;
    if (!store) return NextResponse.json({ error: "CRM store is not initialised." }, { status: 409 });

    const { data: customer, error: customerError } = await auth.supabase
      .from("store_customers")
      .select("id")
      .eq("store_id", store.id)
      .eq("id", customerId)
      .eq("status", "active")
      .maybeSingle();
    if (customerError) throw customerError;
    if (!customer) return NextResponse.json({ error: "Customer was not found." }, { status: 404 });

    const now = new Date().toISOString();
    const sourceId = randomUUID();
    const { data: event, error } = await auth.supabase
      .from("store_customer_events")
      .insert({
        store_id: store.id,
        customer_id: customer.id,
        event_type: "note",
        channel: "internal",
        source_type: "staff_note",
        source_id: sourceId,
        title: "Staff note",
        summary: note,
        occurred_at: now,
        actor_type: "staff",
        actor_id: auth.user.id,
        direction: "internal",
        metadata: {},
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error("[store/crm/notes] POST failed:", error);
    return NextResponse.json({ error: "Could not save customer note." }, { status: 500 });
  }
}
