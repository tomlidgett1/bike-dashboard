"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Menu, X, Settings, LogOut, ChevronDown, Search, Package, Store, User, Edit, ShoppingBag, Clock, HelpCircle, Plus, Mail, Loader2, Bell, SlidersHorizontal } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { InstantSearch } from "./instant-search";
import { DesktopHeaderPill } from "./desktop-header-pill";
import { getMarketplaceUserNavLabels } from "@/lib/marketplace-nav";
import { CartButton } from "./cart-button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import { useAuthModal } from "@/components/providers/auth-modal-provider";
import { useUserProfile } from "@/components/providers/profile-provider";
import { useSellModal } from "@/components/providers/sell-modal-provider";
import { UserAvatar } from "@/components/ui/user-avatar";
import { createClient } from "@/lib/supabase/client";
import { useCombinedUnreadCount } from "@/lib/hooks/use-combined-unread-count";
import { NotificationsDropdown } from "@/components/layout/notifications-dropdown";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { useUpload } from "@/components/providers/upload-provider";
// Space navigator import removed - now integrated into UnifiedFilterBar
import type { ListingImage } from "@/lib/types/listing";
import type { MarketplaceSpace } from "@/lib/types/marketplace";
const AuthModal = dynamic(
  () => import("@/components/marketplace/auth-modal").then((mod) => mod.AuthModal),
  { ssr: false }
);
const FacebookImportModal = dynamic(
  () => import("./sell/facebook-import-modal").then((mod) => mod.FacebookImportModal),
  { ssr: false }
);
const SmartUploadModal = dynamic(
  () => import("./sell/smart-upload-modal").then((mod) => mod.SmartUploadModal),
  { ssr: false }
);
const MobileUploadMethodDialog = dynamic(
  () => import("./sell/mobile-upload-method-dialog").then((mod) => mod.MobileUploadMethodDialog),
  { ssr: false }
);
const TextUploadDialog = dynamic(
  () => import("./sell/text-upload-dialog").then((mod) => mod.TextUploadDialog),
  { ssr: false }
);
const BulkUploadSheet = dynamic(
  () => import("./sell/bulk-upload-sheet").then((mod) => mod.BulkUploadSheet),
  { ssr: false }
);
const CreateListingDialog = dynamic(
  () => import("./sell/create-listing-dialog").then((mod) => mod.CreateListingDialog),
  { ssr: false }
);
const QuickUploadSheet = dynamic(
  () => import("./sell/quick-upload-sheet").then((mod) => mod.QuickUploadSheet),
  { ssr: false }
);

function formatRelativeTime(value: string) {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";

  const seconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  const rtf = new Intl.RelativeTimeFormat("en-AU", { numeric: "auto" });

  if (abs < 60) return rtf.format(seconds, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 2592000) return rtf.format(Math.round(seconds / 86400), "day");
  return rtf.format(Math.round(seconds / 2592000), "month");
}

// ============================================================
// Mobile Nav Item Component
// ============================================================

interface MobileNavItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  subtitle?: string;
  onClick: () => void;
}

function UberLogoIcon({ className }: { className?: string }) {
  // The wide Uber wordmark keeps its natural aspect ratio (no squashing) and is
  // centred within the nav row's standard icon slot so the labels stay aligned.
  return (
    <span className={cn("flex items-center justify-center", className)}>
      <Image
        src="/uber.png"
        alt="Uber"
        width={52}
        height={22}
        className="h-3 w-auto max-w-none"
        unoptimized
      />
    </span>
  );
}

function MobileNavItem({ icon: Icon, label, subtitle, onClick }: MobileNavItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left hover:bg-gray-100 transition-colors"
    >
      <Icon className="h-5 w-5 text-gray-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {subtitle && (
          <p className="text-xs text-gray-500">{subtitle}</p>
        )}
      </div>
    </button>
  );
}

// ============================================================
// Marketplace Header
// Full-width responsive header with enterprise search
// ============================================================

interface MarketplaceHeaderProps {
  /** When true, shows a search icon button on mobile that expands to full search */
  compactSearchOnMobile?: boolean;
  /** When true, shows the floating List Item button on mobile */
  showFloatingButton?: boolean;
  /** When true, shows the mobile space navigator below the header */
  showSpaceNavigator?: boolean;
  /** Current space for the space navigator */
  currentSpace?: MarketplaceSpace;
  /** Callback when space changes */
  onSpaceChange?: (space: MarketplaceSpace) => void;
  /** When true, shows a loading progress bar at the top of the header */
  isNavigating?: boolean;
  /** When true, indicates sticky filters are visible (triggers button animation on mobile) */
  showStickyFilters?: boolean;
  /** Mobile marketplace Browse: floating filter FAB next to Sell Now (icon only; opens browse filter sheet). */
  showMobileBrowseFiltersFab?: boolean;
  mobileBrowseFiltersBadge?: number;
  onOpenMobileBrowseFilters?: () => void;
  /** Sort control shown beside the mobile search icon on browse pages. */
  mobileBrowseSort?: React.ReactNode;
}

export function MarketplaceHeader({ 
  compactSearchOnMobile = true, 
  showFloatingButton = false,
  showSpaceNavigator = false,
  currentSpace = 'marketplace',
  onSpaceChange,
  isNavigating = false,
  showStickyFilters = false,
  showMobileBrowseFiltersFab = false,
  mobileBrowseFiltersBadge = 0,
  onOpenMobileBrowseFilters,
  mobileBrowseSort,
}: MarketplaceHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);
  const [messagesSheetOpen, setMessagesSheetOpen] = React.useState(false);
  const [sellRequirementModalOpen, setSellRequirementModalOpen] = React.useState(false);
  const [facebookModalOpen, setFacebookModalOpen] = React.useState(false);
  const [smartUploadModalOpen, setSmartUploadModalOpen] = React.useState(false);
  const [textUploadDialogOpen, setTextUploadDialogOpen] = React.useState(false);
  const [mobileUploadMethodOpen, setMobileUploadMethodOpen] = React.useState(false);
  const [bulkUploadSheetOpen, setBulkUploadSheetOpen] = React.useState(false);
  const [createListingDialogOpen, setCreateListingDialogOpen] = React.useState(false);
  const [quickUploadMode, setQuickUploadMode] = React.useState<"guided" | "form" | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { isUploading } = useUpload();
  
  // Derive listing type for search from current space
  const searchListingType = currentSpace === 'stores' || currentSpace === 'uber'
    ? 'store_inventory' as const
    : currentSpace === 'marketplace' 
      ? 'private_listing' as const
      : null;
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { profile, loading } = useUserProfile();
  const isGuestLayout = !user;
  const { registerHandler } = useSellModal();
  const supabase = createClient();
  
  // Defer unread count fetching until after initial render
  // This prevents blocking the page load with unread count API calls
  const [shouldFetchUnread, setShouldFetchUnread] = React.useState(false);
  
  React.useEffect(() => {
    // Defer fetching by 500ms to prioritize page content
    const timer = setTimeout(() => {
      setShouldFetchUnread(true);
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);
  
  // Only fetch unread count if user is authenticated AND deferral period has passed
  const { counts } = useCombinedUnreadCount(user && shouldFetchUnread ? 30000 : 0); // 0 = disabled polling
  const unreadCount = counts.total;
  
  // Lazy-loaded conversations for the mobile messages sheet
  const [messageConversations, setMessageConversations] = React.useState<Array<{
    id: string;
    conversation_id: string;
    is_read: boolean;
    created_at: string;
    sender?: { name?: string; business_name?: string };
    message?: { content?: string };
  }>>([]);
  const [messagesLoading, setMessagesLoading] = React.useState(false);
  
  // Active conversation within the sheet (for inline viewing)
  const [activeSheetConversation, setActiveSheetConversation] = React.useState<{
    id: string;
    senderName: string;
  } | null>(null);
  const [conversationMessages, setConversationMessages] = React.useState<Array<{
    id: string;
    content: string;
    sender_id: string;
    created_at: string;
    is_own: boolean;
  }>>([]);
  const [conversationLoading, setConversationLoading] = React.useState(false);
  
  // Fetch messages only when sheet opens - uses optimized quick-list endpoint
  React.useEffect(() => {
    if (messagesSheetOpen && user && !activeSheetConversation) {
      const fetchMessages = async () => {
        setMessagesLoading(true);
        try {
          const response = await fetch('/api/messages/quick-list?limit=10');
          if (response.ok) {
            const data = await response.json();
            setMessageConversations(data.conversations || []);
          }
        } catch (error) {
          console.error('Error fetching messages:', error);
        } finally {
          setMessagesLoading(false);
        }
      };
      fetchMessages();
    }
  }, [messagesSheetOpen, user, activeSheetConversation]);
  
  // Fetch conversation messages when viewing a conversation in sheet
  React.useEffect(() => {
    if (activeSheetConversation && user) {
      const fetchConversation = async () => {
        setConversationLoading(true);
        try {
          // Use quick endpoint - only fetches messages, no extras
          const response = await fetch(`/api/messages/conversations/${activeSheetConversation.id}/quick`);
          if (response.ok) {
            const data = await response.json();
            setConversationMessages(data.messages || []);
          }
        } catch (error) {
          console.error('Error fetching conversation:', error);
        } finally {
          setConversationLoading(false);
        }
      };
      fetchConversation();
    }
  }, [activeSheetConversation, user]);
  
  // Reset conversation view when sheet closes
  React.useEffect(() => {
    if (!messagesSheetOpen) {
      setActiveSheetConversation(null);
      setConversationMessages([]);
    }
  }, [messagesSheetOpen]);

  // Ensure component only renders auth UI on client-side
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Register the sell modal handler so other components can trigger it
  React.useEffect(() => {
    registerHandler(() => {
      if (user) {
        setMobileUploadMethodOpen(true);
      } else {
        setSellRequirementModalOpen(true);
      }
    });
  }, [registerHandler, user]);

  // Detect if on mobile
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Prevent body scroll when mobile search is open
  React.useEffect(() => {
    if (mobileSearchOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [mobileSearchOpen]);

  // Get display name based on account type
  // For business users, only show business_name (never fall back to name)
  const getDisplayName = () => {
    if (!profile) return user?.email || 'User';
    
    if (profile.account_type === 'bicycle_store') {
      // Only show business_name for business users, don't fall back to name
      return profile.business_name || user?.email || 'Store';
    } else {
      return profile.name || user?.email || 'User';
    }
  };

  // All authenticated users can access settings
  const canAccessSettings = () => {
    return !!user;
  };

  // Get the appropriate settings route based on account type
  const getSettingsRoute = () => {
    if (profile?.account_type === 'bicycle_store' && profile?.bicycle_store === true) {
      return '/settings'; // Bike store settings
    }
    return '/marketplace/settings'; // Individual user settings
  };

  const navLabels = getMarketplaceUserNavLabels(profile?.account_type);

  // Show profile/store image whenever we have a logo URL (including Google avatars).
  const shouldShowLogo = () => {
    return !!profile?.logo_url;
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/marketplace');
    router.refresh();
  };

  return (
    <>
      {/* Standard full-width sticky header */}
      <div className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white">
      <header className="marketplace-top-header relative overflow-visible bg-white">
        {/* Navigation Loading Bar */}
        {isNavigating && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#ffde59] overflow-hidden animate-pulse">
            <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/60 to-transparent" />
            <div className="absolute inset-y-0 left-1/3 w-1/3 bg-[#f0cf45]" />
          </div>
        )}
        <div
          className={cn(
            "px-4 sm:px-6",
            !isGuestLayout &&
              "max-sm:pr-[max(1rem,env(safe-area-inset-right,0px))]",
          )}
        >
          <div
            className={cn(
              "flex items-center min-w-0",
              isGuestLayout ? "h-12 sm:h-14" : "h-[52px] sm:h-14",
              !isGuestLayout && "max-sm:justify-between",
            )}
          >
            {/* Left: Logo */}
            <button
              onClick={() => router.push('/marketplace')}
              className="flex h-full max-h-full shrink-0 items-center hover:opacity-80 transition-opacity cursor-pointer"
            >
              <Image
                src="/yjlogo.png"
                alt="Yellow Jersey"
                width={500}
                height={60}
                className="h-5 w-auto"
                priority
              />
            </button>

            {/* Search — guests: left-aligned after logo; signed-in: centred (tablet+ only) */}
            <div
              className={cn(
                "items-center min-w-0 overflow-visible",
                isGuestLayout
                  ? "flex flex-1 justify-start gap-2 pl-2 sm:pl-3 pr-2"
                  : "hidden sm:flex flex-1 justify-center px-3 sm:px-4",
              )}
            >
              {/* Tablet (sm–lg) */}
              <div
                className={cn(
                  "hidden sm:block lg:hidden w-full",
                  isGuestLayout ? "max-w-md" : "max-w-sm mx-auto"
                )}
              >
                <InstantSearch listingType={searchListingType} spaceContext={currentSpace} />
              </div>
              {/* Desktop search */}
              <div
                className={cn(
                  "hidden lg:flex items-center border border-gray-200 rounded-md h-9 px-2 min-w-0",
                  "[&_input]:!border-0 [&_input]:!bg-transparent [&_input]:!shadow-none",
                  "[&_input]:!ring-0 [&_input:focus]:!ring-0 [&_input:focus]:!border-0",
                  "[&_input]:!h-8",
                  "[&_kbd]:!hidden",
                  isGuestLayout ? "flex-1 max-w-xl" : "w-[583px]"
                )}
              >
                <InstantSearch listingType={searchListingType} spaceContext={currentSpace} />
              </div>
            </div>

            {/* Right: mobile icons / desktop nav + sell */}
            {/* Mobile — tighter icon targets when signed in so the row fits with edge padding */}
            <div
              className={cn(
                "sm:hidden flex items-center flex-shrink-0",
                mounted && user
                  ? "gap-0.5 pl-1 pr-0.5 [&_button]:h-8 [&_button]:w-8 [&_button_svg]:h-5 [&_button_svg]:w-5"
                  : "gap-1",
              )}
            >
              <button
                onClick={() => setMobileSearchOpen(true)}
                className="h-9 w-9 rounded-md hover:bg-gray-100 transition-colors flex items-center justify-center"
                aria-label="Open search"
              >
                <Search className="h-[22px] w-[22px] text-gray-700 stroke-[2]" />
              </button>
              {mobileBrowseSort}
              {mounted && user && (
                <>
                  <NotificationsDropdown />
                  <button
                    onClick={() => compactSearchOnMobile ? router.push('/messages') : setMessagesSheetOpen(true)}
                    className="relative h-9 w-9 hover:bg-gray-100 rounded-md transition-colors flex items-center justify-center overflow-visible"
                    aria-label="Messages"
                  >
                    <Mail className="h-[22px] w-[22px] text-gray-700 stroke-[2]" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[11px] flex items-center justify-center font-bold shadow-sm z-10">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>
                </>
              )}
              <CartButton />
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="h-9 w-9 rounded-md hover:bg-gray-100 transition-colors flex items-center justify-center"
                aria-label="Open menu"
              >
                <Menu className="h-[22px] w-[22px] text-gray-700 stroke-[2]" />
              </button>
            </div>

            {/* Desktop / tablet nav + sell */}
            <div className="hidden md:flex items-center gap-1 flex-shrink-0">
              <CartButton />

              <div className="w-px h-5 bg-gray-200 mx-1 flex-shrink-0" />

              <DesktopHeaderPill />

              <div className="w-px h-5 bg-gray-200 mx-1 flex-shrink-0" />

              {mounted && (
                <Button
                  onClick={() => setCreateListingDialogOpen(true)}
                  className="group rounded-md bg-[#ffde59] hover:bg-[#f5cf3f] text-gray-900 font-semibold h-9 pl-1.5 pr-3.5 text-sm shadow-sm hover:shadow-md hover:-translate-y-px transition-all duration-200"
                >
                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-gray-900 mr-2">
                    <Plus className="h-3.5 w-3.5 text-white" strokeWidth={2.75} />
                  </span>
                  Create Listing
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>
      </div>

      {/* Mobile Space Navigator removed - now integrated into UnifiedFilterBar */}

      {/* Mobile floating action bar — single glass capsule, one primary action */}
      {showFloatingButton && mounted && !mobileUploadMethodOpen && !smartUploadModalOpen && !facebookModalOpen && !textUploadDialogOpen && !isUploading && !quickUploadMode && !bulkUploadSheetOpen && (
        <div
          className="sm:hidden fixed inset-x-0 bottom-0 z-50 pointer-events-none animate-in fade-in slide-in-from-bottom-4 duration-300"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div className="pointer-events-auto mx-auto w-full max-w-[340px] px-4">
            <div
              className="flex items-center gap-1.5 rounded-full border border-gray-200/80 bg-white/85 p-1.5 shadow-[0_4px_24px_rgba(17,17,17,0.10),0_1px_3px_rgba(17,17,17,0.06)] backdrop-blur-xl"
            >
              <button
                type="button"
                onClick={() => setMobileUploadMethodOpen(true)}
                className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-[#ffde59] px-4 py-2.5 text-[15px] font-semibold tracking-tight text-gray-900 transition-transform hover:bg-[#f0cf45] active:scale-[0.98]"
              >
                <Plus className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                <span className="truncate whitespace-nowrap">
                  {user ? "List item" : "Sell"}
                </span>
              </button>

              {showMobileBrowseFiltersFab && onOpenMobileBrowseFilters && (
                <button
                  type="button"
                  onClick={onOpenMobileBrowseFilters}
                  className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100/80 active:scale-95"
                  aria-label="Filters"
                >
                  <SlidersHorizontal className="h-[18px] w-[18px]" strokeWidth={2} />
                  {mobileBrowseFiltersBadge > 0 && (
                    <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gray-900 px-1 text-[10px] font-semibold leading-none text-white">
                      {mobileBrowseFiltersBadge > 9 ? "9+" : mobileBrowseFiltersBadge}
                    </span>
                  )}
                </button>
              )}

              {showStickyFilters && (
                <button
                  type="button"
                  onClick={() => setMobileSearchOpen(true)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100/80 active:scale-95 animate-in fade-in zoom-in-95 duration-200"
                  aria-label="Search"
                >
                  <Search className="h-[18px] w-[18px]" strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Slide-out Menu - Uses hardware-accelerated Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent 
          side="left" 
          className="w-[300px] p-0 flex flex-col gap-0 lg:hidden"
          showCloseButton={false}
        >
              {/* Header */}
              <div className="flex items-center justify-between pl-0 pr-4 h-14 border-b border-gray-200 flex-shrink-0">
                <Image
                  src="/yjlogo.png"
                  alt="Yellow Jersey"
                  width={500}
                  height={60}
                  className="ml-4 h-5 w-auto"
                  priority
                />
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 -mr-2 rounded-md hover:bg-gray-100 transition-colors"
                >
                  <X className="h-5 w-5 text-gray-700 stroke-[1.5]" />
                </button>
              </div>

              {/* User Info (if logged in) */}
              {mounted && user && (
                <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    {shouldShowLogo() ? (
                      <div className="relative h-8 w-8 rounded-full overflow-hidden border border-gray-300 flex-shrink-0">
                        <Image
                          src={profile!.logo_url!}
                          alt={getDisplayName()}
                          fill
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <UserAvatar name={getDisplayName()} size="sm" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {getDisplayName()}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {user.email}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Sell Item Button */}
              <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (user) {
                      setMobileUploadMethodOpen(true);
                    } else {
                      setSellRequirementModalOpen(true);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-md bg-[#ffde59] hover:bg-[#f0cf45] px-4 py-2.5 text-sm font-semibold text-gray-900 transition-colors"
                >
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-gray-900">
                    <Plus className="h-3 w-3 text-white" strokeWidth={2.75} />
                  </span>
                  Create Listing
                </button>
              </div>

              {/* Navigation - Scrollable */}
              <div className="flex-1 overflow-y-auto">
                {/* Browse Section - Two Distinct Spaces */}
                <div className="px-4 py-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Browse</p>
                  <nav className="space-y-1">
                    <MobileNavItem
                      icon={ShoppingBag}
                      label="Marketplace"
                      subtitle="Private sellers"
                      onClick={() => {
                        router.push('/marketplace');
                        setMobileMenuOpen(false);
                      }}
                    />
                    <MobileNavItem
                      icon={Store}
                      label="Bike Stores"
                      subtitle="Products from bike shops"
                      onClick={() => {
                        router.push('/marketplace?space=stores');
                        setMobileMenuOpen(false);
                      }}
                    />
                    <MobileNavItem
                      icon={UberLogoIcon}
                      label="Uber"
                      subtitle="Fast local delivery"
                      onClick={() => {
                        router.push('/marketplace?space=uber');
                        setMobileMenuOpen(false);
                      }}
                    />
                  </nav>
                </div>

                {/* User Section (if logged in) */}
                {mounted && user && (
                  <div className="px-4 py-3 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Your Account</p>
                    <nav className="space-y-1">
                      {/* Notifications */}
                      <MobileNavItem
                        icon={Bell}
                        label="Notifications"
                        onClick={() => {
                          router.push('/settings/purchases');
                          setMobileMenuOpen(false);
                        }}
                      />
                      
                      {/* Messages with badge */}
                      <button
                        onClick={() => {
                          router.push('/messages');
                          setMobileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left hover:bg-gray-100 transition-colors relative"
                      >
                        <Mail className="h-[18px] w-[18px] text-gray-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">Messages</p>
                        </div>
                        {unreadCount > 0 && (
                          <span className="flex-shrink-0 h-5 min-w-[20px] px-1.5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </button>
                      
                      <MobileNavItem
                        icon={Store}
                        label={navLabels.shopfront}
                        onClick={() => {
                          router.push(`/marketplace/store/${profile?.user_id || user?.id}`);
                          setMobileMenuOpen(false);
                        }}
                      />
                      <MobileNavItem
                        icon={ShoppingBag}
                        label={navLabels.orders}
                        onClick={() => {
                          router.push(
                            profile?.account_type === 'bicycle_store' && profile?.bicycle_store
                              ? '/marketplace/purchases'
                              : '/settings/purchases',
                          );
                          setMobileMenuOpen(false);
                        }}
                      />
                      <MobileNavItem
                        icon={Settings}
                        label={navLabels.settings}
                        onClick={() => {
                          router.push(getSettingsRoute());
                          setMobileMenuOpen(false);
                        }}
                      />
                    </nav>
                  </div>
                )}

                {/* Help Section */}
                <div className="px-4 py-3 border-t border-gray-100">
                  <nav className="space-y-1">
                    <MobileNavItem
                      icon={HelpCircle}
                      label="Help & Support"
                      onClick={() => {
                        router.push('/marketplace/help');
                        setMobileMenuOpen(false);
                      }}
                    />
                  </nav>
                </div>
              </div>

              {/* Footer - Sign In/Out */}
              <div className="border-t border-gray-200 p-4 flex-shrink-0">
                {mounted && user ? (
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
                ) : (
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        openAuthModal({ mode: "signin" });
                      }}
                      className="w-full rounded-md"
                    >
                      Sign in
                    </Button>
                    <Button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        openAuthModal({ mode: "signup" });
                      }}
                      className="w-full rounded-md bg-[#ffde59] hover:bg-[#f0cf45] text-gray-900 font-semibold"
                    >
                      Create account
                    </Button>
                  </div>
                )}
              </div>
        </SheetContent>
      </Sheet>

      {/* Sell Item Requirement Modal — login / sign-up (bottom sheet on mobile) */}
      <AuthModal open={sellRequirementModalOpen} onOpenChange={setSellRequirementModalOpen} />

      {/* Facebook Import Modal */}
      <FacebookImportModal
        isOpen={facebookModalOpen}
        onClose={() => setFacebookModalOpen(false)}
        onComplete={(formData, images) => {
          // Store imported data in sessionStorage for the sell wizard
          sessionStorage.setItem('facebookImportData', JSON.stringify({ formData, images }));
          setFacebookModalOpen(false);
          // Navigate to sell page - it will pick up the data from sessionStorage
          router.push('/marketplace/sell?mode=manual&ai=true');
        }}
      />

      {/* Smart Upload Modal */}
      <SmartUploadModal
        isOpen={smartUploadModalOpen}
        onClose={() => setSmartUploadModalOpen(false)}
        onComplete={(formData, imageUrls) => {
          // Detailed logging for debugging
          console.log('🔍 [HEADER] ====== STORING TO SESSION STORAGE ======');
          console.log('🔍 [HEADER] formData keys:', Object.keys(formData || {}));
          console.log('🔍 [HEADER] formData.brand:', formData.brand);
          console.log('🔍 [HEADER] formData.model:', formData.model);
          console.log('🔍 [HEADER] formData.itemType:', formData.itemType);
          console.log('🔍 [HEADER] formData.conditionRating:', formData.conditionRating);
          console.log('🔍 [HEADER] formData.bikeType:', formData.bikeType);
          console.log('🔍 [HEADER] formData.frameSize:', formData.frameSize);
          console.log('🔍 [HEADER] formData.description:', formData.description?.substring(0, 50));
          console.log('🔍 [HEADER] formData.images count:', formData.images?.length);
          formData.images?.forEach((img: ListingImage, idx: number) => {
            console.log(`🔍 [HEADER] images[${idx}]:`, {
              order: img.order,
              isPrimary: img.isPrimary,
              cardUrl: img.cardUrl,
            });
          });
          console.log('🔍 [HEADER] formData.primaryImageUrl:', formData.primaryImageUrl);
          console.log('🔍 [HEADER] imageUrls:', imageUrls);
          
          // Store imported data in sessionStorage for the sell wizard
          sessionStorage.setItem('smartUploadData', JSON.stringify({ formData, imageUrls }));
          setSmartUploadModalOpen(false);
          // Navigate to sell page - it will pick up the data from sessionStorage
          router.push('/marketplace/sell?mode=manual&ai=true');
        }}
      />

      {/* Desktop Create Listing Dialog */}
      <CreateListingDialog
        open={createListingDialogOpen}
        onOpenChange={setCreateListingDialogOpen}
        onSelectGuided={() => {
          if (user) {
            setQuickUploadMode('guided');
          } else {
            setSellRequirementModalOpen(true);
          }
        }}
        onSelectForm={() => {
          if (user) {
            setQuickUploadMode('form');
          } else {
            setSellRequirementModalOpen(true);
          }
        }}
        onSelectText={() => {
          setTextUploadDialogOpen(true);
        }}
        onSelectFacebook={() => {
          if (user) {
            setFacebookModalOpen(true);
          } else {
            setSellRequirementModalOpen(true);
          }
        }}
        onSelectBulk={() => {
          if (user) {
            setBulkUploadSheetOpen(true);
          } else {
            setSellRequirementModalOpen(true);
          }
        }}
      />

      {/* Quick Upload / Form Sheet */}
      <QuickUploadSheet
        isOpen={quickUploadMode !== null}
        mode={quickUploadMode ?? 'guided'}
        onClose={() => setQuickUploadMode(null)}
      />

      {/* Mobile Upload Method Dialog */}
      <MobileUploadMethodDialog
        isOpen={mobileUploadMethodOpen}
        onClose={() => setMobileUploadMethodOpen(false)}
        onSelectGuided={() => {
          if (user) {
            setQuickUploadMode('guided');
          } else {
            setSellRequirementModalOpen(true);
          }
        }}
        onSelectForm={() => {
          if (user) {
            setQuickUploadMode('form');
          } else {
            setSellRequirementModalOpen(true);
          }
        }}
        onSelectText={() => {
          setTextUploadDialogOpen(true);
        }}
        onSelectFacebook={() => {
          if (user) {
            setFacebookModalOpen(true);
          } else {
            setSellRequirementModalOpen(true);
          }
        }}
        onSelectBulk={() => {
          if (user) {
            setBulkUploadSheetOpen(true);
          } else {
            setSellRequirementModalOpen(true);
          }
        }}
      />

      <TextUploadDialog
        isOpen={textUploadDialogOpen}
        onClose={() => setTextUploadDialogOpen(false)}
      />

      {/* Bulk Upload Sheet (Mobile) */}
      <BulkUploadSheet
        isOpen={bulkUploadSheetOpen}
        onClose={() => setBulkUploadSheetOpen(false)}
        onComplete={(listingIds) => {
          console.log('✅ [HEADER] Bulk upload complete:', listingIds.length, 'listings created');
          setBulkUploadSheetOpen(false);
        }}
      />

      {/* Mobile Search Overlay - Full screen takeover */}
      {mobileSearchOpen && (
        <div className="fixed inset-0 z-[102] bg-white sm:hidden flex flex-col animate-in fade-in duration-200">
          {/* Full-height search with close button */}
          <div className="flex-1 flex flex-col min-h-0">
            <InstantSearch
              autoFocus
              onResultClick={() => setMobileSearchOpen(false)}
              mobileFullPage
              listingType={searchListingType}
              spaceContext={currentSpace}
              leftSlot={
                <button
                  onClick={() => setMobileSearchOpen(false)}
                  className="p-2 rounded-md active:bg-gray-100 transition-colors flex-shrink-0"
                  aria-label="Close search"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              }
            />
          </div>
        </div>
      )}

      {/* Mobile Messages Sheet - Slides in from right */}
      <Sheet open={messagesSheetOpen} onOpenChange={setMessagesSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 gap-0 flex flex-col h-full" showCloseButton={false}>
          {activeSheetConversation ? (
            <>
              {/* Conversation Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveSheetConversation(null)}
                    className="h-8 w-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
                  >
                    <ChevronDown className="h-5 w-5 text-gray-500 rotate-90" />
                  </button>
                  <SheetTitle className="text-lg font-semibold truncate flex-1">
                    {activeSheetConversation.senderName}
                  </SheetTitle>
                  <button
                    onClick={() => setMessagesSheetOpen(false)}
                    className="h-8 w-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
                  >
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>
              </div>

              {/* Conversation Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {conversationLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                  </div>
                ) : conversationMessages.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <p>No messages yet</p>
                  </div>
                ) : (
                  conversationMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'max-w-[80%] rounded-lg px-3 py-2',
                        msg.is_own
                          ? 'ml-auto bg-blue-500 text-white'
                          : 'mr-auto bg-gray-100 text-gray-900'
                      )}
                    >
                      <p className="text-sm">{msg.content}</p>
                      <p className={cn(
                        'text-xs mt-1',
                        msg.is_own ? 'text-blue-100' : 'text-gray-500'
                      )}>
                        {formatRelativeTime(msg.created_at)}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Open Full View Button */}
              <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4">
                <Button
                  variant="outline"
                  className="w-full rounded-md"
                  onClick={() => {
                    setMessagesSheetOpen(false);
                    router.push(`/messages?conversation=${activeSheetConversation.id}`);
                  }}
                >
                  Open Full Conversation
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* List Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10">
                <div className="flex items-center justify-between">
                  <SheetTitle className="text-lg font-semibold">Messages</SheetTitle>
                  <div className="flex items-center gap-3">
                    {unreadCount > 0 && (
                      <span className="text-sm text-gray-500">
                        {unreadCount} unread
                      </span>
                    )}
                    <button
                      onClick={() => setMessagesSheetOpen(false)}
                      className="h-8 w-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
                    >
                      <X className="h-5 w-5 text-gray-500" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Messages List */}
              <div className="flex-1 overflow-y-auto">
                {messagesLoading ? (
                  <div className="p-8 text-center">
                    <Loader2 className="h-8 w-8 mx-auto mb-3 text-gray-400 animate-spin" />
                    <p className="text-sm text-gray-500">Loading messages...</p>
                  </div>
                ) : messageConversations.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <Mail className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium text-gray-900">No messages yet</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Your conversations will appear here
                    </p>
                  </div>
                ) : (
                  <div>
                    {messageConversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        onClick={() => {
                          setActiveSheetConversation({
                            id: conversation.conversation_id,
                            senderName: conversation.sender?.business_name || conversation.sender?.name || 'Someone',
                          });
                        }}
                        className={cn(
                          'w-full text-left p-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0',
                          !conversation.is_read && 'bg-blue-50/50'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {/* Avatar */}
                          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium">
                            {conversation.sender?.name?.[0]?.toUpperCase() ||
                              conversation.sender?.business_name?.[0]?.toUpperCase() ||
                              '?'}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {conversation.sender?.business_name ||
                                conversation.sender?.name ||
                                'Someone'}
                            </p>
                            <p className="text-sm text-gray-600 line-clamp-2 mt-0.5">
                              {conversation.message?.content || 'Sent you a message'}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {formatRelativeTime(conversation.created_at)}
                            </p>
                          </div>

                          {/* Unread Indicator */}
                          {!conversation.is_read && (
                            <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-2" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* View All Button */}
              <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4">
                <Button
                  variant="outline"
                  className="w-full rounded-md"
                  onClick={() => {
                    setMessagesSheetOpen(false);
                    router.push('/messages');
                  }}
                >
                  View All Messages
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
