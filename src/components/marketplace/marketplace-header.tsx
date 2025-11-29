"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useScroll, useTransform } from "framer-motion";
import { Menu, X, Bike, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstantSearch } from "./instant-search";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";
import { UserAvatar } from "@/components/ui/user-avatar";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ============================================================
// Marketplace Header
// Full-width responsive header with enterprise search
// ============================================================

export function MarketplaceHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const { scrollY } = useScroll();
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const supabase = createClient();

  // Ensure component only renders auth UI on client-side
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Get display name based on account type
  const getDisplayName = () => {
    if (!profile) return user?.email || 'User';
    
    if (profile.account_type === 'bicycle_store') {
      return profile.business_name || profile.name || user?.email || 'Store';
    } else {
      return profile.name || user?.email || 'User';
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

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
      className="fixed top-0 z-50 w-full border-b border-gray-200 backdrop-blur-sm"
    >
      <div className="max-w-[1920px] mx-auto px-6">
        <div className="flex h-16 items-center gap-4">
          {/* Logo - Fixed on left */}
          <button
            onClick={() => router.push('/marketplace')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-900">
              <Bike className="h-5 w-5 text-white" />
            </div>
            <span className="hidden sm:inline-block text-lg font-semibold text-gray-900 whitespace-nowrap">
              VeloMarket
            </span>
          </button>

          {/* Desktop Search Bar - Starts where sidebar ends (200px) */}
          <div className="hidden lg:block flex-1 max-w-2xl lg:ml-[80px]">
            <InstantSearch />
          </div>

          {/* Desktop Actions - Fixed on right */}
          <div className="hidden lg:flex items-center gap-3 flex-shrink-0 ml-auto">
            {mounted && user ? (
              <>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-0">
                      <UserAvatar name={getDisplayName()} size="default" />
                      <span className="text-sm font-medium text-gray-700 max-w-[150px] truncate">
                        {getDisplayName()}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-white rounded-md">
                    <DropdownMenuItem
                      onClick={() => router.push('/settings')}
                      className="cursor-pointer rounded-md"
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleSignOut}
                      className="cursor-pointer text-red-600 focus:text-red-600 rounded-md"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Sign Out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  onClick={() => router.push('/marketplace/sell')}
                  className="rounded-md bg-gray-900 hover:bg-gray-800 text-white"
                >
                  Sell Item
                </Button>
              </>
            ) : (
              <>
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
                  Sell Item
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-md hover:bg-gray-100 transition-colors ml-auto"
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
        <div className="lg:hidden pb-3">
          <InstantSearch />
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
          className="lg:hidden border-t border-gray-200 overflow-hidden"
        >
          <div className="max-w-[1920px] mx-auto px-6 py-4 space-y-3">
            {mounted && user ? (
              <>
                {/* User Info */}
                <div className="flex items-center gap-3 px-3 py-2 bg-white rounded-md border border-gray-200">
                  <UserAvatar name={getDisplayName()} size="default" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {getDisplayName()}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {user.email}
                    </p>
                  </div>
                </div>
                
                <Button
                  onClick={() => {
                    router.push('/marketplace/sell');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full rounded-md bg-gray-900 hover:bg-gray-800 text-white"
                >
                  Sell Item
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => {
                    router.push('/settings');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full rounded-md border-gray-300 hover:bg-gray-50"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => {
                    handleSignOut();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full rounded-md border-red-300 text-red-600 hover:bg-red-50"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </Button>
              </>
            ) : (
              <>
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
                  Sell Item
                </Button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </motion.header>
  );
}

