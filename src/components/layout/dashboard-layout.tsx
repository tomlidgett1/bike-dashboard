"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "./app-sidebar";
import { DashboardHeader } from "./dashboard-header";
import { DashboardHeaderColorProvider } from "./dashboard-header-color";
import { ForceLightChrome } from "./force-light-chrome";
import { GenieTransitionOverlay, GenieTransitionProvider } from "./genie-transition";
import { Topbar } from "./topbar";
import { SellModalHost } from "@/components/marketplace/sell/sell-modal-host";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const HIDE_TOPBAR_PATHS = [
  "/settings/store/home",
  "/settings/store/actions",
  "/settings/store/nest",
  "/settings/store/customer-inquiries",
];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();

  // Don't show the dashboard chrome on auth pages
  const isAuthPage =
    pathname?.startsWith("/login") || pathname?.startsWith("/auth");
  const isProductsRoute = pathname?.startsWith("/products") ?? false;
  const hideTopbar =
    isProductsRoute || HIDE_TOPBAR_PATHS.some((path) => pathname === path);
  const isFullHeightPage = isProductsRoute;

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <ForceLightChrome>
    <DashboardHeaderColorProvider>
    <TooltipProvider delayDuration={0}>
      <GenieTransitionProvider>
        <SidebarProvider className="dashboard-light-surface dashboard-shell flex h-svh flex-col overflow-hidden text-foreground">
          <DashboardHeader />
          <div className="dashboard-shell-body relative flex min-h-0 w-full flex-1 overflow-hidden bg-[#f6f6f7] md:flex-row">
            <AppSidebar />
            <SidebarInset className="min-h-0 min-w-0 flex-1 overflow-hidden bg-white">
              {hideTopbar ? null : <Topbar />}
              <div
                className={cn(
                  "flex min-h-0 flex-1 flex-col bg-white",
                  isFullHeightPage ? "overflow-hidden" : "overflow-y-auto",
                )}
              >
                {children}
              </div>
              <GenieTransitionOverlay />
            </SidebarInset>
          </div>
          <SellModalHost />
        </SidebarProvider>
      </GenieTransitionProvider>
    </TooltipProvider>
    </DashboardHeaderColorProvider>
    </ForceLightChrome>
  );
}
