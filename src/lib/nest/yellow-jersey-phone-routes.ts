import type { SupabaseClient } from "@supabase/supabase-js";
import { releasePortalHumanMode } from "@/lib/nest/human-mode";
import { normaliseToE164 } from "@/lib/nest/phone-normalise";

export type AshPhoneRouteResult = {
  phoneE164: string;
  brandKey: "ash";
  updatedAt: string;
  releasedHumanMode: boolean;
};

/** Release manual mode when a customer re-enters Ash via the storefront SMS flow. */
async function releaseAshStorefrontHumanMode(
  supabase: SupabaseClient,
  phoneE164: string,
  botNumber: string,
): Promise<boolean> {
  const releasedByBot = await releasePortalHumanMode(supabase, {
    recipientHandle: phoneE164,
    botNumber,
    brandKey: "ash",
    reason: "route_switch",
    releaseRoute: "yellow_jersey_ash_phone_routes",
  });

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("linq_human_mode_threads")
    .update({
      released_at: now,
      released_reason: "route_switch",
      release_route: "yellow_jersey_ash_phone_routes",
      release_brand_key: "ash",
    })
    .eq("recipient_handle", phoneE164)
    .eq("brand_key", "ash")
    .is("released_at", null)
    .select("id");

  if (error) {
    console.error("[yellow-jersey-phone-routes] human mode release failed:", error.message);
    return releasedByBot;
  }

  return releasedByBot || (data?.length ?? 0) > 0;
}

export async function registerAshPhoneRoute(
  supabase: SupabaseClient,
  rawPhone: string,
  botNumber: string,
): Promise<AshPhoneRouteResult> {
  const phoneE164 = normaliseToE164(rawPhone);
  if (!phoneE164) {
    throw new Error("Enter a valid mobile number.");
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("yellow_jersey_ash_phone_routes")
    .upsert(
      {
        phone_e164: phoneE164,
        brand_key: "ash",
        raw_phone: rawPhone.trim().slice(0, 128),
        source: "yellow_jersey",
        updated_at: now,
      },
      { onConflict: "phone_e164" },
    )
    .select("phone_e164, brand_key, updated_at")
    .single();

  if (error || !data) {
    console.error("[yellow-jersey-phone-routes] ash upsert failed:", error?.message);
    throw new Error("We could not set up messaging. Try again shortly.");
  }

  const releasedHumanMode = await releaseAshStorefrontHumanMode(
    supabase,
    phoneE164,
    botNumber,
  );

  if (releasedHumanMode) {
    const { error: mirrorError } = await supabase
      .from("store_nest_conversations")
      .update({ human_mode_active: false })
      .eq("participant_handle", phoneE164);

    if (mirrorError) {
      console.warn(
        "[yellow-jersey-phone-routes] mirror human_mode_active clear failed:",
        mirrorError.message,
      );
    }
  }

  return {
    phoneE164: data.phone_e164,
    brandKey: "ash",
    updatedAt: data.updated_at,
    releasedHumanMode,
  };
}
