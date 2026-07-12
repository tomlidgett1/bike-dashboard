import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";

async function resolveStoreId(
  auth: Exclude<Awaited<ReturnType<typeof requireStoreUser>>, { error: NextResponse }>,
): Promise<string> {
  const { data, error } = await auth.supabase
    .from("stores")
    .select("id")
    .eq("owner_user_id", auth.user.id)
    .maybeSingle();
  if (error) throw new Error(`Could not load CRM store: ${error.message}`);
  if (!data) throw new Error("CRM store is not initialised.");
  return String(data.id);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;
    const storeId = await resolveStoreId(auth);
    const customerId = request.nextUrl.searchParams.get("customerId")?.trim();
    let query = auth.supabase
      .from("store_customer_tasks")
      .select("id, customer_id, task_type, title, reason, status, priority, expected_value, assigned_to, due_at, snoozed_until, completed_at, payload, created_at, updated_at")
      .eq("store_id", storeId)
      .order("priority", { ascending: false })
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(200);
    if (customerId) query = query.eq("customer_id", customerId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ tasks: data ?? [] });
  } catch (error) {
    console.error("[store/crm/tasks] GET failed:", error);
    return NextResponse.json({ error: "Could not load CRM tasks." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;
    const storeId = await resolveStoreId(auth);
    const body = await request.json().catch(() => null) as {
      customerId?: unknown;
      title?: unknown;
      reason?: unknown;
      dueAt?: unknown;
      priority?: unknown;
    } | null;
    const customerId = typeof body?.customerId === "string" ? body.customerId.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "";
    const dueTimestamp = body?.dueAt == null ? null : Date.parse(String(body.dueAt));
    if (!customerId || !title || (dueTimestamp != null && !Number.isFinite(dueTimestamp))) {
      return NextResponse.json({ error: "A customer, title and valid due date are required." }, { status: 400 });
    }
    const priority = Math.min(Math.max(Math.trunc(Number(body?.priority ?? 50)), 0), 100);
    const { data, error } = await auth.supabase
      .from("store_customer_tasks")
      .insert({
        store_id: storeId,
        customer_id: customerId,
        task_type: "follow_up",
        title,
        reason: typeof body?.reason === "string" ? body.reason.trim().slice(0, 1000) : "",
        priority,
        assigned_to: auth.user.id,
        source_type: "manual",
        due_at: dueTimestamp == null ? null : new Date(dueTimestamp).toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ task: data }, { status: 201 });
  } catch (error) {
    console.error("[store/crm/tasks] POST failed:", error);
    return NextResponse.json({ error: "Could not create CRM task." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;
    const storeId = await resolveStoreId(auth);
    const body = await request.json().catch(() => null) as {
      id?: unknown;
      action?: unknown;
      snoozedUntil?: unknown;
    } | null;
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const action = body?.action;
    if (!id || !["complete", "dismiss", "snooze", "start"].includes(String(action))) {
      return NextResponse.json({ error: "A valid task action is required." }, { status: 400 });
    }
    const now = new Date().toISOString();
    const patch = action === "complete"
      ? { status: "completed", completed_at: now }
      : action === "dismiss"
        ? { status: "dismissed" }
        : action === "start"
          ? { status: "in_progress" }
          : {
              status: "snoozed",
              snoozed_until: Number.isFinite(Date.parse(String(body?.snoozedUntil ?? "")))
                ? new Date(Date.parse(String(body?.snoozedUntil))).toISOString()
                : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            };
    const { data, error } = await auth.supabase
      .from("store_customer_tasks")
      .update(patch)
      .eq("store_id", storeId)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Task was not found." }, { status: 404 });
    return NextResponse.json({ task: data });
  } catch (error) {
    console.error("[store/crm/tasks] PATCH failed:", error);
    return NextResponse.json({ error: "Could not update CRM task." }, { status: 500 });
  }
}
