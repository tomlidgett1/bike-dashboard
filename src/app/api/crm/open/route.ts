/**
 * First-party open tracking pixel for CRM campaign emails.
 *
 * GET /api/crm/open?r=<recipient_id>
 *
 * Resend domain open tracking is off by default, so we embed this 1×1 pixel
 * in every sent campaign email. Resend webhooks remain a secondary source.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { recordRecipientOpen } from "@/lib/crm/analytics";

export const runtime = "nodejs";

// 1×1 transparent GIF
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export async function GET(request: NextRequest) {
  const recipientId = request.nextUrl.searchParams.get("r")?.trim() ?? "";

  if (recipientId) {
    const supabase = createServiceRoleClient();
    await recordRecipientOpen(supabase, recipientId).catch((error) => {
      console.error("[crm] open pixel failed:", error);
    });
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
