"use client";

import { usePathname } from "next/navigation";
import { isStoreDashboardPath } from "@/lib/routes/store-dashboard";
import { GeniePanel } from "./genie-panel";
import { GenieButton } from "./genie-button";

const HIDDEN_ON = ["/login"];
const STORE_PAGE_PREFIX = "/marketplace/store/";

export function GeniePortal() {
  const pathname = usePathname();
  if (HIDDEN_ON.some((p) => pathname?.startsWith(p))) return null;

  const isStorePage = pathname?.startsWith(STORE_PAGE_PREFIX) ?? false;
  const isStoreDashboard = isStoreDashboardPath(pathname);
  const showFloatingButton = !isStorePage && !isStoreDashboard;

  // Dashboard uses the topbar Agent control; marketplace store pages hide the orb too.
  const showOnMobile = isStorePage || isStoreDashboard;

  return (
    <div className={showOnMobile ? "block" : "hidden sm:block"}>
      <GeniePanel />
      {showFloatingButton && <GenieButton />}
    </div>
  );
}
