"use client";

import Link from "next/link";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { useUserProfile } from "@/lib/hooks/use-user-profile";
import { cn } from "@/lib/utils";

export const topbarPillClass = cn(
  "inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5",
  "text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50",
);

export function TopbarNavPills() {
  const { profile } = useUserProfile();
  const storeId = profile?.user_id;

  return (
    <div className="hidden items-center gap-2 sm:flex">
      {storeId ? (
        <Link
          href={`/marketplace/store/${storeId}`}
          target="_blank"
          rel="noopener noreferrer"
          className={topbarPillClass}
        >
          <ExternalLink className="h-3.5 w-3.5 text-gray-500" />
          View my store
        </Link>
      ) : null}
      <Link
        href="/marketplace"
        aria-label="Back to marketplace"
        className={topbarPillClass}
      >
        <ChevronLeft className="h-3.5 w-3.5 text-gray-400" />
        Back to marketplace
      </Link>
    </div>
  );
}
