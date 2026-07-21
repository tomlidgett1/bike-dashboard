import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import { decryptToken } from "@/lib/services/lightspeed/token-manager";
import {
  getInstagramConnection,
  listFacebookPagesWithInstagram,
  storeInstagramPageConnection,
  toPublicInstagramStatus,
} from "@/lib/instagram/oauth-connection";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const row = await getInstagramConnection(auth.user.id);
    if (!row?.user_access_token_encrypted) {
      return NextResponse.json(
        { error: "Connect Instagram first, then choose a Page." },
        { status: 400 },
      );
    }

    const userToken = decryptToken(row.user_access_token_encrypted);
    const pages = await listFacebookPagesWithInstagram(userToken);
    return NextResponse.json(
      {
        pages: pages.map((p) => ({
          pageId: p.pageId,
          pageName: p.pageName,
          instagramUserId: p.instagramUserId,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[ig-pages] list failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load Facebook Pages.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const body = await request.json().catch(() => ({}));
    const pageId = typeof body.pageId === "string" ? body.pageId.trim() : "";
    if (!pageId) {
      return NextResponse.json({ error: "pageId is required." }, { status: 400 });
    }

    const row = await getInstagramConnection(auth.user.id);
    if (!row?.user_access_token_encrypted) {
      return NextResponse.json(
        { error: "Connect Instagram first, then choose a Page." },
        { status: 400 },
      );
    }

    const userToken = decryptToken(row.user_access_token_encrypted);
    const pages = await listFacebookPagesWithInstagram(userToken);
    const selected = pages.find((p) => p.pageId === pageId);
    if (!selected) {
      return NextResponse.json(
        { error: "That Facebook Page was not found on this account." },
        { status: 404 },
      );
    }

    await storeInstagramPageConnection({
      userId: auth.user.id,
      page: selected,
      userAccessToken: userToken,
    });

    const updated = await getInstagramConnection(auth.user.id);
    return NextResponse.json({
      ok: true,
      ...toPublicInstagramStatus(updated),
    });
  } catch (error) {
    console.error("[ig-pages] select failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not select Facebook Page.",
      },
      { status: 500 },
    );
  }
}
