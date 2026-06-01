"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2, ShieldCheck } from "lucide-react";
import { Header } from "@/components/layout";
import { StoreOptimizer } from "@/components/optimize/store-optimizer";
import { StoreApprovalPanel } from "@/components/optimize/store-approval-panel";
import { useUserProfile } from "@/components/providers/profile-provider";
import { cn } from "@/lib/utils";

type Tab = "optimise" | "approve";

export default function OptimizePage() {
  const { profile, loading } = useUserProfile();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = React.useState<boolean | null>(null);
  const [tab, setTab] = React.useState<Tab>("optimise");

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
        description="Improve product data and approve images for the marketplace"
      />

      <div className="p-4 lg:p-6 space-y-4">
        {/* Tab bar */}
        <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1 w-fit">
          <button
            type="button"
            onClick={() => setTab("optimise")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === "optimise"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Wand2 className="h-3.5 w-3.5" />
            Optimise
          </button>
          <button
            type="button"
            onClick={() => setTab("approve")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === "approve"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Approve for Store
          </button>
        </div>

        {tab === "optimise" && <StoreOptimizer />}
        {tab === "approve" && <StoreApprovalPanel />}
      </div>
    </>
  );
}
