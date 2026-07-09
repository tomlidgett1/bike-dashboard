"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Tags, Restart, Sparkles } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import type { SpecialsConfig, SpecialsCycleWithItems } from "@/lib/types/specials";
import { SpecialsCycleCard } from "@/components/settings/specials/specials-cycle-card";
import { SpecialsAddProductDialog } from "@/components/settings/specials/specials-add-product-dialog";

export function SpecialsCyclesView({
  config,
  cycles,
  busy,
  onChanged,
  onRefresh,
}: {
  config: SpecialsConfig;
  cycles: SpecialsCycleWithItems[];
  busy: boolean;
  onChanged: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [working, setWorking] = React.useState(false);
  const [addCycleId, setAddCycleId] = React.useState<string | null>(null);
  const [opError, setOpError] = React.useState<string | null>(null);

  const run = React.useCallback(
    async (fn: () => Promise<Response>) => {
      setWorking(true);
      setOpError(null);
      try {
        const res = await fn();
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Something went wrong");
        }
        await onChanged();
      } catch (err) {
        setOpError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setWorking(false);
      }
    },
    [onChanged],
  );

  const handleRemove = (cycleId: string, productId: string) =>
    run(() =>
      fetch(
        `/api/store/specials/items?cycleId=${encodeURIComponent(cycleId)}&productId=${encodeURIComponent(productId)}`,
        { method: "DELETE" },
      ),
    );

  const handleReorder = (cycleId: string, order: string[]) =>
    run(() =>
      fetch("/api/store/specials/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId, order }),
      }),
    );

  const handleSetDiscount = (cycleId: string, productId: string, pct: number) =>
    run(() =>
      fetch("/api/store/specials/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId, discounts: [{ productId, discountPercent: pct }] }),
      }),
    );

  const handleRegenerate = (cycleId: string) =>
    run(() =>
      fetch("/api/store/specials/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate", cycleId }),
      }),
    );

  const handleAdd = (cycleId: string, productId: string) =>
    run(() =>
      fetch("/api/store/specials/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId, productId }),
      }),
    );

  // Not enabled yet.
  if (!config.is_enabled) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <Tags className="mx-auto mb-3 size-7 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">Specials carousel is off</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Turn it on in the Schedule tab to start building auto-rotating specials. You&apos;ll
          then preview the next few cycles here.
        </p>
      </div>
    );
  }

  // Enabled but pipeline empty.
  if (cycles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <Sparkles className="mx-auto mb-3 size-7 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">No cycles yet</p>
        <p className="mx-auto mt-1 mb-4 max-w-md text-sm text-muted-foreground">
          Generate the first set of specials from your Lightspeed inventory and sales history.
        </p>
        <Button onClick={onRefresh} disabled={busy || working} className="rounded-full">
          <Restart className={cn("size-4", (busy || working) && "animate-spin")} /> Generate specials
        </Button>
      </div>
    );
  }

  const addCycle = cycles.find((c) => c.id === addCycleId) ?? null;

  return (
    <div className="space-y-4">
      {opError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {opError}
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Showing the live cycle and the next few rotations. Pricing is computed from each
        product&apos;s margin and sell-through; edit anything you like.
      </p>

      {cycles.map((cycle) => (
        <SpecialsCycleCard
          key={cycle.id}
          cycle={cycle}
          config={config}
          busy={busy || working}
          onAddProduct={setAddCycleId}
          onRemove={handleRemove}
          onReorder={handleReorder}
          onSetDiscount={handleSetDiscount}
          onRegenerate={handleRegenerate}
        />
      ))}

      <SpecialsAddProductDialog
        open={!!addCycle}
        cycleId={addCycle?.id ?? null}
        onClose={() => setAddCycleId(null)}
        onAdd={async (cycleId, productId) => {
          await handleAdd(cycleId, productId);
        }}
      />
    </div>
  );
}
