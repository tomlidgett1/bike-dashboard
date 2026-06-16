"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Package, RefreshCw, Zap } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SyncProgressModal } from "@/components/lightspeed/sync-progress-modal";
import { useLightspeedSseSync } from "@/lib/hooks/use-lightspeed-sse-sync";
import type { NotSyncedLightspeedProduct } from "@/lib/lightspeed/not-synced-products";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-AU").format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

type StoreOverviewLightspeedPanelProps = {
  notSynced: number;
  totalInLightspeed: number;
  products: NotSyncedLightspeedProduct[];
  listLimit: number;
  onSynced: () => void | Promise<void>;
};

export function StoreOverviewLightspeedPanel({
  notSynced,
  totalInLightspeed,
  products,
  listLimit,
  onSynced,
}: StoreOverviewLightspeedPanelProps) {
  const {
    modalOpen,
    status,
    progress,
    phase,
    message,
    result,
    error,
    syncingItemId,
    runSync,
    closeModal,
  } = useLightspeedSseSync(onSynced);

  const [syncingAll, setSyncingAll] = React.useState(false);
  const remaining = Math.max(0, notSynced - products.length);

  const handleSyncAll = async () => {
    if (products.length === 0) return;
    setSyncingAll(true);
    await runSync({ itemIds: products.map((p) => p.itemId) });
    setSyncingAll(false);
  };

  const handleSyncOne = async (itemId: string) => {
    await runSync({ itemIds: [itemId] });
  };

  const modalResult = result
    ? {
        itemsSynced: result.itemsSynced ?? 0,
        itemsWithStock: result.itemsWithStock ?? 0,
        totalItems: result.totalItems ?? 0,
      }
    : undefined;

  return (
    <>
      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 px-6 pt-6 pb-4">
          <div className="space-y-1">
            <CardTitle className="font-heading text-base">Lightspeed — not synced</CardTitle>
            <CardDescription>
              {formatNumber(notSynced)} of {formatNumber(totalInLightspeed)} Lightspeed products are
              not on your marketplace yet.
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {products.length > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={handleSyncAll}
                disabled={syncingAll || syncingItemId !== null}
              >
                {syncingAll ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Sync all shown
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href="/connect-lightspeed">Manage sync</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {products.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              Everything in Lightspeed is synced to your catalogue.
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {products.map((product) => {
                const isSyncing = syncingItemId === product.itemId;
                return (
                  <li
                    key={product.itemId}
                    className="flex items-center gap-3 px-6 py-3.5"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {product.sku ? `SKU ${product.sku}` : "No SKU"}
                        {product.categoryId ? ` · Category ${product.categoryId}` : ""}
                        {" · "}
                        {formatCurrency(product.price)}
                        {product.totalQoh != null ? ` · ${formatNumber(product.totalQoh)} in stock` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={isSyncing || syncingAll}
                      onClick={() => handleSyncOne(product.itemId)}
                    >
                      {isSyncing ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Zap className="size-4" />
                      )}
                      Sync
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {remaining > 0 && (
            <div className="border-t border-border/60 bg-muted/30 px-6 py-3 text-center text-xs text-muted-foreground">
              Showing {formatNumber(products.length)} of {formatNumber(notSynced)}.{" "}
              <Link href="/connect-lightspeed" className="font-medium text-foreground underline-offset-4 hover:underline">
                Open Lightspeed sync
              </Link>{" "}
              to sync the rest.
            </div>
          )}
        </CardContent>
      </Card>

      <SyncProgressModal
        isOpen={modalOpen}
        onClose={closeModal}
        status={status}
        progress={progress}
        phase={phase}
        message={message}
        result={modalResult}
        error={error}
      />
    </>
  );
}
