"use client";

export const dynamic = "force-dynamic";

import * as React from "react";
import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MagicStick3 } from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { OptimiseTabPanel } from "@/components/optimize/optimise-tab-panel";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";

export default function OptimizePage() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (authLoading || profileLoading) return;

    if (!user || !profile) {
      router.replace("/marketplace");
      return;
    }

    const authorized =
      profile.account_type === "bicycle_store" && profile.bicycle_store === true;

    if (!authorized) {
      router.replace("/marketplace/settings");
    } else {
      setIsAuthorized(true);
    }
  }, [authLoading, profile, profileLoading, router, user]);

  if (authLoading || profileLoading || isAuthorized === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <DashboardFloatingPage
      title="Product Optimise"
      icon={MagicStick3}
      description="Choose catalogue, private listings, or CSV — then follow a simple step-by-step flow to optimise copy and photos."
      flush
    >
      <div className="p-4 md:p-5">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-7 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <OptimiseTabPanel />
        </Suspense>
      </div>
    </DashboardFloatingPage>
  );
}
