"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { Bike } from "lucide-react";
import { PageContainer, PageHeader, PageBody, SettingsSection } from "@/components/dashboard";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";

const StoreRentalsManager = nextDynamic(
  () => import("@/components/settings/store-rentals-manager").then((mod) => mod.StoreRentalsManager),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-56" /> }
);

export default function StoreRentalsPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Rentals"
        description="Add hire products, respond to booking requests, and manage your rental calendar."
      />
      <PageBody>
        <SettingsSection
          title="Rentals"
          description="Add hire products, manage booking requests, and block out dates on the calendar."
          icon={Bike}
        >
          <StoreRentalsManager />
        </SettingsSection>
      </PageBody>
    </PageContainer>
  );
}
