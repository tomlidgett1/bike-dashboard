"use client";

// Activity feed (what the machine did) + insights (what it learned).

import * as React from "react";
import {
  History,
  Lightbulb,
} from "@/components/layout/app-sidebar/dashboard-icons";
import type { LifecycleAction, LifecycleInsight, LifecycleStage } from "@/lib/crm/lifecycle/types";
import { formatDateTime, STAGE_LABELS } from "./lifecycle-shared";

const ACTION_VERBS: Record<string, string> = {
  sent: "Sent",
  skipped: "Skipped",
  expired: "Expired",
  failed: "Failed",
};

export function LifecycleActivity({
  actions,
  insights,
  movements,
}: {
  actions: LifecycleAction[];
  insights: LifecycleInsight[];
  movements: Array<{ from: LifecycleStage | null; to: LifecycleStage; count: number }>;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* Activity */}
      <div className="rounded-md border border-border/60 bg-white">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
          <History className="size-4 text-gray-600" />
          <h3 className="text-sm font-semibold">Recent activity</h3>
        </div>
        <div className="px-4 py-3">
          {movements.length > 0 ? (
            <div className="mb-3 border-b border-border/40 pb-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Stage movement this week
              </p>
              <ul className="mt-1.5 space-y-1">
                {movements.map((movement, index) => (
                  <li key={index} className="text-xs tabular-nums text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {movement.count.toLocaleString()}
                    </span>{" "}
                    customer{movement.count === 1 ? "" : "s"} moved{" "}
                    {movement.from ? STAGE_LABELS[movement.from] : "in"} →{" "}
                    {STAGE_LABELS[movement.to]}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {actions.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Nothing sent yet — activity appears here once programs start running.
            </p>
          ) : (
            <ul className="space-y-2">
              {actions.map((action) => (
                <li key={action.id} className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {ACTION_VERBS[action.status] ?? action.status}
                  </span>{" "}
                  “{action.subject}” to {action.contact_count.toLocaleString()}{" "}
                  {STAGE_LABELS[action.stage].toLowerCase()} customer
                  {action.contact_count === 1 ? "" : "s"}
                  {action.status === "failed" && action.status_detail
                    ? ` — ${action.status_detail}`
                    : ""}{" "}
                  <span className="text-muted-foreground/70">
                    · {formatDateTime(action.executed_at ?? action.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Insights */}
      <div className="rounded-md border border-border/60 bg-white">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
          <Lightbulb className="size-4 text-gray-600" />
          <h3 className="text-sm font-semibold">What the engine has learned</h3>
        </div>
        <div className="px-4 py-3">
          {insights.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Lessons appear once results mature — each send is measured against its control
              group, and the takeaway feeds the next email.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {insights.map((insight) => (
                <li key={insight.id}>
                  <p className="text-xs font-medium text-foreground">{insight.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {insight.detail}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
