"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "./theme-toggle";
import { NotificationsDropdown } from "./notifications-dropdown";
import { MessagesDropdown } from "./messages-dropdown";
import { useAuth } from "@/components/providers/auth-provider";
import { useSyncStatus } from "@/lib/hooks/use-sync-status";

// Route → breadcrumb labels. Falls back to a title-cased last segment.
const CRUMBS: Record<string, { section: string; page: string }> = {
  "/products": { section: "Store", page: "Products" },
  "/optimize": { section: "Store", page: "Optimise" },
  "/settings/store": { section: "Store", page: "Storefront" },
  "/settings/my-listings": { section: "Marketplace", page: "My listings" },
  "/settings/drafts": { section: "Marketplace", page: "Drafts" },
  "/settings/purchases": { section: "Marketplace", page: "Orders" },
  "/settings/uber": { section: "Operations", page: "Uber Direct" },
  "/settings/data": { section: "Operations", page: "Data" },
  "/connect-lightspeed": { section: "Operations", page: "Lightspeed" },
  "/settings": { section: "Account", page: "Settings" },
  "/settings/notifications": { section: "Account", page: "Notifications" },
  "/admin/image-qa": { section: "Admin", page: "Image QA" },
};

function titleCase(segment: string) {
  return segment
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function useCrumb(pathname: string) {
  if (CRUMBS[pathname]) return CRUMBS[pathname];
  // Storefront sub-pages: /settings/store/<section>
  if (pathname.startsWith("/settings/store")) {
    const seg = pathname.split("/")[3];
    const page = !seg
      ? "Storefront"
      : seg === "products"
        ? "Product content"
        : titleCase(seg);
    return { section: "Storefront", page };
  }
  const segments = pathname.split("/").filter(Boolean);
  const page = segments.length ? titleCase(segments[segments.length - 1]) : "Dashboard";
  const section = segments.length > 1 ? titleCase(segments[0]) : "Store";
  return { section, page };
}

export function Topbar() {
  const pathname = usePathname() ?? "/products";
  const crumb = useCrumb(pathname);
  const { user } = useAuth();
  const { isSyncing, formattedLastSync } = useSyncStatus();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <SidebarTrigger className="-ml-1" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden text-muted-foreground md:block">
            {crumb.section}
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>{crumb.page}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-1.5">
        {isSyncing ? (
          <div className="hidden items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1.5 sm:flex">
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Syncing…</span>
          </div>
        ) : formattedLastSync && formattedLastSync !== "Never" ? (
          <div className="hidden items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1.5 lg:flex">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-muted-foreground">
              Synced {formattedLastSync}
            </span>
          </div>
        ) : null}

        {user ? <NotificationsDropdown /> : null}
        {user ? <MessagesDropdown /> : null}
        <ThemeToggle />
      </div>
    </header>
  );
}
