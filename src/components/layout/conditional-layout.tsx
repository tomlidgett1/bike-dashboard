"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { DashboardLayout } from "./dashboard-layout";

// ============================================================
// Conditional Layout
// Shows dashboard layout for dashboard routes, nothing for marketplace
// ============================================================

interface ConditionalLayoutProps {
  children: React.ReactNode;
}

export function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname();

  // Check if this is a marketplace route
  const isMarketplace = pathname?.startsWith('/marketplace') || false;
  const isLogin = pathname?.startsWith('/login') || false;
  const isAuth = pathname?.startsWith('/auth') || false;

  // Don't wrap marketplace, login, or auth pages with dashboard layout
  if (isMarketplace || isLogin || isAuth) {
    return <>{children}</>;
  }

  // Wrap all other pages with dashboard layout
  return <DashboardLayout>{children}</DashboardLayout>;
}





