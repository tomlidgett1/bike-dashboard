"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Mail,
  Settings,
  LogOut,
  Store,
  ShoppingBag,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { NotificationsDropdown } from "@/components/layout/notifications-dropdown";
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
  shouldShowMarketplaceSidebar,
} from "@/lib/marketplace-nav";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface DesktopHeaderPillProps {}

function DesktopHeaderPillContent(_props: DesktopHeaderPillProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { openAuthModal } = useAuthModal();
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
                "px-3 py-1.5 text-sm font-medium rounded-full transition-colors whitespace-nowrap",
                pathname === "/marketplace"
                  ? "text-gray-900 bg-gray-100"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              Home
            </Link>
            <Link
              href={`/marketplace/store/${profile?.user_id || user?.id}`}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-full transition-colors whitespace-nowrap",
                pathname.startsWith("/marketplace/store/")
                  ? "text-gray-900 bg-gray-100"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              My Store
            </Link>
            <Link
              href={getPurchasesRoute()}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-full transition-colors whitespace-nowrap",
                pathname === "/marketplace/purchases" ||
                pathname === "/settings/purchases" ||
                pathname.startsWith("/marketplace/purchases/") ||
                pathname.startsWith("/settings/purchases/")
                  ? "text-gray-900 bg-gray-100"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              Order Management
            </Link>
            <Link
              href={getSettingsRoute()}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-full transition-colors whitespace-nowrap",
                pathname === "/settings" ||
                pathname === "/marketplace/settings" ||
                (pathname.startsWith("/settings/") &&
                  !pathname.startsWith("/settings/purchases"))
                  ? "text-gray-900 bg-gray-100"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              Settings
            </Link>
            <div className="w-px h-5 bg-gray-200 mx-1" aria-hidden />
          </>
        )}

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
