"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { AgentHeaderButton } from "@/components/genie/agent-header-button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "./theme-toggle";
import { TopbarNavPills } from "./topbar-nav-pills";
import { useAuth } from "@/components/providers/auth-provider";
import { isStoreDashboardPath } from "@/lib/routes/store-dashboard";

const LazyNotificationsDropdown = dynamic(
  () => import("./notifications-dropdown").then((mod) => mod.NotificationsDropdown),
  { ssr: false }
);

const LazyMessagesDropdown = dynamic(
  () => import("./messages-dropdown").then((mod) => mod.MessagesDropdown),
  { ssr: false }
);

const LazyTopbarLightspeedStatus = dynamic(
  () => import("./topbar-lightspeed-status").then((mod) => mod.TopbarLightspeedStatus),
  { ssr: false }
);

// Route → breadcrumb labels. Falls back to a title-cased last segment.
const CRUMBS: Record<string, { section: string; page: string }> = {
  "/products": { section: "Store", page: "Products" },
  "/optimize": { section: "Store", page: "Product Optimise" },
  "/settings/store": { section: "Store", page: "Storefront" },
  "/settings/store/nest": { section: "Store", page: "Nest" },
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

function useDeferredTopbarActions() {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(() => setReady(true), { timeout: 1200 });
      return () => win.cancelIdleCallback?.(id);
    }

    const id = window.setTimeout(() => setReady(true), 800);
    return () => window.clearTimeout(id);
  }, []);

  return ready;
}

export function Topbar() {
  const pathname = usePathname() ?? "/products";
  const showAgentInHeader = isStoreDashboardPath(pathname);
  const crumb = useCrumb(pathname);
  const { user } = useAuth();
  const showDeferredActions = useDeferredTopbarActions();

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
        <TopbarNavPills />
        {showAgentInHeader ? <AgentHeaderButton /> : null}
        {showDeferredActions ? (
          <>
            <LazyTopbarLightspeedStatus />
            {user ? <LazyNotificationsDropdown /> : null}
            {user ? <LazyMessagesDropdown /> : null}
          </>
        ) : null}
        <ThemeToggle />
      </div>
    </header>
  );
}
