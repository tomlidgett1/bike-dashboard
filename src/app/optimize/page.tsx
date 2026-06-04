"use client";

export const dynamic = "force-dynamic";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2, ShieldCheck } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/dashboard";
import { StoreOptimizer } from "@/components/optimize/store-optimizer";
import { StoreApprovalPanel } from "@/components/optimize/store-approval-panel";
import { useUserProfile } from "@/components/providers/profile-provider";
import { cn } from "@/lib/utils";

type Tab = "optimise" | "approve";

const NAV: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "optimise", label: "Optimise", icon: Wand2 },
  { id: "approve", label: "Approve for store", icon: ShieldCheck },
];

export default function OptimizePage() {
  const { profile, loading } = useUserProfile();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = React.useState<boolean | null>(null);
  const [tab, setTab] = React.useState<Tab>("optimise");

  React.useEffect(() => {
    if (!loading) {
      if (!profile) {
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
    }
  }, [profile, loading, router]);

  if (loading || isAuthorized === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Optimise"
        description="Improve product data with AI and approve images so listings go live on your storefront."
      />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
        <nav className="lg:sticky lg:top-20 lg:self-start">
          <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {NAV.map((item) => {
              const isActive = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors lg:w-full",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <item.icon
                    className={cn(
                      "size-4 shrink-0",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="min-w-0 space-y-6">
          {tab === "optimise" ? <StoreOptimizer /> : <StoreApprovalPanel />}
        </div>
      </div>
    </PageContainer>
  );
}
