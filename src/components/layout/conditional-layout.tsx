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

  // Check if this is a marketplace route or messages page
  const isMarketplace = pathname?.startsWith('/marketplace') || false;
  const isMessages = pathname?.startsWith('/messages') || false;
  const isLogin = pathname?.startsWith('/login') || false;
  const isAuth = pathname?.startsWith('/auth') || false;
  const isOnboarding = pathname?.startsWith('/onboarding') || false;
  // E-commerce hero page is full-width, no sidebar needed
  const isEcommerceHero = pathname === '/admin/ecommerce-hero';
  // Settings/products redesign mockup ships its own sidebar-07 shell
  const isMockup = pathname?.startsWith('/mockup') || false;
  // V2 marketplace homepage ships its own header/footer chrome
  const isV2 = pathname?.startsWith('/v2') || false;
  // Public marketing landing pages are full-bleed, no dashboard chrome
  const isHome =
    pathname === '/home' ||
    pathname?.startsWith('/home2') ||
    pathname?.startsWith('/home/') ||
    false;
  // Public SEO marketing pages ship their own full-bleed chrome
  const isMarketing =
    pathname === '/sell-your-bike' ||
    pathname?.startsWith('/used-bikes') ||
    pathname?.startsWith('/blog') ||
    false;

  // Don't wrap marketplace, messages, login, auth, onboarding, ecommerce-hero, mockup, v2, home, or marketing pages with dashboard layout
  // These pages manage their own layout
  if (isMarketplace || isMessages || isLogin || isAuth || isOnboarding || isEcommerceHero || isMockup || isV2 || isHome || isMarketing) {
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





