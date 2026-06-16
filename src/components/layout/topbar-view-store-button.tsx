"use client";

import Link from "next/link";
import { Shop } from "@/components/layout/app-sidebar/sidebar-icons";
import { topbarIconButtonClass } from "@/components/layout/topbar-nav-pills";
import { useUserProfile } from "@/lib/hooks/use-user-profile";

export function TopbarViewStoreButton() {
  const { profile } = useUserProfile();
  const storeId = profile?.user_id;

  if (!storeId) return null;

  return (
    <Link
      href={`/marketplace/store/${storeId}`}
      target="_blank"
      rel="noopener noreferrer"
      className={topbarIconButtonClass}
      aria-label="View store"
    >
      <Shop className="size-4" />
    </Link>
  );
}
