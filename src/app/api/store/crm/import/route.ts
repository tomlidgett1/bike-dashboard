/**
 * CRM Lightspeed import
 *
 * POST /api/store/crm/import — pull all Lightspeed customers with an email
 * address into crm_contacts (deduped by normalized email, opt-outs preserved).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { importLightspeedContacts } from "@/lib/crm/import-lightspeed";

// Large customer books take a while (Lightspeed rate limits + pagination).
export const maxDuration = 300;

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const result = await importLightspeedContacts(supabase, user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[crm] Lightspeed import failed:", error);
    const message = error instanceof Error ? error.message : "Import failed";
    const needsReconnect = /No valid access token|Session expired|reconnect/i.test(message);
    return NextResponse.json(
      {
        error: needsReconnect
          ? "Lightspeed is not connected. Connect Lightspeed and try again."
          : message,
      },
      { status: needsReconnect ? 409 : 500 },
    );
  }
}
