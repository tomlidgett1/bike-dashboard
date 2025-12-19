"use client";

import * as React from "react";
import { MarketplaceSidebar } from "./marketplace-sidebar";
import { MobileLoginPrompt } from "@/components/marketplace/mobile-login-prompt";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebarState, SidebarStateProvider } from "@/lib/hooks/use-sidebar-state";
import { cn } from "@/lib/utils";

// ============================================================
// Marketplace Layout
// Layout with sidebar for marketplace navigation
// ============================================================

interface MarketplaceLayoutProps {
  children: React.ReactNode;
  showFooter?: boolean;
  showStoreCTA?: boolean;
}

function MarketplaceLayoutContent({ children, showFooter = true, showStoreCTA = false }: MarketplaceLayoutProps) {
  const { mounted } = useSidebarState();

  // Log state for debugging
  React.useEffect(() => {
    console.log('MarketplaceLayout - mounted:', mounted);
  }, [mounted]);

  return (
    <div className="min-h-screen bg-white sm:bg-gray-50">
      {/* Sidebar - starts below header */}
      <MarketplaceSidebar />
      
      {/* Header is included in each marketplace page for more control */}
      <main 
        className={cn(
          "w-full lg:pl-[56px]",
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
            <div className="max-w-[1920px] mx-auto px-6">
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
                  className="rounded-md bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-medium shadow-sm"
                  onClick={() => window.location.href = '/connect-lightspeed'}
                >
                  Sign Up Now
                </Button>
              </div>
            </div>
          </div>

          {/* Simple Copyright Footer */}
          <footer className="w-full bg-gray-50 border-t border-gray-200 py-3">
            <div className="max-w-[1920px] mx-auto px-6">
              <p className="text-center text-xs text-gray-600">
                &copy; 2025 Yellow Jersey. All Rights Reserved.
              </p>
            </div>
          </footer>
        </div>
      )}

      {/* Full Footer for Other Pages */}
      {showFooter && !showStoreCTA && (
        <footer className="w-full border-t border-gray-200 bg-white mt-12">
          <div className="max-w-[1920px] mx-auto px-6 py-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              {/* Company */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Yellow Jersey</h3>
                <p className="text-sm text-gray-600">
                  The world's largest marketplace for bicycles, parts, and cycling gear.
                </p>
              </div>

              {/* Shop */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Shop</h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>
                    <a href="/marketplace?category=Bicycles" className="hover:text-gray-900 transition-colors">
                      Bicycles
                    </a>
                  </li>
                  <li>
                    <a href="/marketplace?category=Parts" className="hover:text-gray-900 transition-colors">
                      Parts
                    </a>
                  </li>
                  <li>
                    <a href="/marketplace?category=Apparel" className="hover:text-gray-900 transition-colors">
                      Apparel
                    </a>
                  </li>
                  <li>
                    <a href="/marketplace?category=Nutrition" className="hover:text-gray-900 transition-colors">
                      Nutrition
                    </a>
                  </li>
                </ul>
              </div>

              {/* Sell */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Sell</h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>
                    <a href="/marketplace/sell" className="hover:text-gray-900 transition-colors">
                      List Your Bike
                    </a>
                  </li>
                  <li>
                    <a href="/settings" className="hover:text-gray-900 transition-colors">
                      Seller Dashboard
                    </a>
                  </li>
                </ul>
              </div>

              {/* Support */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Support</h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>
                    <a href="#" className="hover:text-gray-900 transition-colors">
                      Help Centre
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-gray-900 transition-colors">
                      Contact Us
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-gray-200 text-center text-sm text-gray-600">
              <p>&copy; {new Date().getFullYear()} Yellow Jersey. All rights reserved.</p>
            </div>
          </div>
        </footer>
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

