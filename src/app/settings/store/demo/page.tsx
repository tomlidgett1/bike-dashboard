import { Suspense } from "react";
import { DemoProductPageBuilder } from "@/components/demo/demo-product-page-builder";
import { DashboardHomeRouteSkeleton } from "@/components/settings/dashboard-route-skeletons";

export const dynamic = "force-dynamic";

export default function StoreDemoPage() {
  return (
    <Suspense fallback={<DashboardHomeRouteSkeleton />}>
      <DemoProductPageBuilder />
    </Suspense>
  );
}
