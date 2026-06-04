"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ExternalLink } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useUserProfile } from "@/lib/hooks/use-user-profile";
import { cn } from "@/lib/utils";

const linkButtonClass = cn(
  "border border-border bg-white shadow-sm",
  "hover:bg-white hover:text-foreground",
  "group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:shadow-none",
);

export function SidebarBottomLinks() {
  const { profile } = useUserProfile();
  const storeId = profile?.user_id;

  return (
    <div className="px-2 group-data-[collapsible=icon]:px-0">
      <SidebarMenu>
        {storeId ? (
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="View my store"
              className={linkButtonClass}
            >
              <Link
                href={`/marketplace/store/${storeId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink />
                <span>View my store</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            tooltip="Back to Yellow Jersey"
            className={linkButtonClass}
          >
            <Link href="/marketplace" aria-label="Back to Yellow Jersey marketplace">
              <ChevronLeft />
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate group-data-[collapsible=icon]:hidden">
                  Back to
                </span>
                <Image
                  src="/yjlogo.svg"
                  alt="Yellow Jersey"
                  width={72}
                  height={22}
                  className="h-[18px] w-auto shrink-0 group-data-[collapsible=icon]:hidden"
                  unoptimized
                />
              </span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </div>
  );
}
