"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "./app-sidebar";
import { ForceLightChrome } from "./force-light-chrome";
import { Topbar } from "./topbar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();

  // Don't show the dashboard chrome on auth pages
  const isAuthPage =
    pathname?.startsWith("/login") || pathname?.startsWith("/auth");

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <ForceLightChrome>
    <TooltipProvider delayDuration={0}>
      <SidebarProvider className="dashboard-light-surface h-svh overflow-hidden bg-background text-foreground">
        <AppSidebar />
        <SidebarInset className="h-svh min-w-0 overflow-hidden bg-background">
          <Topbar />
          <div className="min-h-0 flex-1 overflow-y-auto bg-background">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
    </ForceLightChrome>
  );
}
