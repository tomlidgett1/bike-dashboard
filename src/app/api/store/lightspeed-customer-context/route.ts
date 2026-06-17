import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import { buildLightspeedContextFromPhone } from "@/lib/customer-inquiries/lightspeed-context";
import { sanitizePhoneForLookup } from "@/lib/customer-inquiries/lightspeed-phone-directory";
import { normalizeAustralianMobileLocal } from "@/lib/services/lightspeed/customer-search";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

async function loadContext(request: NextRequest) {
  const auth = await requireStoreUser();
  if ("error" in auth) return { error: auth.error as NextResponse };

  let rawPhone = "";
  if (request.method === "POST") {
    const body = (await request.json().catch(() => null)) as { phone?: unknown } | null;
    rawPhone = String(body?.phone ?? "").trim();
  } else {
    rawPhone = String(request.nextUrl.searchParams.get("phone") ?? "").trim();
  }

  if (!rawPhone) {
    return { error: json({ error: "phone is required." }, 400) };
  }

  const phone = sanitizePhoneForLookup(rawPhone) ?? rawPhone;
  const context = await buildLightspeedContextFromPhone({
    userId: auth.user.id,
    phone,
    supabase: auth.supabase,
  });

  return {
    context: {
      ...context,
      lookup_phone: phone,
      normalized_phone: normalizeAustralianMobileLocal(phone),
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const result = await loadContext(request);
    if ("error" in result && result.error) return result.error;
    return json(result.context);
  } catch (error) {
    console.error("[lightspeed-customer-context] GET failed:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Could not load Lightspeed customer context.",
      },
      500,
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await loadContext(request);
    if ("error" in result && result.error) return result.error;
    return json(result.context);
  } catch (error) {
    console.error("[lightspeed-customer-context] POST failed:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Could not load Lightspeed customer context.",
      },
      500,
    );
  }
}
