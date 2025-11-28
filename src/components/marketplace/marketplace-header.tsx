"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useScroll, useTransform } from "framer-motion";
import { Menu, X, Bike } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBar } from "./search-bar";
import { cn } from "@/lib/utils";

// ============================================================
// Marketplace Header
// Full-width responsive header with search and CTAs
// ============================================================

interface MarketplaceHeaderProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchLoading?: boolean;
}

export function MarketplaceHeader({
  searchValue,
  onSearchChange,
  searchLoading = false,
}: MarketplaceHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const { scrollY } = useScroll();
  const router = useRouter();

  // Add shadow when scrolled
  const headerShadow = useTransform(
    scrollY,
    [0, 50],
    ['0px 0px 0px rgba(0, 0, 0, 0)', '0px 4px 12px rgba(0, 0, 0, 0.08)']
  );

  const headerBg = useTransform(
    scrollY,
    [0, 50],
    ['rgba(255, 255, 255, 0.9)', 'rgba(255, 255, 255, 0.95)']
  );

  return (
    <motion.header
      style={{
        boxShadow: headerShadow,
        backgroundColor: headerBg,
      }}
      className="sticky top-0 z-50 w-full border-b border-gray-200 backdrop-blur-sm"
    >
      <div className="max-w-[1920px] mx-auto px-6">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <Link
            href="/marketplace"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-900">
              <Bike className="h-5 w-5 text-white" />
            </div>
            <span className="hidden sm:inline-block text-lg font-semibold text-gray-900">
              BikeMarket
            </span>
          </Link>

          {/* Desktop Search Bar */}
          <div className="hidden md:block flex-1 max-w-2xl">
            <SearchBar
              value={searchValue}
              onChange={onSearchChange}
              loading={searchLoading}
              placeholder="Search bikes, parts, apparel..."
            />
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => router.push('/login')}
              className="rounded-md border-gray-300 hover:bg-gray-50"
            >
              Sign In
            </Button>
            <Button
              onClick={() => router.push('/marketplace/sell')}
              className="rounded-md bg-gray-900 hover:bg-gray-800 text-white"
            >
              Sell Your Bike
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-md hover:bg-gray-100 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5 text-gray-700" />
            ) : (
              <Menu className="h-5 w-5 text-gray-700" />
            )}
          </button>
        </div>

        {/* Mobile Search (always visible on mobile) */}
        <div className="md:hidden pb-3">
          <SearchBar
            value={searchValue}
            onChange={onSearchChange}
            loading={searchLoading}
            placeholder="Search..."
          />
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{
            duration: 0.4,
            ease: [0.04, 0.62, 0.23, 0.98],
          }}
          className="md:hidden border-t border-gray-200 overflow-hidden"
        >
          <div className="max-w-[1920px] mx-auto px-6 py-4 space-y-3">
            <Button
              variant="outline"
              onClick={() => {
                router.push('/login');
                setMobileMenuOpen(false);
              }}
              className="w-full rounded-md border-gray-300 hover:bg-gray-50"
            >
              Sign In
            </Button>
            <Button
              onClick={() => {
                router.push('/marketplace/sell');
                setMobileMenuOpen(false);
              }}
              className="w-full rounded-md bg-gray-900 hover:bg-gray-800 text-white"
            >
              Sell Your Bike
            </Button>
          </div>
        </motion.div>
      )}
    </motion.header>
  );
}

