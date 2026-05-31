"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/layout";
import { StoreOptimizer } from "@/components/optimize/store-optimizer";
import { useUserProfile } from "@/components/providers/profile-provider";

export default function OptimizePage() {
  const { profile, loading } = useUserProfile();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (!loading) {
      if (!profile) {
        router.replace('/marketplace');
        return;
      }

      const authorized =
        profile.account_type === 'bicycle_store' && profile.bicycle_store === true;

      if (!authorized) {
        router.replace('/marketplace/settings');
      } else {
        setIsAuthorized(true);
      }
    }
  }, [profile, loading, router]);

  if (loading || isAuthorized === null) {
    return (
      <>
        <Header
          title="Optimize"
          description="Source images, titles, descriptions and specs across a category"
        />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Optimize"
        description="Source images, titles, descriptions and specs across a category"
      />

      <div className="p-4 lg:p-6">
        <StoreOptimizer />
      </div>
    </>
  );
}
