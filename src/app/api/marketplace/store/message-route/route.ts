import { NextResponse } from "next/server";
import { registerAshPhoneRoute } from "@/lib/nest/yellow-jersey-phone-routes";
import { createServiceRoleClient } from "@/lib/supabase/server";

function getPublicMessageNumber(): string | null {
  const linqBotNumber = process.env.LINQ_AGENT_BOT_NUMBERS
    ?.split(",")
    .map((value) => value.trim())
    .find(Boolean);

  return (
    process.env.NEST_IMESSAGE_NUMBER?.trim() ||
    process.env.NEXT_PUBLIC_NEST_IMESSAGE_NUMBER?.trim() ||
    process.env.LINQ_VOICE_FROM?.trim() ||
    linqBotNumber ||
    null
  );
}

function toSmsHref(phone: string): string | null {
  const messageNumber = phone.trim().replace(/[^\d+]/g, "");
  return messageNumber ? `sms:${messageNumber}` : null;
}

function readPhone(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
}

function isPlausiblePhone(phone: string): boolean {
  if (phone.length < 8 || phone.length > 32) return false;
  if (!/^[+\d\s().-]+$/.test(phone)) return false;
  return phone.replace(/\D/g, "").length >= 8;
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Enter a valid mobile number." }, 400);
  }

  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const phone = readPhone(body.phone ?? body.phoneNumber ?? body.phone_number);

  if (!isPlausiblePhone(phone)) {
    return json({ error: "Enter a valid mobile number." }, 400);
  }

  const messageNumber = getPublicMessageNumber();
  const messageHref = messageNumber ? toSmsHref(messageNumber) : null;

  if (!messageNumber || !messageHref) {
    console.error("[store-message-route] missing message number configuration");
    return json({ error: "Store messaging is not configured yet." }, 500);
  }

  try {
    const supabase = createServiceRoleClient();
    const route = await registerAshPhoneRoute(supabase, phone, messageNumber);

    return json({
      ok: true,
      phoneE164: route.phoneE164,
      brandKey: route.brandKey,
      releasedHumanMode: route.releasedHumanMode,
      messageNumber,
      messageHref,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "We could not set up messaging. Try again shortly.";
    const status = message === "Enter a valid mobile number." ? 400 : 502;
    console.error("[store-message-route] registration failed:", message);
    return json({ error: message }, status);
  }
}
