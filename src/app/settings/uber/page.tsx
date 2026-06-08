"use client";

export const dynamic = "force-dynamic";

import * as React from "react";
import nextDynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Loader2, Package, Settings2 } from "lucide-react";
import { PageContainer, PageHeader, PageBody } from "@/components/dashboard";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";
import { cn } from "@/lib/utils";
import type { UberTab } from "@/components/settings/store-uber-manager";

const StoreUberManager = nextDynamic(
  () => import("@/components/settings/store-uber-manager").then((mod) => mod.StoreUberManager),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-64" /> }
);

export default function UberSettingsPage() {
  const { loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<UberTab>("products");
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
    <PageContainer size="wide">
      <PageHeader
        title="Uber Direct"
        description="Offer same-day local delivery on your storefront."
      />
      <PageBody>
        <div className="mb-4 flex items-center rounded-md bg-gray-100 p-0.5 w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("products")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "products"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <Package size={15} />
            Products
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "settings"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Settings
          </button>
        </div>

        <StoreUberManager activeTab={activeTab} />
      </PageBody>
    </PageContainer>
  );
}
