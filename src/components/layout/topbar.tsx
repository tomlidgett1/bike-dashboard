"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, Zap } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "./theme-toggle";
import { TopbarNavPills, topbarPillClass } from "./topbar-nav-pills";
import { AgentHeaderButton } from "@/components/genie/agent-header-button";
import { NotificationsDropdown } from "./notifications-dropdown";
import { MessagesDropdown } from "./messages-dropdown";
import { useAuth } from "@/components/providers/auth-provider";
import { useSyncStatus } from "@/lib/hooks/use-sync-status";
import { useLightspeedConnection } from "@/lib/hooks/use-lightspeed-connection";
import { cn } from "@/lib/utils";

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
  const isStoreSettings = pathname.startsWith("/settings/store");
  const crumb = useCrumb(pathname);
  const { user } = useAuth();
  const { isSyncing, formattedLastSync } = useSyncStatus();
  const { isConnected: lightspeedConnected, isLoading: lightspeedLoading } =
    useLightspeedConnection({ autoFetch: true, pollInterval: 60000 });

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

      <div className="ml-auto flex items-center gap-2">
        {isStoreSettings ? <AgentHeaderButton /> : null}
        <TopbarNavPills />
        {!lightspeedLoading && lightspeedConnected ? (
          isSyncing ? (
            <div className={cn(topbarPillClass, "hidden sm:inline-flex")}>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />
              Syncing…
            </div>
          ) : formattedLastSync && formattedLastSync !== "Never" ? (
            <div className={cn(topbarPillClass, "hidden sm:inline-flex")}>
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span className="text-gray-600">Synced {formattedLastSync}</span>
            </div>
          ) : null
        ) : !lightspeedLoading ? (
          <Link
            href="/connect-lightspeed"
            className={cn(topbarPillClass, "hidden sm:inline-flex")}
          >
            <Zap className="h-3.5 w-3.5 text-gray-500" />
            Connect POS
          </Link>
        ) : null}

        {user ? <NotificationsDropdown /> : null}
        {user ? <MessagesDropdown /> : null}
        <ThemeToggle />
      </div>
    </header>
  );
}
