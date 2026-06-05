"use client";

import Image from "next/image";
import Link from "next/link";
import { Loader2, Zap } from "lucide-react";
import { useLightspeedConnection } from "@/lib/hooks/use-lightspeed-connection";
import { useSyncStatus } from "@/lib/hooks/use-sync-status";
import { cn } from "@/lib/utils";
import { topbarPillClass } from "./topbar-nav-pills";

export function TopbarLightspeedStatus() {
  const { isSyncing, formattedLastSync } = useSyncStatus();
  const { isConnected: lightspeedConnected, isLoading: lightspeedLoading } =
    useLightspeedConnection({ autoFetch: true, pollInterval: 60000 });

  if (lightspeedLoading) return null;

  if (!lightspeedConnected) {
    return (
      <Link
        href="/connect-lightspeed"
        className={cn(topbarPillClass, "hidden sm:inline-flex")}
      >
        <Zap className="h-3.5 w-3.5 text-gray-500" />
        Connect POS
      </Link>
    );
  }

  if (isSyncing) {
    return (
      <div className={cn(topbarPillClass, "hidden sm:inline-flex")}>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />
        Syncing...
      </div>
    );
  }

  if (!formattedLastSync || formattedLastSync === "Never") return null;

  return (
    <div className={cn(topbarPillClass, "hidden sm:inline-flex")}>
      <span className="flex h-4 w-4 shrink-0 overflow-hidden rounded-full">
        <Image
          src="/ls.png"
          alt="Lightspeed"
          width={16}
          height={16}
          className="h-full w-full object-cover"
        />
      </span>
      <span className="text-gray-600">Synced {formattedLastSync}</span>
    </div>
  );
}
