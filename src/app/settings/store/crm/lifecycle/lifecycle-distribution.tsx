"use client";

// Customer base distribution: proportional bar + stage cards with 7-day
// movement, and a drill-in dialog listing a stage's members.

import * as React from "react";
import { AltArrowDown, AltArrowUp, Loader2 } from "@/components/layout/app-sidebar/dashboard-icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  LifecycleStage,
  LifecycleStageDistribution,
  LifecycleThresholds,
} from "@/lib/crm/lifecycle/types";
import {
  formatMoney,
  formatShortDate,
  STAGE_BAR_SHADES,
  STAGE_DESCRIPTIONS,
  STAGE_LABELS,
  STAGE_ORDER,
  STAGE_PLAIN,
} from "./lifecycle-shared";

type StageMember = {
  contact_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  total_spend: number;
  sale_count: number;
  last_purchase_at: string | null;
  entered_at: string;
  opted_out: boolean;
};

export function LifecycleDistribution({
  distribution,
  thresholds,
}: {
  distribution: LifecycleStageDistribution[];
  thresholds: LifecycleThresholds;
}) {
  const [openStage, setOpenStage] = React.useState<LifecycleStage | null>(null);
  const [members, setMembers] = React.useState<StageMember[]>([]);
  const [memberTotal, setMemberTotal] = React.useState(0);
  const [loadingMembers, setLoadingMembers] = React.useState(false);

  const byStage = new Map(distribution.map((d) => [d.stage, d]));
  const ordered = STAGE_ORDER.map((stage) => byStage.get(stage)).filter(
    (d): d is LifecycleStageDistribution => Boolean(d),
  );
  const total = ordered.reduce((sum, d) => sum + d.count, 0);

  const openMembers = async (stage: LifecycleStage) => {
    setOpenStage(stage);
    setLoadingMembers(true);
    setMembers([]);
    try {
      const res = await fetch(`/api/store/crm/lifecycle/stages/${stage}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members ?? []);
        setMemberTotal(data.total ?? 0);
      }
    } finally {
      setLoadingMembers(false);
    }
  };

  const thresholdHint = (stage: LifecycleStage): string => {
    switch (stage) {
      case "new":
        return `First purchase within ${thresholds.new_days} days`;
      case "active":
        return `Purchased within ${thresholds.active_days} days`;
      case "vip":
        return `Active and ${formatMoney(thresholds.vip_min_spend)}+ lifetime`;
      case "at_risk":
        return `${thresholds.active_days}–${thresholds.at_risk_days} days since purchase`;
      case "dormant":
        return `${thresholds.at_risk_days}–${thresholds.dormant_days} days since purchase`;
      case "churned":
        return `${thresholds.dormant_days}+ days since purchase`;
      case "reactivated":
        return `Came back after drifting (${thresholds.reactivated_hold_days}-day window)`;
      case "prospect":
        return "No purchase recorded yet";
    }
  };

  return (
    <div>
      {/* Proportional bar */}
      {total > 0 ? (
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
          {ordered
            .filter((d) => d.count > 0)
            .map((d) => (
              <button
                key={d.stage}
                type="button"
                onClick={() => void openMembers(d.stage)}
                title={`${STAGE_LABELS[d.stage]} · ${d.count.toLocaleString()}`}
                className={cn(
                  "h-full transition-opacity hover:opacity-75",
                  STAGE_BAR_SHADES[d.stage],
                )}
                style={{ width: `${Math.max(1.2, (d.count / total) * 100)}%` }}
                aria-label={`${STAGE_LABELS[d.stage]}: ${d.count} customers`}
              />
            ))}
        </div>
      ) : null}

      {/* Stage cards */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ordered.map((d) => (
          <button
            key={d.stage}
            type="button"
            onClick={() => void openMembers(d.stage)}
            className="group rounded-md border border-border/60 bg-white px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-gray-50/70"
          >
            <div className="flex items-center gap-1.5">
              <span
                className={cn("size-2 shrink-0 rounded-full", STAGE_BAR_SHADES[d.stage])}
                aria-hidden
              />
              <span className="truncate text-xs font-medium text-muted-foreground">
                {STAGE_LABELS[d.stage]}
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-semibold tabular-nums text-foreground">
                {d.count.toLocaleString()}
              </span>
              {d.delta7d !== 0 ? (
                <span className="inline-flex items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground">
                  {d.delta7d > 0 ? (
                    <AltArrowUp className="size-3" />
                  ) : (
                    <AltArrowDown className="size-3" />
                  )}
                  {Math.abs(d.delta7d).toLocaleString()} this week
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
              {STAGE_PLAIN[d.stage]}
            </p>
          </button>
        ))}
      </div>

      {/* Members dialog */}
      <Dialog open={openStage !== null} onOpenChange={(open) => !open && setOpenStage(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-hidden rounded-md bg-white p-0">
          {openStage ? (
            <>
              <DialogHeader className="border-b border-border/60 px-5 py-4">
                <DialogTitle className="text-base">
                  {STAGE_LABELS[openStage]} · {memberTotal.toLocaleString()} customer
                  {memberTotal === 1 ? "" : "s"}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {STAGE_DESCRIPTIONS[openStage]} {thresholdHint(openStage)}.
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-y-auto px-5 pb-5">
                {loadingMembers ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : members.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No customers in this stage right now.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/40">
                    {members.map((member) => {
                      const name = [member.first_name, member.last_name]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <li key={member.contact_id} className="flex items-center gap-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {name || member.email}
                              {member.opted_out ? (
                                <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                                  opted out
                                </span>
                              ) : null}
                            </p>
                            {name ? (
                              <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                            <p className="font-medium text-foreground">
                              {member.total_spend > 0 ? formatMoney(member.total_spend) : "—"}
                            </p>
                            <p>
                              {member.sale_count} visit{member.sale_count === 1 ? "" : "s"} · last{" "}
                              {formatShortDate(member.last_purchase_at)}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {memberTotal > members.length && !loadingMembers ? (
                  <p className="pt-3 text-center text-xs text-muted-foreground">
                    Showing the top {members.length} by lifetime spend.
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
