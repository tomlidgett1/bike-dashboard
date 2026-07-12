import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/server/get-user-profile";
import { createClient } from "@/lib/supabase/server";
import { StoreSettingsMobileGate } from "@/components/settings/store-settings-mobile-gate";

/**
 * Shared auth guard for every Storefront sub-page. Only verified bicycle stores
 * may access /settings/store/*; others are redirected.
 */
export default async function StoreSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getUserProfile();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!profile || !user) {
    redirect("/marketplace");
  }

  const isVerifiedOwner =
    profile.account_type === "bicycle_store" && profile.bicycle_store === true;
  const { data: membership } = isVerifiedOwner
    ? { data: null }
    : await supabase
        .from("store_memberships")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

  if (!isVerifiedOwner && !membership) {
    redirect("/marketplace/settings");
  }

  return <StoreSettingsMobileGate>{children}</StoreSettingsMobileGate>;
}
