"use client";

import { usePathname } from "next/navigation";
import { GeniePanel } from "./genie-panel";
import { GenieButton } from "./genie-button";

const HIDDEN_ON = ["/login"];

export function GeniePortal() {
  const pathname = usePathname();
  if (HIDDEN_ON.some((p) => pathname?.startsWith(p))) return null;
  // Hidden on mobile for now — desktop only. `display:none` on this wrapper
  // also hides the fixed-position button/panel beneath it.
  return (
    <div className="hidden sm:block">
      <GeniePanel />
      <GenieButton />
    </div>
  );
}
