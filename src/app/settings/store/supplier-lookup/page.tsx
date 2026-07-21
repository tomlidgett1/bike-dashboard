import { Suspense } from "react";
import { SupplierLookupPageClient } from "@/components/settings/supplier-lookup-page-client";
import { DashboardHomeRouteSkeleton } from "@/components/settings/dashboard-route-skeletons";

export const dynamic = "force-dynamic";

export default function SupplierLookupPage() {
  return (
    <Suspense fallback={<DashboardHomeRouteSkeleton />}>
      <SupplierLookupPageClient />
    </Suspense>
  );
}
