import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getInternalEdgeSharedSecret } from "@/lib/nest-portal/api/_shared/internal-edge-auth";
import { handleNestInboxSyncEvent } from "@/lib/nest/inbox-webhook-sync";

export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isAuthorised(request: NextRequest): boolean {
  const secret = getInternalEdgeSharedSecret();
  if (!secret) return false;
  const header = request.headers.get("x-internal-secret")?.trim();
  return Boolean(header && header === secret);
}

/**
 * Internal webhook: call after a Nest conversation message is written so the
 * YJ inbox mirror updates immediately instead of waiting for cron/polling.
 *
 * POST /api/nest/inbox-sync
 * Headers: x-internal-secret
 * Body: { brandKey, chatId?, role?, recipientHandle?, botNumber?, metadata? }
 */
export async function POST(request: NextRequest) {
  if (!isAuthorised(request)) {
    return json({ error: "Unauthorised" }, 401);
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return json({ error: "Server database is not configured." }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const brandKey = typeof body.brandKey === "string" ? body.brandKey.trim() : "";
  if (!brandKey) {
    return json({ error: "brandKey is required." }, 400);
  }

  const metadata =
    body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : {};

  try {
    const result = await handleNestInboxSyncEvent(supabase, {
      brandKey,
      chatId: typeof body.chatId === "string" ? body.chatId : null,
      role: typeof body.role === "string" ? body.role : null,
      recipientHandle:
        typeof body.recipientHandle === "string" ? body.recipientHandle : null,
      botNumber: typeof body.botNumber === "string" ? body.botNumber : null,
      metadata,
      source: typeof body.source === "string" ? body.source : null,
    });

    return json({ ok: true, ...result });
  } catch (error) {
    console.error("[nest-inbox-sync] failed:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Could not sync Nest inbox.",
      },
      500,
    );
  }
}

/** Warm path for keep-alive pings. */
export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return json({ ok: true, warm: true });
  }
  return json({ ok: true, warm: true });
}
