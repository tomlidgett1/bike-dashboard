import { NextResponse } from "next/server";

const ROUTE_PATH = "/functions/v1/yellow-jersey-upload-route";
const MESSAGE_BODY = "nest";

type NestRouteResponse = {
  ok?: boolean;
  phoneE164?: string;
  mode?: string;
  error?: string;
};

function getNestRouteUrl(): string | null {
  const explicitUrl = process.env.NEST_YELLOW_JERSEY_UPLOAD_ROUTE_URL?.trim();
  if (explicitUrl) return explicitUrl;

  const supabaseUrl = process.env.NEST_SUPABASE_URL?.trim();
  if (!supabaseUrl) return null;

  return `${supabaseUrl.replace(/\/+$/, "")}${ROUTE_PATH}`;
}

function getInternalSecret(): string | null {
  return (
    process.env.INTERNAL_EDGE_SHARED_SECRET?.trim() ||
    process.env.NEST_INTERNAL_EDGE_SHARED_SECRET?.trim() ||
    process.env.NEST_SUPABASE_SECRET_KEY?.trim() ||
    process.env.NEST_NEW_SUPABASE_SECRET_KEY?.trim() ||
    process.env.NEST_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEW_SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    null
  );
}

function getPublicMessageNumber(): string | null {
  const linqBotNumber = process.env.LINQ_AGENT_BOT_NUMBERS
    ?.split(",")
    .map((value) => value.trim())
    .find(Boolean);

  return (
    process.env.NEST_IMESSAGE_NUMBER?.trim() ||
    process.env.NEXT_PUBLIC_NEST_IMESSAGE_NUMBER?.trim() ||
    linqBotNumber ||
    null
  );
}

function toSmsHref(phone: string, body: string): string | null {
  const messageNumber = phone.trim().replace(/[^\d+]/g, "");
  return messageNumber ? `sms:${messageNumber}?&body=${encodeURIComponent(body)}` : null;
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

  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const phone = readPhone(body.phone ?? body.phoneNumber ?? body.phone_number);

  if (!isPlausiblePhone(phone)) {
    return json({ error: "Enter a valid mobile number." }, 400);
  }

  const nestRouteUrl = getNestRouteUrl();
  const internalSecret = getInternalSecret();
  const messageNumber = getPublicMessageNumber();
  const messageHref = messageNumber ? toSmsHref(messageNumber, MESSAGE_BODY) : null;

  if (!nestRouteUrl || !internalSecret || !messageHref) {
    console.error("[text-upload-route] missing configuration", {
      nestRouteUrl: Boolean(nestRouteUrl),
      internalSecret: Boolean(internalSecret),
      messageHref: Boolean(messageHref),
    });
    const error = !messageHref
      ? "Nest iMessage number is not configured yet."
      : "Text upload is not configured yet.";
    return json({ error }, 500);
  }

  try {
    const response = await fetch(nestRouteUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify({ phone }),
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({})) as NestRouteResponse;

    if (!response.ok || data.ok === false) {
      return json(
        { error: data.error || "We could not set up text upload. Try again shortly." },
        response.status >= 400 && response.status < 500 ? 400 : 502,
      );
    }

    return json({
      ok: true,
      phoneE164: data.phoneE164,
      mode: data.mode || "upload",
      messageNumber,
      messageBody: MESSAGE_BODY,
      messageHref,
    });
  } catch (error) {
    console.error(
      "[text-upload-route] Nest route request failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return json({ error: "We could not set up text upload. Try again shortly." }, 502);
  }
}
