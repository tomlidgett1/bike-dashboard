"use client";

import { useUserProfile } from "@/lib/hooks/use-user-profile";

export function SidebarViewStoreLink() {
  const { profile } = useUserProfile();
  const storeId = profile?.user_id;

  if (!storeId) return null;

  return (
    <a
      href={`/marketplace/store/${storeId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="truncate px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      View store
    </a>
  );
}
