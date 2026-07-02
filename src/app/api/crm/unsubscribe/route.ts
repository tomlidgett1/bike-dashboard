/**
 * One-click unsubscribe endpoint (RFC 8058).
 *
 * Mail clients POST here from the List-Unsubscribe header without any user
 * interaction; humans following the same URL get redirected to the visible
 * /unsubscribe confirmation page.
 */

import { NextRequest, NextResponse } from "next/server";
import { optOutContactByToken } from "@/lib/crm/unsubscribe";

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const outcome = await optOutContactByToken(token, "one_click_unsubscribe");
  if (outcome === "invalid") {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const url = request.nextUrl.clone();
  url.pathname = "/unsubscribe";
  url.search = token ? `?token=${encodeURIComponent(token)}` : "";
  return NextResponse.redirect(url);
}
