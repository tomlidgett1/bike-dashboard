"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Restart,
  Sparkles,
  AltArrowUp,
  AltArrowDown,
  TrashBinTrash,
  Box,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import type { SpecialsConfig, SpecialsCycleWithItems, SpecialsCycleItemView } from "@/lib/types/specials";
import {
  formatMoney,
  formatMargin,
  formatLastSold,
  formatCycleWindow,
} from "@/components/settings/specials/format";

function DiscountCell({
  item,
  disabled,
  onCommit,
}: {
  item: SpecialsCycleItemView;
  disabled: boolean;
  onCommit: (pct: number) => void;
}) {
  const [value, setValue] = React.useState(String(Math.round(item.effective_discount_percent)));
  React.useEffect(() => {
    setValue(String(Math.round(item.effective_discount_percent)));
  }, [item.effective_discount_percent]);

  const commit = () => {
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    if (pct !== Math.round(item.effective_discount_percent)) onCommit(pct);
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        min={0}
        max={100}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-8 w-16 text-sm"
      />
      <span className="text-xs text-muted-foreground">%</span>
    </div>
  );
}

export function SpecialsCycleCard({
  cycle,
  config,
  busy,
  onAddProduct,
  onRemove,
  onReorder,
  onSetDiscount,
  onRegenerate,
}: {
  cycle: SpecialsCycleWithItems;
  config: SpecialsConfig;
  busy: boolean;
  onAddProduct: (cycleId: string) => void;
  onRemove: (cycleId: string, productId: string) => void;
  onReorder: (cycleId: string, orderedProductIds: string[]) => void;
  onSetDiscount: (cycleId: string, productId: string, pct: number) => void;
  onRegenerate: (cycleId: string) => void;
}) {
  const isActive = cycle.status === "active";
  const items = cycle.items;

  const move = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= items.length) return;
    const order = items.map((i) => i.product_id);
    [order[index], order[next]] = [order[next], order[index]];
    onReorder(cycle.id, order);
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-gray-50/70 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge
              className={cn(
                "rounded-full",
                isActive
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-100",
              )}
            >
              {isActive ? "Live now" : "Upcoming"}
            </Badge>
            {cycle.theme_label ? (
              <span className="text-sm font-semibold text-foreground">{cycle.theme_label}</span>
            ) : (
              <span className="text-sm font-semibold text-foreground">
                Cycle #{cycle.cycle_index + 1}
              </span>
            )}
            {cycle.generated_by === "ai" ? (
              <span className="inline-flex items-center gap-1 text-xs text-violet-600">
                <Sparkles size={12} /> AI curated
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatCycleWindow(cycle.starts_at, cycle.ends_at)} · {items.length} product
            {items.length === 1 ? "" : "s"}
          </p>
          {cycle.ai_rationale ? (
            <p className="mt-1 max-w-2xl text-xs italic text-muted-foreground">
              “{cycle.ai_rationale}”
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-md"
            onClick={() => onAddProduct(cycle.id)}
            disabled={busy}
          >
            <Plus className="size-4" /> Add
          </Button>
          {!isActive ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-md"
              onClick={() => onRegenerate(cycle.id)}
              disabled={busy}
            >
              <Restart className={cn("size-4", busy && "animate-spin")} /> Regenerate
            </Button>
          ) : null}
        </div>
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <Box className="mx-auto mb-2 size-6 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No products yet.{" "}
            {config.selection_mode === "manual"
              ? "Add products to build this cycle."
              : "Regenerate or add products manually."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">SOH</TableHead>
                <TableHead>Last sold</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Retail</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead className="text-right">Sale price</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell className="align-middle">
                    <div className="flex flex-col">
                      <button
                        type="button"
                        aria-label="Move up"
                        disabled={index === 0 || busy}
                        onClick={() => move(index, -1)}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <AltArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        disabled={index === items.length - 1 || busy}
                        onClick={() => move(index, 1)}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <AltArrowDown size={14} />
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image_url}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Box size={16} className="text-muted-foreground/40" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate max-w-[220px] text-sm font-medium text-foreground">
                          {item.display_name}
                        </p>
                        <div className="flex items-center gap-1.5">
                          {item.brand ? (
                            <span className="text-xs text-muted-foreground">{item.brand}</span>
                          ) : null}
                          {item.is_pinned ? (
                            <span className="text-[10px] font-medium uppercase tracking-wide text-amber-600">
                              Pinned
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.category_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {Math.round(item.soh)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatLastSold(item.days_since_sold, item.last_sold_at)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                    {item.cost > 0 ? formatMoney(item.cost) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatMoney(item.retail)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatMargin(item.margin_percent)}
                  </TableCell>
                  <TableCell>
                    <DiscountCell
                      item={item}
                      disabled={busy}
                      onCommit={(pct) => onSetDiscount(cycle.id, item.product_id, pct)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="tabular-nums">
                      <span className="text-sm font-semibold text-red-600">
                        {formatMoney(item.effective_sale_price)}
                      </span>
                      <div className="text-xs text-muted-foreground line-through">
                        {formatMoney(item.retail)}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      aria-label="Remove"
                      disabled={busy}
                      onClick={() => onRemove(cycle.id, item.product_id)}
                      className="text-muted-foreground hover:text-red-600 disabled:opacity-40"
                    >
                      <TrashBinTrash size={16} />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
