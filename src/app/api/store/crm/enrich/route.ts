/**
 * CRM contact enrichment from Lightspeed sales data.
 *
 * POST /api/store/crm/enrich
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enrichCrmContacts } from "@/lib/crm/enrich-contacts";

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

    const result = await enrichCrmContacts(supabase, user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[crm] enrich failed:", error);
    return NextResponse.json({ error: "Enrichment failed" }, { status: 500 });
  }
}
