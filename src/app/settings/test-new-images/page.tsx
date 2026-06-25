"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Gallery, Loader2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";
import { TestGoogleImagesLab } from "@/components/settings/test-google-images-lab";

export default function TestNewImagesPage() {
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
      title="Test new images"
      icon={Gallery}
      description="Search Google Images via SearchAPI and preview results."
      flush
    >
      <div className="p-4 md:p-5">
        <TestGoogleImagesLab />
      </div>
    </DashboardFloatingPage>
  );
}
