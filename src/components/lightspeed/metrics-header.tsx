"use client";

import * as React from "react";
import { Store, Package, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface MetricsHeaderProps {
  accountName: string;
  accountId: string;
  totalProducts: number;
  totalStock: number;
  totalSynced?: number;
  totalNotSynced?: number;
  lastSyncTime: Date | null;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onDisconnect?: () => void;
}

export function MetricsHeader({
  accountName,
  accountId,
  totalProducts,
  totalStock,
  totalSynced = 0,
  totalNotSynced = 0,
  lastSyncTime,
  isRefreshing,
  onRefresh,
  onDisconnect,
}: MetricsHeaderProps) {
  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Never';
    
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className="bg-white dark:bg-card border-b border-gray-200 dark:border-gray-800">
      <div className="px-6 py-6">
        <div className="flex items-start justify-between gap-6">
          {/* Left: Account Info */}
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-secondary flex-shrink-0">
              <Store className="h-6 w-6 text-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">{accountName}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Account ID: {accountId}
              </p>
              <Badge
                variant="secondary"
                className="mt-2 rounded-md bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              >
                <span className="mr-1.5 h-2 w-2 rounded-full bg-green-500" />
                Connected
              </Badge>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="rounded-md"
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", isRefreshing && "animate-spin")} />
              Refresh All Data
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDisconnect}
              className="rounded-md"
            >
              Disconnect
            </Button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-4 gap-4">
          {/* Total Products in Lightspeed */}
          <div className="rounded-md bg-gray-50 dark:bg-gray-900 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                In Lightspeed
              </span>
            </div>
            <div className="text-3xl font-semibold">
              {totalProducts.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {totalStock.toLocaleString()} total stock
            </div>
          </div>

          {/* Synced to Marketplace */}
          <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">
                On Marketplace
              </span>
            </div>
            <div className="text-3xl font-semibold text-green-900 dark:text-green-400">
              {totalSynced.toLocaleString()}
            </div>
            <div className="text-xs text-green-600 dark:text-green-400 mt-1">
              Live and selling
            </div>
          </div>

          {/* Not Synced Yet */}
          <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                Not Synced Yet
              </span>
            </div>
            <div className="text-3xl font-semibold text-blue-900 dark:text-blue-400">
              {totalNotSynced.toLocaleString()}
            </div>
            <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Ready to sync
            </div>
          </div>

          {/* Last Sync */}
          <div className="rounded-md bg-gray-50 dark:bg-gray-900 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Last Synced
              </span>
            </div>
            <div className="text-3xl font-semibold">
              {formatLastSync(lastSyncTime)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

