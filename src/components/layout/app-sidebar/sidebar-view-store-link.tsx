"use client";

import { ExternalLink } from "lucide-react";
import { useUserProfile } from "@/lib/hooks/use-user-profile";
import { cn } from "@/lib/utils";

export function SidebarViewStoreLink() {
  const { profile } = useUserProfile();
  const storeId = profile?.user_id;

  if (!storeId) return null;

  return (
    <a
      href={`/marketplace/store/${storeId}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-2 rounded-md border border-border/60 bg-white px-3 py-2",
        "text-sm font-medium text-foreground transition-colors hover:bg-gray-50",
        "group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
      )}
    >
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate group-data-[collapsible=icon]:hidden">View store</span>
    </a>
  );
}
