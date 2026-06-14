"use client";

import * as React from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { AgentHeaderButton } from "@/components/genie/agent-header-button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { HeaderSidebarTrigger } from "@/components/layout/app-sidebar/sidebar-collapse-trigger";
import { ThemeToggle } from "./theme-toggle";
import { NotificationsDropdown } from "./notifications-dropdown";
import { MessagesDropdown } from "./messages-dropdown";
import { NestMessagesDropdown } from "./nest-messages-dropdown";
import { StoreSetupButton } from "@/components/settings/store-setup-button";
import { FloatingTomFeedbackButton } from "@/components/feedback/floating-tom-feedback-button";
import { useAuth } from "@/components/providers/auth-provider";
import { dashboardTopbarPadding } from "@/lib/layout/dashboard-padding";
import { isStoreDashboardPath } from "@/lib/routes/store-dashboard";
import { cn } from "@/lib/utils";

const LazyFloatingImageApprovalCard = dynamic(
  () =>
    import("@/components/optimize/floating-image-approval-card").then(
      (mod) => mod.FloatingImageApprovalCard,
    ),
  { ssr: false },
);

// Route → breadcrumb labels. Falls back to a title-cased last segment.
const CRUMBS: Record<string, { section: string; page: string }> = {
  "/products": { section: "Store", page: "Products" },
  "/optimize": { section: "Store", page: "Product Optimise" },
  "/settings/store": { section: "Store", page: "Storefront" },
  "/settings/store/home": { section: "Store", page: "Home" },
  "/settings/store/overivewo": { section: "Store", page: "Overivewo" },
  "/settings/store/nest": { section: "Customer service", page: "Nest" },
  "/settings/store/customer-inquiries": { section: "Customer service", page: "Customer inquiries" },
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
      : seg === "home"
        ? "Home"
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
  const isNestPage = pathname === "/settings/store/nest";
  const crumb = useCrumb(pathname);
  const { user } = useAuth();
  const showDeferredActions = useDeferredTopbarActions();

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border/40 bg-background",
        dashboardTopbarPadding,
      )}
    >
      <HeaderSidebarTrigger />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage className="flex items-center gap-2 text-sm font-medium text-foreground">
              {isNestPage ? (
                <Image
                  src="/nest-logo.png"
                  alt=""
                  width={20}
                  height={20}
                  className="rounded-full"
                  aria-hidden
                />
              ) : null}
              {crumb.page}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-1">
        {showAgentInHeader && user ? (
          <FloatingTomFeedbackButton placement="header" />
        ) : null}
        {showAgentInHeader && showDeferredActions ? (
          <LazyFloatingImageApprovalCard placement="header" />
        ) : null}
        {showAgentInHeader ? <AgentHeaderButton /> : null}
        {showDeferredActions ? (
          <>
            {showAgentInHeader ? <StoreSetupButton iconOnly /> : null}
            {showAgentInHeader && user ? <NestMessagesDropdown /> : null}
            {user ? <NotificationsDropdown /> : null}
            {user ? <MessagesDropdown /> : null}
          </>
        ) : null}
        <ThemeToggle />
      </div>
    </header>
  );
}
