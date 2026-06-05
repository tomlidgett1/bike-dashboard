"use client";

import * as React from "react";
import { useTheme } from "next-themes";

/**
 * Keeps html/body on a light canvas while public marketplace or store-dashboard
 * shells are mounted — prevents dark system theme from showing black on overscroll.
 */
export function ForceLightChrome({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme();

  React.useEffect(() => {
    const html = document.documentElement;
    html.classList.remove("dark");
    html.classList.add("light");
    html.style.colorScheme = "light";
    setTheme("light");

    return () => {
      html.classList.remove("light");
      html.style.colorScheme = "";
    };
  }, [setTheme]);

  return <>{children}</>;
}
