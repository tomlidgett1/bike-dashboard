"use client";

export const dynamic = "force-dynamic";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/dashboard";
import { HeroImageWorkspace } from "@/components/optimize/hero-images/hero-image-workspace";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";

export default function HeroImagesPage() {
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
    const authorized = profile.account_type === "bicycle_store" && profile.bicycle_store === true;
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
    <PageContainer size="wide">
      <button
        type="button"
        onClick={() => router.push("/optimize")}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Optimise
      </button>
      <PageHeader
        title="Smart product photos"
        description="An advanced image pipeline: harvests from multiple searches incl. official brand sites, measures every image, removes zoomed/cropped duplicates, then uses AI to lock a hero and supporting gallery."
      />
      <div className="mt-6 min-w-0">
        <HeroImageWorkspace />
      </div>
    </PageContainer>
  );
}
