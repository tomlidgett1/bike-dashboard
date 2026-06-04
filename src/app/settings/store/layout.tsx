"use client";

export const dynamic = "force-dynamic";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useUserProfile } from "@/components/providers/profile-provider";

/**
 * Shared auth guard for every Storefront sub-page. Only verified bicycle stores
 * may access /settings/store/*; others are redirected.
 */
export default function StoreSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, loading } = useUserProfile();
  const router = useRouter();
  const [authorized, setAuthorized] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (loading) return;
    if (!profile) {
      router.replace("/marketplace");
      return;
    }
    const ok =
      profile.account_type === "bicycle_store" && profile.bicycle_store === true;
    if (!ok) {
      router.replace("/marketplace/settings");
      return;
    }
    setAuthorized(true);
  }, [profile, loading, router]);

  if (loading || authorized === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
