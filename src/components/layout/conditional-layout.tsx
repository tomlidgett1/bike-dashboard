"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { DashboardLayout } from "./dashboard-layout";
import { useUserProfile } from "@/components/providers/profile-provider";

// ============================================================
// Conditional Layout
// Shows Store Dashboard Sidebar ONLY for bicycle stores
// Marketplace pages handle their own layout
// ============================================================

interface ConditionalLayoutProps {
  children: React.ReactNode;
}

export function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname();
  const { profile } = useUserProfile();

  // Check if user is a verified bicycle store
  const isVerifiedStore = profile?.account_type === 'bicycle_store' && profile?.bicycle_store === true;

  // Check if this is a marketplace route
  const isMarketplace = pathname?.startsWith('/marketplace') || false;
  const isLogin = pathname?.startsWith('/login') || false;
  const isAuth = pathname?.startsWith('/auth') || false;
  const isOnboarding = pathname?.startsWith('/onboarding') || false;

  // Don't wrap marketplace, login, auth, or onboarding pages with dashboard layout
  if (isMarketplace || isLogin || isAuth || isOnboarding) {
    return <>{children}</>;
  }

  // ONLY show Store Dashboard Sidebar for verified bicycle stores
  // Non-bicycle-store users shouldn't access these routes anyway
  if (isVerifiedStore) {
    return <DashboardLayout>{children}</DashboardLayout>;
  }

  // Non-bicycle-store users on store routes - just show the page without sidebar
  // (they shouldn't be here, but if they are, don't show the store sidebar)
  return <>{children}</>;
}





