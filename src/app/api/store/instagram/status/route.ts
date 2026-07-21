import { NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import {
  fetchInstagramProfile,
  isComposioConfigured,
  listInstagramConnections,
} from "@/lib/composio/instagram";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function loadStoreLogoUrl(userId: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("users")
    .select("logo_url")
    .eq("user_id", userId)
    .maybeSingle();
  const url = typeof data?.logo_url === "string" ? data.logo_url.trim() : "";
  if (!url || url.includes("googleusercontent.com")) return null;
  return url;
}

export async function GET() {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const logoUrl = await loadStoreLogoUrl(auth.user.id);

    if (!isComposioConfigured()) {
      return NextResponse.json(
        {
          oauthConfigured: false,
          connected: false,
          username: null,
          accountName: null,
          connectedAccountId: null,
          connectedAt: null,
          logoUrl,
          lastError: "Composio is not configured on the server.",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const connections = await listInstagramConnections(auth.user.id);
    const connection = connections[0] ?? null;
    if (!connection) {
      return NextResponse.json(
        {
          oauthConfigured: true,
          connected: false,
          username: null,
          accountName: null,
          connectedAccountId: null,
          connectedAt: null,
          logoUrl,
          lastError: null,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const profile = await fetchInstagramProfile(auth.user.id, connection.id).catch(
      () => ({ id: null, username: null }),
    );

    return NextResponse.json(
      {
        oauthConfigured: true,
        connected: true,
        username: profile.username,
        accountName: connection.label,
        connectedAccountId: connection.id,
        connectedAt: null,
        logoUrl,
        lastError: null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[ig-status] failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load Instagram status.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
