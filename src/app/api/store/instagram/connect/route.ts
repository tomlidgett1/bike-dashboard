import { NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import {
  isComposioConfigured,
  mintInstagramConnectLink,
} from "@/lib/composio/instagram";

export const dynamic = "force-dynamic";

/**
 * POST /api/store/instagram/connect
 * Starts Composio Instagram OAuth and returns the Yellow Jersey → Composio URL.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    if (!isComposioConfigured()) {
      return NextResponse.json(
        { error: "Instagram connect is not configured yet (Composio)." },
        { status: 503 },
      );
    }

    const { origin } = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const baseUrl = forwardedHost
      ? `${forwardedProto || "https"}://${forwardedHost}`
      : origin;

    const callbackUrl = `${baseUrl}/settings/store/instagram?instagram=connected`;
    const { url } = await mintInstagramConnectLink(auth.user.id, { callbackUrl });

    return NextResponse.json({ url });
  } catch (error) {
    console.error("[ig-connect] failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not start Instagram connect.",
      },
      { status: 500 },
    );
  }
}
