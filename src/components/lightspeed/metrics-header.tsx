"use client";

import * as React from "react";
import { Package, Clock, RefreshCw } from "lucide-react";
import Image from "next/image";
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
      <div className="px-6 py-4">
        <div className="flex items-center justify-between gap-6">
          {/* Left: Logo and Account Info */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white border border-gray-200 dark:border-gray-700 flex-shrink-0 overflow-hidden">
              <Image src="/ls.png" alt="Lightspeed" width={40} height={40} className="object-contain" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">{accountName}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-muted-foreground">
                  ID: {accountId}
                </p>
                <span className="text-xs text-muted-foreground">•</span>
                <Badge
                  variant="secondary"
                  className="rounded-md bg-transparent text-gray-700 dark:text-gray-300 h-5 px-2"
                >
                  <span className="mr-1.5 h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-xs">Connected</span>
                </Badge>
              </div>
            </div>
          </div>

          {/* Right: Metrics and Actions */}
          <div className="flex items-center gap-4">
            {/* Inline Metrics */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">In Lightspeed:</span>
                <span className="font-semibold">{totalProducts.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">On Marketplace:</span>
                <span className="font-semibold text-green-600">{totalSynced.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Not Synced:</span>
                <span className="font-semibold text-blue-600">{totalNotSynced.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground text-xs">{formatLastSync(lastSyncTime)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 border-l border-gray-200 dark:border-gray-800 pl-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="rounded-md h-8"
              >
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onDisconnect}
                className="rounded-md h-8"
              >
                Disconnect
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

