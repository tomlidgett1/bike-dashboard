"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { dashboardTopbarPadding } from "@/lib/layout/dashboard-padding";
import { cn } from "@/lib/utils";

// Route → breadcrumb labels. Falls back to a title-cased last segment.
const CRUMBS: Record<string, { section: string; page: string }> = {
  "/products": { section: "Store", page: "Products" },
  "/optimize": { section: "Store", page: "Product Optimise" },
  "/optimize/variants": { section: "Store", page: "Variant finder" },
  "/settings/store": { section: "Store", page: "Storefront" },
  "/settings/store/home": { section: "Store", page: "Home" },
  "/settings/store/actions": { section: "Store", page: "To Do" },
  "/settings/store/agents": { section: "Store", page: "Agents" },
  "/settings/store/demo": { section: "Store", page: "Demo" },
  "/settings/store/scrape": { section: "Store", page: "Scrape" },
  "/settings/store/nest": { section: "Customer service", page: "Nest" },
  "/settings/store/nest-knowledge": { section: "Store", page: "Nest knowledge" },
  "/settings/store/customer-inquiries": {
    section: "Customer service",
    page: "Customer inquiries",
  },
  "/settings/store/crm": { section: "Customer service", page: "Outreach" },
  "/settings/my-listings": { section: "Marketplace", page: "My listings" },
  "/settings/drafts": { section: "Marketplace", page: "Drafts" },
  "/settings/purchases": { section: "Marketplace", page: "Orders" },
  "/settings/uber": { section: "Operations", page: "Uber Direct" },
  "/settings/data": { section: "Operations", page: "Data" },
  "/settings/store/instagram": { section: "Operations", page: "Instagram" },
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
  const page = segments.length
    ? titleCase(segments[segments.length - 1])
    : "Dashboard";
  const section = segments.length > 1 ? titleCase(segments[0]) : "Store";
  return { section, page };
}

export function Topbar() {
  const pathname = usePathname() ?? "/products";
  const isNestPage = pathname === "/settings/store/nest";
  const crumb = useCrumb(pathname);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-border/50 bg-white",
        dashboardTopbarPadding,
      )}
    >
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap gap-2 text-sm sm:gap-2.5">
          <BreadcrumbItem className="hidden min-w-0 sm:inline-flex">
            <span className="truncate text-muted-foreground">{crumb.section}</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:block" />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="flex min-w-0 items-center gap-2 truncate font-semibold text-foreground">
              {isNestPage ? (
                <Image
                  src="/nest-logo.png"
                  alt=""
                  width={18}
                  height={18}
                  className="shrink-0 rounded-full"
                  aria-hidden
                />
              ) : null}
              <span className="truncate">{crumb.page}</span>
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}
