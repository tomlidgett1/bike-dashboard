import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/server/get-user-profile";
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

  if (!profile) {
    redirect("/marketplace");
  }

  if (
    profile.account_type !== "bicycle_store" ||
    profile.bicycle_store !== true
  ) {
    redirect("/marketplace/settings");
  }

  return <StoreSettingsMobileGate>{children}</StoreSettingsMobileGate>;
}
