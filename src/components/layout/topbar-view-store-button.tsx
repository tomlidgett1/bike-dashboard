"use client";

import Link from "next/link";
import { Folder } from "lucide-react";
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
      <Folder className="size-4 stroke-[1.75]" />
    </Link>
  );
}
