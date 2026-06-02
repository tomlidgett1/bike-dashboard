"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { Menu, X, Settings, LogOut, Sparkles, ChevronDown, Search, Package, Store, User, Edit, ShoppingBag, Clock, HelpCircle, Plus, Mail, Loader2, Upload, Bell, SlidersHorizontal } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { InstantSearch } from "./instant-search";
import { DesktopHeaderPill } from "./desktop-header-pill";
import { CartButton } from "./cart-button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";
import { useSellModal } from "@/components/providers/sell-modal-provider";
import { UserAvatar } from "@/components/ui/user-avatar";
import { createClient } from "@/lib/supabase/client";
import { useCombinedUnreadCount } from "@/lib/hooks/use-combined-unread-count";
import { NotificationsDropdown } from "@/components/layout/notifications-dropdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDistanceToNow } from 'date-fns';
import { FacebookImportModal } from "./sell/facebook-import-modal";
import { SmartUploadModal } from "./sell/smart-upload-modal";
import { MobileUploadMethodDialog } from "./sell/mobile-upload-method-dialog";
import { BulkUploadSheet } from "./sell/bulk-upload-sheet";
import { useUpload } from "@/components/providers/upload-provider";
// Space navigator import removed - now integrated into UnifiedFilterBar
import type { ListingImage } from "@/lib/types/listing";
import type { MarketplaceSpace } from "@/lib/types/marketplace";
import { AuthCard } from "@/components/auth/auth-card";

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
  return (
    <span className={cn("flex items-center justify-center", className)}>
      <Image
        src="/uber.png"
        alt=""
        width={26}
        height={11}
        className="h-2.5 w-auto"
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
}: MarketplaceHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);
  const [messagesSheetOpen, setMessagesSheetOpen] = React.useState(false);
  const [sellRequirementModalOpen, setSellRequirementModalOpen] = React.useState(false);
  const [facebookModalOpen, setFacebookModalOpen] = React.useState(false);
  const [smartUploadModalOpen, setSmartUploadModalOpen] = React.useState(false);
  const [mobileUploadMethodOpen, setMobileUploadMethodOpen] = React.useState(false);
  const [bulkUploadSheetOpen, setBulkUploadSheetOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const { scrollY } = useScroll();
  const router = useRouter();
  const { isUploading } = useUpload();
  
  // Derive listing type for search from current space
  const searchListingType = currentSpace === 'stores' || currentSpace === 'uber'
    ? 'store_inventory' as const
    : currentSpace === 'marketplace' 
      ? 'private_listing' as const
      : null;
  const { user } = useAuth();
  const { profile, loading } = useUserProfile();
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

  // Show profile/store image whenever we have a logo URL (including Google avatars).
  const shouldShowLogo = () => {
    return !!profile?.logo_url;
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/marketplace');
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
    <>
      {/* Floating pill header wrapper */}
      <div className="fixed top-0 left-0 right-0 z-40 px-3 sm:px-4 pt-2">
      <motion.header
        style={{ boxShadow: headerShadow }}
        className="rounded-full bg-white/95 backdrop-blur-md border border-gray-200"
      >
        {/* Navigation Loading Bar */}
        <AnimatePresence>
          {isNavigating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute top-0 left-0 right-0 h-0.5 bg-[#ffde59] overflow-hidden"
            >
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: "200%" }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/60 to-transparent"
              />
              <motion.div
                initial={{ left: "-40%", width: "40%" }}
                animate={{ left: "100%", width: "40%" }}
                transition={{ repeat: Infinity, duration: 1, ease: [0.4, 0, 0.2, 1] }}
                className="absolute inset-y-0 bg-[#f0cf45]"
              />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="px-4 sm:px-5">
          <div className="flex h-12 sm:h-14 items-center min-w-0">
            {/* Left: Logo */}
            <button
              onClick={() => router.push('/marketplace')}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0 cursor-pointer translate-y-[1px]"
            >
              <Image
                src="/yj.svg"
                alt="Yellow Jersey"
                width={220}
                height={36}
                className="h-20 w-auto sm:h-24"
                priority
                unoptimized
              />
            </button>

            {/* Center: search (flex-1 keeps it from ever overlapping the right side) */}
            <div className="flex-1 flex items-center justify-center px-3 sm:px-4 min-w-0">
              {/* Tablet (sm–md) */}
              <div className="hidden sm:block lg:hidden w-full max-w-sm">
                <InstantSearch listingType={searchListingType} spaceContext={currentSpace} />
              </div>
              {/* Desktop search pill */}
              <div className={cn(
                "hidden lg:flex items-center border border-gray-200 rounded-full h-9 px-2 w-[583px]",
                "[&_input]:!border-0 [&_input]:!bg-transparent [&_input]:!shadow-none",
                "[&_input]:!ring-0 [&_input:focus]:!ring-0 [&_input:focus]:!border-0",
                "[&_input]:!h-8",
                "[&_kbd]:!hidden",
              )}>
                <InstantSearch listingType={searchListingType} spaceContext={currentSpace} />
              </div>
            </div>

            {/* Right: mobile icons / desktop nav + sell */}
            {/* Mobile */}
            <div className="sm:hidden flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => setMobileSearchOpen(true)}
                className="h-9 w-9 rounded-md hover:bg-gray-100 transition-colors flex items-center justify-center"
                aria-label="Open search"
              >
                <Search className="h-[22px] w-[22px] text-gray-700 stroke-[2]" />
              </button>
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

            {/* Desktop nav + sell */}
            <div className="hidden lg:flex items-center gap-1 flex-shrink-0">
              <CartButton />

              <div className="w-px h-5 bg-gray-200 mx-1 flex-shrink-0" />

              <DesktopHeaderPill />

              <div className="w-px h-5 bg-gray-200 mx-1 flex-shrink-0" />

              {mounted && (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="rounded-full bg-[#ffde59] hover:bg-[#f0cf45] text-gray-900 font-semibold h-9 px-4 text-sm"
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Sell Item
                      <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-white rounded-md">
                    <DropdownMenuItem
                      onClick={() =>
                        user ? setSmartUploadModalOpen(true) : setSellRequirementModalOpen(true)
                      }
                      className="cursor-pointer rounded-md"
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      <div className="flex flex-col">
                        <span className="font-medium">Quick Upload</span>
                        <span className="text-xs text-gray-500">AI-powered analysis</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        user ? setFacebookModalOpen(true) : setSellRequirementModalOpen(true)
                      }
                      className="cursor-pointer rounded-md"
                    >
                      <Image src="/facebook.png" alt="Facebook" width={16} height={16} className="mr-2" />
                      <div className="flex flex-col">
                        <span className="font-medium">Facebook Import</span>
                        <span className="text-xs text-gray-500">Import from Facebook</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        user
                          ? router.push('/marketplace/sell?mode=bulk')
                          : setSellRequirementModalOpen(true)
                      }
                      className="cursor-pointer rounded-md"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      <div className="flex flex-col">
                        <span className="font-medium">Bulk Upload</span>
                        <span className="text-xs text-gray-500">Upload multiple products</span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </motion.header>
      </div>{/* end floating pill wrapper */}

      {/* Mobile Space Navigator removed - now integrated into UnifiedFilterBar */}

      {/* Mobile Floating List Item Button - Only shown on homepage and product pages */}
      {showFloatingButton && mounted && !mobileUploadMethodOpen && !smartUploadModalOpen && !facebookModalOpen && !isUploading && (
        <motion.div 
          initial={{ y: 100, opacity: 0 }}
          animate={{ 
            y: 0, 
            opacity: 1,
          }}
          transition={{ 
            y: { delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
            opacity: { delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
          }}
          className="sm:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="flex items-center gap-3 justify-center">
            <motion.button
              onClick={() => {
                if (user) {
                  setMobileUploadMethodOpen(true);
                } else {
                  setSellRequirementModalOpen(true);
                }
              }}
              whileTap={{ scale: 0.95 }}
              className="relative"
              layout
              transition={{ 
                layout: { duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }
              }}
            >
              {/* Main button */}
              <div className="relative flex items-center gap-2.5 px-6 py-3.5 bg-[#ffde59] rounded-full border border-white/20 shadow-lg">
                <div className="flex items-center justify-center w-6 h-6 bg-gray-900 rounded-full">
                  <Plus className="h-4 w-4 text-white" strokeWidth={2.5} />
                </div>
                <span className="text-gray-900 font-semibold text-[15px] tracking-tight pr-1 whitespace-nowrap">
                  {user ? 'List Item' : 'Sell Now'}
                </span>
              </div>
            </motion.button>

            {showMobileBrowseFiltersFab && onOpenMobileBrowseFilters && (
              <motion.button
                type="button"
                onClick={onOpenMobileBrowseFilters}
                whileTap={{ scale: 0.95 }}
                className="relative"
                layout
                aria-label="Filters"
                transition={{
                  layout: { duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }
                }}
              >
                <div className="relative flex items-center justify-center px-4 py-3.5 bg-[#ffde59] rounded-full border border-white/20 shadow-lg">
                  <div className="flex items-center justify-center w-6 h-6 bg-gray-900 rounded-full">
                    <SlidersHorizontal className="h-4 w-4 text-white" strokeWidth={2.5} />
                  </div>
                  {mobileBrowseFiltersBadge > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-md bg-gray-900 px-1 text-[10px] font-semibold text-white shadow-sm">
                      {mobileBrowseFiltersBadge > 9 ? "9+" : mobileBrowseFiltersBadge}
                    </span>
                  )}
                </div>
              </motion.button>
            )}

            {/* Circular Search Button - Appears when sticky filters are visible */}
            <AnimatePresence mode="popLayout">
              {showStickyFilters && (
                <motion.button
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ 
                    duration: 0.4,
                    ease: [0.04, 0.62, 0.23, 0.98]
                  }}
                  onClick={() => setMobileSearchOpen(true)}
                  whileTap={{ scale: 0.9 }}
                  className="flex items-center justify-center w-[54px] h-[54px] bg-[#ffde59] rounded-full border border-white/20 shadow-lg"
                  aria-label="Search"
                >
                  <Search className="h-5 w-5 text-gray-900 stroke-[2]" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
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
                  src="/yj.svg"
                  alt="Yellow Jersey"
                  width={280}
                  height={56}
                  className="h-24 w-auto ml-4"
                  priority
                  unoptimized
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
                      setSmartUploadModalOpen(true);
                    } else {
                      setSellRequirementModalOpen(true);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-md bg-[#ffde59] hover:bg-[#f0cf45] px-4 py-2.5 text-sm font-medium text-gray-900 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Sell Item
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
                        label="My Store"
                        onClick={() => {
                          router.push(`/marketplace/store/${profile?.user_id || user?.id}`);
                          setMobileMenuOpen(false);
                        }}
                      />
                      <MobileNavItem
                        icon={ShoppingBag}
                        label="Order Management"
                        onClick={() => {
                          router.push('/settings/purchases');
                          setMobileMenuOpen(false);
                        }}
                      />
                      <MobileNavItem
                        icon={Settings}
                        label="Settings"
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
                  <Button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      router.push("/login");
                    }}
                    className="w-full rounded-md bg-[#ffde59] hover:bg-[#f0cf45] text-gray-900 font-medium"
                  >
                    Sign In
                  </Button>
                )}
              </div>
        </SheetContent>
      </Sheet>

      {/* Sell Item Requirement Modal */}
      <Dialog open={sellRequirementModalOpen} onOpenChange={setSellRequirementModalOpen}>
        <DialogContent
          showCloseButton={false}
          className="w-full max-w-[420px] gap-0 border-0 bg-transparent p-0 text-popover-foreground ring-0 sm:max-w-[420px]"
        >
          <DialogTitle className="sr-only">Sign in to list an item</DialogTitle>
          <DialogDescription className="sr-only">
            Sign in or create an account to list an item on Yellow Jersey.
          </DialogDescription>
          <AuthCard
            onAuthenticated={({ destination }) => {
              setSellRequirementModalOpen(false);

              if (destination === "/settings") {
                router.push(destination);
              }

              router.refresh();
            }}
          />
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute -right-3 -top-3 rounded-full bg-white text-gray-600 shadow-lg ring-1 ring-black/5 hover:bg-gray-50 hover:text-gray-900"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
        </DialogContent>
      </Dialog>

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

      {/* Mobile Upload Method Dialog */}
      <MobileUploadMethodDialog
        isOpen={mobileUploadMethodOpen}
        onClose={() => setMobileUploadMethodOpen(false)}
        onSelectQuick={() => {
          setSmartUploadModalOpen(true);
        }}
        onSelectFacebook={() => {
          setFacebookModalOpen(true);
        }}
        onSelectBulk={() => {
          setBulkUploadSheetOpen(true);
        }}
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
      <AnimatePresence>
        {mobileSearchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[102] bg-white sm:hidden flex flex-col"
          >
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
          </motion.div>
        )}
      </AnimatePresence>

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
                        {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
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
                              {formatDistanceToNow(new Date(conversation.created_at), {
                                addSuffix: true,
                              })}
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
