"use client";

export const dynamic = "force-dynamic";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Truck } from "lucide-react";
import { PageContainer, PageHeader, PageBody, SettingsSection } from "@/components/dashboard";
import { StoreUberManager } from "@/components/settings/store-uber-manager";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";

export default function UberSettingsPage() {
  const { user } = useAuth();
  const { profile, loading } = useUserProfile();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (loading) return;

    if (!user || !profile) {
      router.replace("/marketplace");
      return;
    }

    const authorized = profile.account_type === "bicycle_store" && profile.bicycle_store === true;
    if (!authorized) {
      router.replace("/marketplace/settings");
      return;
    }

    setIsAuthorized(true);
  }, [loading, profile, router, user]);

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
        title="Uber Direct"
        description="Offer same-day local delivery on your storefront."
      />
      <PageBody>
        <SettingsSection
          title="Uber delivery"
          description="Choose products and SMS recipients for Uber Express orders."
          icon={Truck}
        >
          <StoreUberManager />
        </SettingsSection>
      </PageBody>
    </PageContainer>
  );
}
