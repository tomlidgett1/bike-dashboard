"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";

type TelemetryEvent = {
  metric: "lcp" | "inp" | "cls" | "route";
  value: number;
  route: string;
  customerId: string | null;
  requestId: string | null;
  measuredAt: string;
  metadata: Record<string, string | number | boolean | null>;
};

function sendTelemetry(event: TelemetryEvent) {
  const body = JSON.stringify({ events: [event] });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/store/crm/telemetry",
      new Blob([body], { type: "application/json" }),
    );
    return;
  }
  void fetch("/api/store/crm/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  });
}

export function CrmPerformanceReporter() {
  const pathname = usePathname() ?? "/settings/store/crm";
  const previousRouteAt = React.useRef(0);

  useReportWebVitals((metric) => {
    const name = metric.name.toLowerCase();
    if (name !== "lcp" && name !== "inp" && name !== "cls") return;
    sendTelemetry({
      metric: name,
      value: metric.value,
      route: pathname,
      customerId: null,
      requestId: metric.id,
      measuredAt: new Date().toISOString(),
      metadata: {
        navigationType: metric.navigationType,
        delta: metric.delta,
      },
    });
  });

  React.useEffect(() => {
    const now = performance.now();
    const duration = previousRouteAt.current === 0
      ? now
      : Math.max(now - previousRouteAt.current, 0);
    previousRouteAt.current = now;
    sendTelemetry({
      metric: "route",
      value: duration,
      route: pathname,
      customerId: pathname.match(/\/customers\/([^/?]+)/)?.[1] ?? null,
      requestId: null,
      measuredAt: new Date().toISOString(),
      metadata: { navigationType: "client-route" },
    });
  }, [pathname]);

  return null;
}
