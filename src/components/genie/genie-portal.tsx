"use client";

import { usePathname } from "next/navigation";
import { isStoreDashboardPath } from "@/lib/routes/store-dashboard";
import { GeniePanel } from "./genie-panel";
import { ProductGeniePanel } from "./product-genie-panel";
import { GenieButton } from "./genie-button";
import { useGenie } from "@/components/providers/genie-provider";

const HIDDEN_ON = ["/login"];
const STORE_PAGE_PREFIX = "/marketplace/store/";

export function GeniePortal() {
  const pathname = usePathname();
  const { productContext } = useGenie();

  if (HIDDEN_ON.some((p) => pathname?.startsWith(p))) return null;

  const isStorePage = pathname?.startsWith(STORE_PAGE_PREFIX) ?? false;
  const isStoreDashboard = isStoreDashboardPath(pathname);
  const showFloatingButton = !isStorePage && !isStoreDashboard && !productContext;

  // Dashboard uses the topbar Agent control; marketplace store pages hide the orb too.
  // Product Q&A must work on mobile when opened from a listing.
  const showOnMobile = isStorePage || isStoreDashboard || Boolean(productContext);

  return (
    <div className={showOnMobile ? "block" : "hidden sm:block"}>
      {productContext ? <ProductGeniePanel /> : <GeniePanel />}
      {showFloatingButton && <GenieButton />}
    </div>
  );
}
