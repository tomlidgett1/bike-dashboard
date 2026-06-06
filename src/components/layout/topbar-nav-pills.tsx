"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useUserProfile } from "@/lib/hooks/use-user-profile";
import { cn } from "@/lib/utils";

export const topbarActionClass = cn(
  "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5",
  "text-xs text-muted-foreground transition-colors",
  "hover:bg-muted/60 hover:text-foreground"
);

/** @deprecated Use topbarActionClass */
export const topbarPillClass = topbarActionClass;

export function TopbarNavPills() {
  const { profile } = useUserProfile();
  const storeId = profile?.user_id;

  if (!storeId) return null;

  return (
    <div className="hidden items-center gap-0.5 sm:flex">
      <Link
        href={`/marketplace/store/${storeId}`}
        target="_blank"
        rel="noopener noreferrer"
        className={topbarActionClass}
      >
        <ExternalLink className="size-3.5 shrink-0" />
        <span className="hidden lg:inline">View store</span>
      </Link>
    </div>
  );
}
