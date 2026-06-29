"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { MarketplaceSidebar } from "./marketplace-sidebar";
import { MobileLoginPrompt } from "@/components/marketplace/mobile-login-prompt";
import { Store } from '@/components/layout/app-sidebar/dashboard-icons';
import { Button } from "@/components/ui/button";
import { useSidebarState, SidebarStateProvider } from "@/lib/hooks/use-sidebar-state";
import { shouldShowMarketplaceSidebar } from "@/lib/marketplace-nav";
import { SiteFooterShell } from "@/components/layout/site-footer-shell";
import { cn } from "@/lib/utils";

// ============================================================
// Marketplace Layout
// Layout with sidebar for marketplace navigation
// ============================================================

interface MarketplaceLayoutProps {
  children: React.ReactNode;
  showFooter?: boolean;
  showStoreCTA?: boolean;
  /** Force sidebar on/off; defaults to pathname-based settings detection */
  showSidebar?: boolean;
  /** Skip outer page chrome when nested inside a floating card shell. */
  embedded?: boolean;
}

function MarketplaceLayoutContent({
  children,
  showFooter = true,
  showStoreCTA = false,
  showSidebar,
  embedded = false,
}: MarketplaceLayoutProps) {
  const pathname = usePathname();
  const { isCollapsed } = useSidebarState();
  const sidebarVisible =
    showSidebar ?? (pathname ? shouldShowMarketplaceSidebar(pathname) : false);

  if (embedded) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50">
      {sidebarVisible && <MarketplaceSidebar />}

      {/* Header is included in each marketplace page for more control */}
      <main
        className={cn(
          "w-full",
          sidebarVisible &&
            (isCollapsed ? "lg:pl-[56px]" : "lg:pl-[200px]"),
          showStoreCTA && "mb-32"
        )}
      >
        {children}
      </main>

      {/* Mobile Login Prompt - Only for non-authenticated users on mobile */}
      <MobileLoginPrompt />

      {/* Call to Action & Simple Footer - Only for Stores Page */}
      {showStoreCTA && (
        <div 
          className="fixed bottom-0 left-0 right-0 z-10 transition-all duration-[400ms] ease-[cubic-bezier(0.04,0.62,0.23,0.98)]"
        >
          {/* Call to Action for Bike Stores */}
          <div className="bg-white border-t border-gray-200 py-4">
            <div className="px-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-md bg-gray-100">
                    <Store className="h-5 w-5 text-gray-700" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      Are you a bike store?
                    </h3>
                    <p className="text-xs text-gray-600">
                      Join Yellow Jersey and reach thousands of cycling enthusiasts
                    </p>
                  </div>
                </div>
                <Button
                  className="rounded-md bg-[#ffde59] hover:bg-[#f0cf45] text-gray-900 font-medium shadow-sm"
                  onClick={() => window.location.href = '/connect-lightspeed'}
                >
                  Sign Up Now
                </Button>
              </div>
            </div>
          </div>

          {/* Simple Copyright Footer */}
          <footer className="w-full bg-gray-50 border-t border-gray-200 py-3">
            <div className="px-6">
              <p className="text-center text-xs text-gray-600">
                &copy; 2025 Yellow Jersey. All Rights Reserved.
              </p>
            </div>
          </footer>
        </div>
      )}

      {/* Full Footer for Other Pages */}
      {showFooter && !showStoreCTA && (
        <div className="mt-12">
          <SiteFooterShell />
        </div>
      )}
    </div>
  );
}

export function MarketplaceLayout(props: MarketplaceLayoutProps) {
  return (
    <SidebarStateProvider>
      <MarketplaceLayoutContent {...props} />
    </SidebarStateProvider>
  );
}

