"use client";

import { usePathname } from "next/navigation";
import { GeniePanel } from "./genie-panel";
import { GenieButton } from "./genie-button";

const HIDDEN_ON = ["/login"];

export function GeniePortal() {
  const pathname = usePathname();
  if (HIDDEN_ON.some((p) => pathname?.startsWith(p))) return null;
  return (
    <>
      <GeniePanel />
      <GenieButton />
    </>
  );
}
