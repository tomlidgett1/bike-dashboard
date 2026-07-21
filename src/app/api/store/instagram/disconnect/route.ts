import { NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import {
  disconnectInstagramAccount,
  isComposioConfigured,
  listInstagramConnections,
} from "@/lib/composio/instagram";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    if (!isComposioConfigured()) {
      return NextResponse.json(
        { error: "Instagram connect is not configured yet." },
        { status: 503 },
      );
    }

    await disconnectInstagramAccount(auth.user.id);
    const connections = await listInstagramConnections(auth.user.id);

    return NextResponse.json(
      {
        ok: true,
        oauthConfigured: true,
        connected: connections.length > 0,
        username: null,
        accountName: null,
        connectedAccountId: null,
        connectedAt: null,
        lastError: null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[ig-disconnect] failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not disconnect Instagram.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
