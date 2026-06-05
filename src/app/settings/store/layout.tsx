import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared auth guard for every Storefront sub-page. Only verified bicycle stores
 * may access /settings/store/*; others are redirected.
 */
export default async function StoreSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/marketplace");
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("account_type, bicycle_store")
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.account_type !== "bicycle_store" ||
    profile.bicycle_store !== true
  ) {
    redirect("/marketplace/settings");
  }

  return <>{children}</>;
}
