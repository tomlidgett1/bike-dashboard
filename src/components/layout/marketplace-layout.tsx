"use client";

import * as React from "react";
import { MarketplaceSidebar } from "./marketplace-sidebar";

// ============================================================
// Marketplace Layout
// Layout with sidebar for marketplace navigation
// ============================================================

interface MarketplaceLayoutProps {
  children: React.ReactNode;
}

export function MarketplaceLayout({ children }: MarketplaceLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar - starts below header */}
      <MarketplaceSidebar />
      
      {/* Header is included in each marketplace page for more control */}
      <main className="w-full lg:pl-[200px]">{children}</main>

      {/* Footer */}
      <footer className="w-full border-t border-gray-200 bg-white mt-12">
        <div className="max-w-[1920px] mx-auto px-6 py-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Company */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">BikeMarket</h3>
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
            <p>&copy; {new Date().getFullYear()} BikeMarket. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

