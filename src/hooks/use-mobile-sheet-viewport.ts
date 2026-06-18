"use client";

import * as React from "react";

const MOBILE_KEYBOARD_THRESHOLD_PX = 80;

export type MobileSheetViewport = {
  top: number;
  bottom: number;
  height: number;
  keyboardOpen: boolean;
};

export function useBodyScrollLock(active: boolean) {
  React.useEffect(() => {
    if (!active || typeof window === "undefined") return;

    const scrollY = window.scrollY;
    const { style } = document.body;
    const previous = {
      position: style.position,
      top: style.top,
      left: style.left,
      right: style.right,
      width: style.width,
      overflow: style.overflow,
    };

    style.position = "fixed";
    style.top = `-${scrollY}px`;
    style.left = "0";
    style.right = "0";
    style.width = "100%";
    style.overflow = "hidden";

    return () => {
      style.position = previous.position;
      style.top = previous.top;
      style.left = previous.left;
      style.right = previous.right;
      style.width = previous.width;
      style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}

export function useMobileSheetViewport(active: boolean) {
  const [metrics, setMetrics] = React.useState<MobileSheetViewport>({
    top: 0,
    bottom: 0,
    height: 0,
    keyboardOpen: false,
  });
  const refreshRef = React.useRef<() => void>(() => {});
  const baselineHeightRef = React.useRef(0);

  React.useEffect(() => {
    if (!active) {
      baselineHeightRef.current = 0;
      return;
    }
    if (typeof window === "undefined") return;

    const captureBaseline = () => {
      if (baselineHeightRef.current <= 0) {
        baselineHeightRef.current = Math.max(
          window.innerHeight,
          window.visualViewport?.height ?? 0,
        );
      }
    };

    const update = () => {
      captureBaseline();

      const layoutHeight = window.innerHeight;
      const vv = window.visualViewport;
      const vvHeight = vv?.height ?? layoutHeight;
      const vvTop = vv?.offsetTop ?? 0;
      const baseline = baselineHeightRef.current || layoutHeight;

      // Support both legacy iOS pan (bottom inset) and interactive-widget resizes-content.
      const bottomInset = Math.max(0, layoutHeight - vvHeight - vvTop);
      const heightShrink = Math.max(0, baseline - vvHeight);
      const keyboardOpen =
        bottomInset > MOBILE_KEYBOARD_THRESHOLD_PX ||
        heightShrink > MOBILE_KEYBOARD_THRESHOLD_PX;

      const effectiveBottom =
        keyboardOpen && bottomInset > MOBILE_KEYBOARD_THRESHOLD_PX ? bottomInset : 0;

      setMetrics({
        top: vvTop,
        bottom: effectiveBottom,
        height: vvHeight,
        keyboardOpen,
      });
    };

    refreshRef.current = update;
    update();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [active]);

  const refresh = React.useCallback(() => {
    refreshRef.current();
  }, []);

  return { metrics, refresh };
}

export function getMobileSheetHeight(
  viewport: MobileSheetViewport,
  heightRatio = 0.85,
): number | undefined {
  if (viewport.height <= 0) return undefined;
  if (viewport.keyboardOpen) return viewport.height;
  return Math.round(viewport.height * heightRatio);
}
