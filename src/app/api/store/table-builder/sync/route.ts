import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import {
  getLightspeedRetryAfterMs,
  isLightspeedThrottleError,
} from "@/lib/services/lightspeed";
import { syncApiBuilderSource } from "@/lib/table-builder/sync-source";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Refresh the user's shared raw sales store (Build a Table). Saved tables are
 * projections over it, so this is the only sync there is — the request's
 * legacy tableId (if any) is accepted and ignored.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const body = await request.json().catch(() => ({}));
    // "auto" resumes any in-flight cursor, then picks incremental vs full.
    const modeRaw = typeof body.mode === "string" ? body.mode : null;
    const mode =
      modeRaw === "full" || modeRaw === "incremental" || modeRaw === "auto"
        ? modeRaw
        : body.restart === true
          ? "full"
          : "auto";
    const maxPages = body.maxPages != null ? Number(body.maxPages) : undefined;

    const result = await syncApiBuilderSource({
      userId: auth.user.id,
      maxPages,
      mode,
    });

    // Throttled chunks are still a successful control-plane response: the
    // client should wait and resume from the saved cursor.
    return NextResponse.json({
      success: true,
      retryable: Boolean(result.throttled),
      ...result,
    });
  } catch (error) {
    console.error("[table-builder/sync] failed:", error);
    const message = error instanceof Error ? error.message : "Failed to sync";
    if (isLightspeedThrottleError(error)) {
      return NextResponse.json(
        {
          success: false,
          retryable: true,
          throttled: true,
          retryAfterMs: getLightspeedRetryAfterMs(error, 15_000),
          error: message,
        },
        { status: 429 },
      );
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
