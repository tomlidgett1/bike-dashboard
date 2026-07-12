import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";

async function storeIdForUser(
  auth: Awaited<ReturnType<typeof requireStoreUser>>,
): Promise<string | NextResponse> {
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.supabase
    .from("stores")
    .select("id")
    .eq("owner_user_id", auth.user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load store." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "CRM store is not initialised." }, { status: 409 });
  return String(data.id);
}

export async function GET() {
  try {
    const auth = await requireStoreUser();
    const storeId = await storeIdForUser(auth);
    if (storeId instanceof NextResponse) return storeId;
    if ("error" in auth) return auth.error;

    const [events, loyalty] = await Promise.all([
      auth.supabase
        .from("store_community_events")
        .select("id, title, event_type, description, starts_at, ends_at, capacity, status, created_at")
        .eq("store_id", storeId)
        .order("starts_at", { ascending: true })
        .limit(100),
      auth.supabase
        .from("store_loyalty_programmes")
        .select("enabled, programme_name, points_per_dollar, service_multiplier, points_expiry_days, settings")
        .eq("store_id", storeId)
        .maybeSingle(),
    ]);
    const error = events.error ?? loyalty.error;
    if (error) throw error;
    return NextResponse.json({ events: events.data ?? [], loyalty: loyalty.data });
  } catch (error) {
    console.error("[store/crm/community] GET failed:", error);
    return NextResponse.json({ error: "Could not load community settings." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    const storeId = await storeIdForUser(auth);
    if (storeId instanceof NextResponse) return storeId;
    if ("error" in auth) return auth.error;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "A request body is required." }, { status: 400 });

    if (body.action === "update_loyalty") {
      const programmeName = String(body.programmeName ?? "Rider rewards").trim().slice(0, 80);
      const pointsPerDollar = Number(body.pointsPerDollar ?? 1);
      const serviceMultiplier = Number(body.serviceMultiplier ?? 1.5);
      if (
        !Number.isFinite(pointsPerDollar)
        || pointsPerDollar < 0
        || !Number.isFinite(serviceMultiplier)
        || serviceMultiplier < 0
      ) {
        return NextResponse.json({ error: "Loyalty rates must be positive numbers." }, { status: 400 });
      }
      const { data, error } = await auth.supabase
        .from("store_loyalty_programmes")
        .upsert({
          store_id: storeId,
          enabled: body.enabled === true,
          programme_name: programmeName || "Rider rewards",
          points_per_dollar: Math.min(pointsPerDollar, 100),
          service_multiplier: Math.min(serviceMultiplier, 100),
          points_expiry_days: body.pointsExpiryDays == null
            ? null
            : Math.min(Math.max(Math.trunc(Number(body.pointsExpiryDays)), 30), 3650),
        }, { onConflict: "store_id" })
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ loyalty: data });
    }

    if (body.action === "create_event") {
      const title = String(body.title ?? "").trim().slice(0, 160);
      const startsAt = Date.parse(String(body.startsAt ?? ""));
      const eventType = String(body.eventType ?? "community");
      const validTypes = new Set(["group_ride", "clinic", "fit_session", "community", "other"]);
      if (!title || !Number.isFinite(startsAt) || !validTypes.has(eventType)) {
        return NextResponse.json({ error: "Title, event type and start time are required." }, { status: 400 });
      }
      const { data, error } = await auth.supabase
        .from("store_community_events")
        .insert({
          store_id: storeId,
          title,
          event_type: eventType,
          description: String(body.description ?? "").trim().slice(0, 2000),
          starts_at: new Date(startsAt).toISOString(),
          ends_at: Number.isFinite(Date.parse(String(body.endsAt ?? "")))
            ? new Date(Date.parse(String(body.endsAt))).toISOString()
            : null,
          capacity: body.capacity == null
            ? null
            : Math.min(Math.max(Math.trunc(Number(body.capacity)), 1), 10000),
          status: body.publish === false ? "draft" : "published",
        })
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ event: data }, { status: 201 });
    }

    return NextResponse.json({ error: "Unknown community action." }, { status: 400 });
  } catch (error) {
    console.error("[store/crm/community] POST failed:", error);
    return NextResponse.json({ error: "Could not save community settings." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    const storeId = await storeIdForUser(auth);
    if (storeId instanceof NextResponse) return storeId;
    if ("error" in auth) return auth.error;
    const eventId = request.nextUrl.searchParams.get("eventId")?.trim();
    if (!eventId) return NextResponse.json({ error: "An event is required." }, { status: 400 });
    const { error } = await auth.supabase
      .from("store_community_events")
      .update({ status: "cancelled" })
      .eq("store_id", storeId)
      .eq("id", eventId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[store/crm/community] DELETE failed:", error);
    return NextResponse.json({ error: "Could not cancel community event." }, { status: 500 });
  }
}
