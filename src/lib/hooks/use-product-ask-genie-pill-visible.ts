"use client";

import * as React from "react";
import { useGenie } from "@/components/providers/genie-provider";

export const PRODUCT_ASK_GENIE_SCROLL_THRESHOLD_PX = 96;

/** Matches Tailwind `sm` — pill uses `sm:hidden`, so only visible below 640px. */
const PILL_MOBILE_MAX_WIDTH_PX = 639;

export function useProductAskGeniePillVisible(productId: string) {
  const { isOpen, productContext } = useGenie();
  const panelOpen = isOpen && productContext?.id === productId;
  const [hasScrolled, setHasScrolled] = React.useState(false);
  const [isPillViewport, setIsPillViewport] = React.useState(false);

  React.useEffect(() => {
    const updateScroll = () => {
      setHasScrolled(window.scrollY > PRODUCT_ASK_GENIE_SCROLL_THRESHOLD_PX);
    };

    const updateViewport = () => {
      setIsPillViewport(window.innerWidth <= PILL_MOBILE_MAX_WIDTH_PX);
    };

    updateScroll();
    updateViewport();

    window.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("resize", updateViewport);

    return () => {
      window.removeEventListener("scroll", updateScroll);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  const pillVisible = isPillViewport && hasScrolled && !panelOpen;

  return { pillVisible, panelOpen, hasScrolled, isPillViewport };
}
