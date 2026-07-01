"use client";

import * as React from "react";
import { Package, ShoppingBag, Store, Tag } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";

interface StockSnapshotProps {
  productsInShop: number;
  inStockNow: number;
  onStore: number;
  notOnStore: number;
}

interface Tile {
  label: string;
  meaning: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}

export function StockSnapshot({ productsInShop, inStockNow, onStore, notOnStore }: StockSnapshotProps) {
  const tiles: Tile[] = [
    { label: "Products in your shop", meaning: "Everything in your till system", value: productsInShop, icon: Package },
    { label: "In stock now", meaning: "At least 1 on the shelf", value: inStockNow, icon: Tag },
    { label: "On your store", meaning: "Showing in your online store", value: onStore, icon: Store, accent: "text-green-600 dark:text-green-500" },
    { label: "Not on store yet", meaning: "In your till, not online", value: notOnStore, icon: ShoppingBag },
  ];

  return (
    <section>
      <h2 className="mb-2 px-0.5 text-base font-semibold text-foreground">Your shop, at a glance</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div key={tile.label} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">{tile.label}</span>
              </div>
              <div className={cn("mt-2 text-2xl font-semibold tabular-nums text-foreground", tile.accent)}>
                {tile.value.toLocaleString()}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{tile.meaning}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
