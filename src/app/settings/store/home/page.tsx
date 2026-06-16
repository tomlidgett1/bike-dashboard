import { Suspense } from "react";
import { DashboardHomeRouteSkeleton } from "@/components/settings/dashboard-route-skeletons";
import { HomeV2Chat } from "../homev2/homev2-chat";

export const dynamic = "force-dynamic";

function getTodayLabel() {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export default function StoreHomePage() {
  return (
    <Suspense fallback={<DashboardHomeRouteSkeleton />}>
      <HomeV2Chat todayLabel={getTodayLabel()} />
    </Suspense>
  );
}
