"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  X,
  Mail,
  Settings,
  LogOut,
  Store,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { NotificationsDropdown } from "@/components/layout/notifications-dropdown";
import { InstantSearch } from "./instant-search";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";
import { useAuthModal } from "@/components/providers/auth-modal-provider";
import { createClient } from "@/lib/supabase/client";
import { useCombinedUnreadCount } from "@/lib/hooks/use-combined-unread-count";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  buildMarketplaceNavUrl,
  getMarketplaceActiveView,
  marketplaceBrowsingNavItems,
  shouldShowMarketplaceSidebar,
  type MarketplaceNavItem,
} from "@/lib/marketplace-nav";

interface DesktopHeaderPillProps {
  searchListingType: "private_listing" | "store_inventory" | null;
}

type LinkItem = MarketplaceNavItem & {
  type: "item";
  value: string;
  title: string;
};

function DesktopHeaderPillContent({ searchListingType }: DesktopHeaderPillProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { openAuthModal } = useAuthModal();
  const supabase = createClient();

  const [searchOpen, setSearchOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [shouldFetchUnread, setShouldFetchUnread] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    const t = setTimeout(() => setShouldFetchUnread(true), 500);
    return () => clearTimeout(t);
  }, []);

  // Close search on Escape
  React.useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  // Auto-close search when route changes
  React.useEffect(() => {
    setSearchOpen(false);
  }, [pathname]);

  const { counts } = useCombinedUnreadCount(
    user && shouldFetchUnread ? 30000 : 0
  );
  const unreadCount = counts.total;

  const isVerifiedStore =
    profile?.account_type === "bicycle_store" && profile?.bicycle_store === true;

  const activeView = getMarketplaceActiveView(
    pathname,
    searchParams,
    profile?.user_id,
    user?.id
  );

  const showNavLinks = !shouldShowMarketplaceSidebar(pathname);

  const linkItems = marketplaceBrowsingNavItems.filter(
    (item): item is LinkItem =>
      item.type === "item" && !!item.value && !!item.title
  );

  const getHref = (value: string) =>
    buildMarketplaceNavUrl(value, {
      isVerifiedStore,
      profileUserId: profile?.user_id,
      authUserId: user?.id,
    });

  const getDisplayName = () => {
    if (!profile) return user?.email || "User";
    if (profile.account_type === "bicycle_store") {
      return profile.business_name || user?.email || "Store";
    }
    return profile.name || user?.email || "User";
  };

  const showLogo = !!profile?.logo_url;

  const getSettingsRoute = () =>
    isVerifiedStore ? "/settings" : "/marketplace/settings";

  const getPurchasesRoute = () =>
    isVerifiedStore ? "/marketplace/purchases" : "/settings/purchases";

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/marketplace");
    router.refresh();
  };

  return (
    <motion.div
      layout
      transition={{ duration: 0.35, ease: [0.04, 0.62, 0.23, 0.98] }}
      className={cn(
        "relative flex items-center bg-white border border-gray-200 rounded-full shadow-sm h-12",
        searchOpen ? "w-[460px] px-2" : "px-1.5"
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {searchOpen ? (
          <motion.div
            key="search"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-1 w-full"
          >
            <div
              className={cn(
                "flex-1 min-w-0",
                // Strip InstantSearch input chrome so it blends into the pill
                "[&_input]:!border-0 [&_input]:!bg-transparent [&_input]:!shadow-none",
                "[&_input]:!ring-0 [&_input:focus]:!ring-0 [&_input:focus]:!border-0",
                "[&_input]:!h-9 [&_input]:!pr-9",
                "[&_kbd]:!hidden"
              )}
            >
              <InstantSearch listingType={searchListingType} autoFocus />
            </div>
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              className="h-8 w-8 rounded-full hover:bg-gray-100 transition-colors flex items-center justify-center flex-shrink-0"
              aria-label="Close search"
            >
              <X className="h-4 w-4 text-gray-600" />
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="nav"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-1"
          >
            {showNavLinks &&
              linkItems.map((item) => {
                const isActive = activeView === item.value;
                return (
                  <Link
                    key={item.value}
                    href={getHref(item.value)}
                    className={cn(
                      "px-3 py-1.5 text-sm font-medium rounded-full transition-colors whitespace-nowrap",
                      isActive
                        ? "text-gray-900 bg-gray-100"
                        : "text-gray-700 hover:bg-gray-100"
                    )}
                  >
                    {item.title}
                  </Link>
                );
              })}

            {showNavLinks && (
              <div className="w-px h-5 bg-gray-200 mx-1" aria-hidden />
            )}

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="h-9 w-9 rounded-full hover:bg-gray-100 transition-colors flex items-center justify-center"
              aria-label="Search"
            >
              <Search
                className="h-[18px] w-[18px] text-gray-700"
                strokeWidth={2}
              />
            </button>

            {mounted && user ? (
              <>
                <NotificationsDropdown />

                <button
                  type="button"
                  onClick={() => router.push("/messages")}
                  className="relative h-9 w-9 rounded-full hover:bg-gray-100 transition-colors flex items-center justify-center"
                  aria-label="Messages"
                >
                  <Mail
                    className="h-[18px] w-[18px] text-gray-700"
                    strokeWidth={2}
                  />
                  {unreadCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </button>

                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="ml-1 outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 cursor-pointer"
                      aria-label="Account"
                    >
                      {showLogo ? (
                        <div className="relative h-9 w-9 rounded-full overflow-hidden border border-gray-200 flex-shrink-0">
                          <Image
                            src={profile!.logo_url!}
                            alt={getDisplayName()}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <UserAvatar
                          name={getDisplayName()}
                          size="sm"
                          className="h-9 w-9 border-gray-200"
                        />
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-56 bg-white rounded-md"
                  >
                    <DropdownMenuItem
                      onClick={() =>
                        router.push(
                          `/marketplace/store/${profile?.user_id || user?.id}`
                        )
                      }
                      className="cursor-pointer rounded-md"
                    >
                      <Store className="mr-2 h-4 w-4" />
                      <span>My Store</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => router.push(getPurchasesRoute())}
                      className="cursor-pointer rounded-md"
                    >
                      <ShoppingBag className="mr-2 h-4 w-4" />
                      <span>Order Management</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => router.push(getSettingsRoute())}
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
              </>
            ) : (
              mounted && (
                <Button
                  variant="ghost"
                  onClick={openAuthModal}
                  className="rounded-full text-sm font-medium hover:bg-gray-100 h-9 px-4"
                >
                  Sign In
                </Button>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function DesktopHeaderPill(props: DesktopHeaderPillProps) {
  return (
    <Suspense fallback={null}>
      <DesktopHeaderPillContent {...props} />
    </Suspense>
  );
}
