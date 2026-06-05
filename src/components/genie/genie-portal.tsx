"use client";

import { usePathname } from "next/navigation";
import { GeniePanel } from "./genie-panel";
import { GenieButton } from "./genie-button";

const HIDDEN_ON = ["/login"];
const STORE_PAGE_PREFIX = "/marketplace/store/";
const STORE_SETTINGS_PREFIX = "/settings/store";

export function GeniePortal() {
  const pathname = usePathname();
  if (HIDDEN_ON.some((p) => pathname?.startsWith(p))) return null;

  const isStorePage = pathname?.startsWith(STORE_PAGE_PREFIX) ?? false;
  const isStoreSettingsPage = pathname?.startsWith(STORE_SETTINGS_PREFIX) ?? false;
  const showFloatingButton = !isStorePage && !isStoreSettingsPage;

  // Hidden on mobile for now — desktop only. `display:none` on this wrapper
  // also hides the fixed-position button/panel beneath it.
  return (
    <div className={isStorePage || isStoreSettingsPage ? "block" : "hidden sm:block"}>
      <GeniePanel />
      {showFloatingButton && <GenieButton />}
    </div>
  );
}
