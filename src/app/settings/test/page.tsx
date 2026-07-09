"use client";

export const dynamic = "force-dynamic";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Soundwave, TestTube } from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";
import { LightspeedTestLab } from "@/components/settings/lightspeed-test-lab";

export default function LightspeedTestPage() {
  const { loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();
  const router = useRouter();
  const isAuthorized =
    profile?.account_type === "bicycle_store" && profile.bicycle_store === true;

  React.useEffect(() => {
    if (profileLoading || (authLoading && !profile)) return;

    if (!profile) {
      router.replace("/marketplace");
      return;
    }

    if (!isAuthorized) {
      router.replace("/marketplace/settings");
    }
  }, [authLoading, profileLoading, profile, isAuthorized, router]);

  if (profileLoading || (authLoading && !profile) || !profile || !isAuthorized) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <DashboardFloatingPage
      title="Test"
      icon={TestTube}
      description="Debug Lightspeed API calls, customer lookup scans, and connection state."
      actions={
        <Button variant="outline" size="sm" className="rounded-full" asChild>
          <Link href="/settings/store/test-tom">
            <Soundwave className="size-4" />
            Test Tom
          </Link>
        </Button>
      }
      flush
    >
      <div className="p-4 md:p-5">
        <LightspeedTestLab />
      </div>
    </DashboardFloatingPage>
  );
}
