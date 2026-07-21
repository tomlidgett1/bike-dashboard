"use client";

import { usePathname } from "next/navigation";
import { isStoreDashboardPath } from "@/lib/routes/store-dashboard";
import { GeniePanel } from "./genie-panel";
import { ProductGeniePanel } from "./product-genie-panel";
import { GenieButton } from "./genie-button";
import { useGenie } from "@/components/providers/genie-provider";

const HIDDEN_ON = ["/login"];
const MARKETPLACE_HOME = "/marketplace";
const STORE_PAGE_PREFIX = "/marketplace/store/";
const PRODUCT_PAGE_PREFIX = "/marketplace/product/";

export function GeniePortal() {
  const pathname = usePathname();
  const { productContext } = useGenie();

  if (HIDDEN_ON.some((p) => pathname?.startsWith(p))) return null;

  const isStorePage = pathname?.startsWith(STORE_PAGE_PREFIX) ?? false;
  const isProductPage = pathname?.startsWith(PRODUCT_PAGE_PREFIX) ?? false;
  const isStoreDashboard = isStoreDashboardPath(pathname);
  const showFloatingButton =
    !isStorePage &&
    !isStoreDashboard &&
    !productContext &&
    !isProductPage &&
    pathname !== MARKETPLACE_HOME;

  // Dashboard uses the topbar Agent control; marketplace store pages hide the orb too.
  // Product Q&A must work on mobile when opened from a listing.
  const showOnMobile = isStorePage || isStoreDashboard || Boolean(productContext) || isProductPage;

  return (
    <div className={showOnMobile ? "block" : "hidden sm:block"}>
      {productContext && !isProductPage ? <ProductGeniePanel /> : !productContext ? <GeniePanel /> : null}
      {showFloatingButton && <GenieButton />}
    </div>
  );
}
