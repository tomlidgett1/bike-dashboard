"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Mail,
  Settings,
  LogOut,
  Store,
  ShoppingBag,
  Home,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { NotificationsDropdown } from "@/components/layout/notifications-dropdown";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";
import { createClient } from "@/lib/supabase/client";
import { useCombinedUnreadCount } from "@/lib/hooks/use-combined-unread-count";
import { useMessages } from "@/components/providers/messages-provider";
import { useAuthModal } from "@/components/providers/auth-modal-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getMarketplaceUserNavLabels,
  shouldShowMarketplaceSidebar,
} from "@/lib/marketplace-nav";

function DesktopHeaderPillContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const spaceParam = searchParams.get("space");
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const supabase = createClient();

  const [mounted, setMounted] = React.useState(false);
  const [shouldFetchUnread, setShouldFetchUnread] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    const t = setTimeout(() => setShouldFetchUnread(true), 500);
    return () => clearTimeout(t);
  }, []);

  const { counts } = useCombinedUnreadCount(
    user && shouldFetchUnread ? 30000 : 0
  );
  const unreadCount = counts.total;
  const { open: openInbox } = useMessages();
  const { openAuthModal } = useAuthModal();

  const isVerifiedStore =
    profile?.account_type === "bicycle_store" && profile?.bicycle_store === true;

  const showNavLinks = !shouldShowMarketplaceSidebar(pathname);

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

  const navLabels = getMarketplaceUserNavLabels(profile?.account_type);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/marketplace");
    router.refresh();
  };

  return (
    <div className="flex items-center gap-1">
        {showNavLinks && mounted && user && (
          <>
            <Link
              href="/marketplace"
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                pathname === "/marketplace"
                  ? "text-gray-900 bg-gray-100"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              Home
            </Link>
            <Link
              href="/for-you"
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                pathname === "/for-you"
                  ? "text-gray-900 bg-gray-100"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              For You
            </Link>
            <Link
              href={`/marketplace/store/${profile?.user_id || user?.id}`}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                pathname.startsWith("/marketplace/store/")
                  ? "text-gray-900 bg-gray-100"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              {navLabels.shopfront}
            </Link>
            <Link
              href={getPurchasesRoute()}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                pathname === "/marketplace/purchases" ||
                pathname === "/settings/purchases" ||
                pathname.startsWith("/marketplace/purchases/") ||
                pathname.startsWith("/settings/purchases/")
                  ? "text-gray-900 bg-gray-100"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              {navLabels.orders}
            </Link>
            <Link
              href={getSettingsRoute()}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                pathname === "/settings" ||
                pathname === "/marketplace/settings" ||
                (pathname.startsWith("/settings/") &&
                  !pathname.startsWith("/settings/purchases"))
                  ? "text-gray-900 bg-gray-100"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              {navLabels.settings}
            </Link>
            <div className="w-px h-5 bg-gray-200 mx-1" aria-hidden />
          </>
        )}

        {mounted && user ? (
          <>
            <NotificationsDropdown />

            <button
              type="button"
              onClick={openInbox}
              className="relative h-9 w-9 rounded-full hover:bg-gray-100 transition-colors flex items-center justify-center cursor-pointer"
              aria-label="Open inbox"
            >
              <Mail
                className="h-[18px] w-[18px] text-gray-700"
                strokeWidth={2}
              />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
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
                  onClick={() => router.push("/marketplace")}
                  className="cursor-pointer rounded-md"
                >
                  <Home className="mr-2 h-4 w-4" />
                  <span>Home</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    router.push(
                      `/marketplace/store/${profile?.user_id || user?.id}`
                    )
                  }
                  className="cursor-pointer rounded-md"
                >
                  <Store className="mr-2 h-4 w-4" />
                  <span>{navLabels.shopfront}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push(getPurchasesRoute())}
                  className="cursor-pointer rounded-md"
                >
                  <ShoppingBag className="mr-2 h-4 w-4" />
                  <span>{navLabels.orders}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push(getSettingsRoute())}
                  className="cursor-pointer rounded-md"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  <span>{navLabels.settings}</span>
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
            <>
              {showNavLinks && (
                <>
                  <Link
                    href="/marketplace"
                    className={cn(
                      "px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                      pathname === "/marketplace" &&
                        spaceParam !== "stores" &&
                        spaceParam !== "uber"
                        ? "text-gray-900 bg-gray-100"
                        : "text-gray-700 hover:bg-gray-100"
                    )}
                  >
                    Browse
                  </Link>
                  <Link
                    href="/for-you"
                    className={cn(
                      "px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                      pathname === "/for-you"
                        ? "text-gray-900 bg-gray-100"
                        : "text-gray-700 hover:bg-gray-100"
                    )}
                  >
                    For You
                  </Link>
                  <Link
                    href="/marketplace?space=stores"
                    className={cn(
                      "px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                      pathname === "/marketplace" && spaceParam === "stores"
                        ? "text-gray-900 bg-gray-100"
                        : "text-gray-700 hover:bg-gray-100"
                    )}
                  >
                    Bike stores
                  </Link>
                  <Link
                    href="/marketplace/help"
                    className={cn(
                      "px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                      pathname.startsWith("/marketplace/help")
                        ? "text-gray-900 bg-gray-100"
                        : "text-gray-700 hover:bg-gray-100"
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <HelpCircle className="h-3.5 w-3.5" />
                      Help
                    </span>
                  </Link>
                  <div className="w-px h-5 bg-gray-200 mx-1" aria-hidden />
                </>
              )}
              <Button
                variant="ghost"
                onClick={() => openAuthModal({ mode: "signin" })}
                className="rounded-md text-sm font-medium hover:bg-gray-100 h-9 px-4"
              >
                Sign in
              </Button>
              <Button
                onClick={() => openAuthModal({ mode: "signup" })}
                className="rounded-md bg-[#ffde59] hover:bg-[#f0cf45] text-gray-900 font-semibold h-9 px-4 text-sm shadow-sm hover:shadow-md transition-all"
              >
                Create account
              </Button>
            </>
          )
        )}
    </div>
  );
}

export function DesktopHeaderPill() {
  return (
    <Suspense fallback={null}>
      <DesktopHeaderPillContent />
    </Suspense>
  );
}
