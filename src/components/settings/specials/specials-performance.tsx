"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Eye, Chart2, Box, Restart, Bag } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import type { SpecialsAnalyticsSummary } from "@/lib/types/specials";
import { formatMoney } from "@/components/settings/specials/format";

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon size={15} className="text-gray-400" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

export function SpecialsPerformance({
  analytics,
  onReload,
}: {
  analytics: SpecialsAnalyticsSummary | null;
  onReload: () => Promise<void>;
}) {
  const [reloading, setReloading] = React.useState(false);

  const reload = async () => {
    setReloading(true);
    try {
      await onReload();
    } finally {
      setReloading(false);
    }
  };

  if (!analytics) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading performance…</p>;
  }

  const hasData = analytics.products.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Views and clicks for each product while it featured in a specials cycle.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="rounded-md"
          onClick={reload}
          disabled={reloading}
        >
          <Restart className={cn("size-4", reloading && "animate-spin")} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Eye} label="Views" value={analytics.total_impressions.toLocaleString()} />
        <StatCard icon={Chart2} label="Clicks" value={analytics.total_clicks.toLocaleString()} />
        <StatCard icon={Bag} label="Add to cart" value={analytics.total_add_to_cart.toLocaleString()} />
        <StatCard icon={Chart2} label="Click rate" value={`${analytics.ctr}%`} />
      </div>

      {!hasData ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <Chart2 className="mx-auto mb-2 size-6 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No views yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Once shoppers see your specials carousel, per-product views and clicks will appear
            here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Sale price</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Add to cart</TableHead>
                <TableHead className="text-right">CTR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analytics.products.map((p) => (
                <TableRow key={`${p.cycle_id}:${p.product_id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                        {p.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Box size={14} className="text-muted-foreground/40" />
                          </div>
                        )}
                      </div>
                      <span className="truncate max-w-[240px] text-sm font-medium text-foreground">
                        {p.display_name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">#{p.cycle_index + 1}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    -{Math.round(p.discount_percent)}%
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatMoney(p.sale_price)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{p.impressions.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{p.clicks.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{p.add_to_cart.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{p.ctr}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
