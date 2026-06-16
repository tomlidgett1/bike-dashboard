"use client";

import * as React from "react";

export const DASHBOARD_HEADER_BG_DEFAULT = "#f3f0eb";

const HEADER_CONTROL_VARS = {
  "--dashboard-header-fg": "rgba(17, 24, 39, 0.92)",
  "--dashboard-header-control-bg": "#ffffff",
  "--dashboard-header-control-border": "rgba(0, 0, 0, 0.16)",
  "--dashboard-header-control-fg": "#171717",
  "--dashboard-header-control-hover-bg": "rgba(0, 0, 0, 0.05)",
  "--dashboard-header-control-hover-fg": "#000000",
  "--dashboard-header-control-active-bg": "rgba(0, 0, 0, 0.08)",
  "--dashboard-header-logo-filter": "none",
} as const;

function getHeaderColorTargets(): HTMLElement[] {
  const targets = new Set<HTMLElement>([document.documentElement]);
  document
    .querySelectorAll<HTMLElement>(".dashboard-shell, .dashboard-header")
    .forEach((element) => targets.add(element));
  return [...targets];
}

export function applyDashboardHeaderColor(color: string = DASHBOARD_HEADER_BG_DEFAULT) {
  document.documentElement.setAttribute("data-dashboard-header-tone", "light");
  document.documentElement.removeAttribute(
    "data-dashboard-header-force-white-controls",
  );

  for (const target of getHeaderColorTargets()) {
    target.style.setProperty("--dashboard-header-bg", color);
    for (const [key, value] of Object.entries(HEADER_CONTROL_VARS)) {
      target.style.setProperty(key, value);
    }
  }
}

export function DashboardHeaderColorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  React.useLayoutEffect(() => {
    applyDashboardHeaderColor(DASHBOARD_HEADER_BG_DEFAULT);
  }, []);

  return <>{children}</>;
}
