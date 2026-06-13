"use client";

import * as React from "react";

const MOBILE_KEYBOARD_THRESHOLD_PX = 80;

export type MobileSheetViewport = {
  top: number;
  bottom: number;
  height: number;
  keyboardOpen: boolean;
};

export function useMobileSheetViewport(active: boolean) {
  const [metrics, setMetrics] = React.useState<MobileSheetViewport>({
    top: 0,
    bottom: 0,
    height: 0,
    keyboardOpen: false,
  });
  const refreshRef = React.useRef<() => void>(() => {});

  React.useEffect(() => {
    if (!active || typeof window === "undefined") return;

    const update = () => {
      const layoutHeight = window.innerHeight;
      const vv = window.visualViewport;

      if (!vv) {
        setMetrics({
          top: 0,
          bottom: 0,
          height: layoutHeight,
          keyboardOpen: false,
        });
        return;
      }

      const bottomInset = Math.max(0, layoutHeight - vv.height - vv.offsetTop);
      setMetrics({
        top: vv.offsetTop,
        bottom: bottomInset,
        height: vv.height,
        keyboardOpen: bottomInset > MOBILE_KEYBOARD_THRESHOLD_PX,
      });
    };

    refreshRef.current = update;
    update();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);

    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
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
  return viewport.keyboardOpen
    ? viewport.height
    : Math.round(viewport.height * heightRatio);
}
