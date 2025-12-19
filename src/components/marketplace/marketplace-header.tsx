"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { Menu, X, Settings, LogOut, Sparkles, ChevronDown, Search, Package, Store, User, Edit, ShoppingBag, Clock, HelpCircle, Plus, Mail, Loader2, Upload, Bell } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { InstantSearch } from "./instant-search";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";
import { useAuthModal } from "@/components/providers/auth-modal-provider";
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
  DialogContent,
  DialogDescription,
  DialogHeader,
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
// Space navigator import removed - now integrated into UnifiedFilterBar
import type { ListingImage } from "@/lib/types/listing";
import type { MarketplaceSpace } from "@/lib/types/marketplace";

// ============================================================
// OAuth Icon Components
// ============================================================

// Google Icon SVG Component
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

// Apple Icon SVG Component
function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
        fill="currentColor"
      />
    </svg>
  );
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
}

export function MarketplaceHeader({ 
  compactSearchOnMobile = true, 
  showFloatingButton = false,
  showSpaceNavigator = false,
  currentSpace = 'marketplace',
  onSpaceChange,
  isNavigating = false,
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
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [appleLoading, setAppleLoading] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const { scrollY } = useScroll();
  const router = useRouter();
  
  // Derive listing type for search from current space
  const searchListingType = currentSpace === 'stores' 
    ? 'store_inventory' as const
    : currentSpace === 'marketplace' 
      ? 'private_listing' as const
      : null;
  const { user } = useAuth();
  const { profile, loading } = useUserProfile();
  const { openAuthModal } = useAuthModal();
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

  // Check if user is a bicycle store with logo
  const shouldShowLogo = () => {
    return profile?.account_type === 'bicycle_store' && profile?.logo_url;
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/marketplace');
    router.refresh();
  };

  // Get the site URL for OAuth redirects
  const getSiteUrl = () => {
    if (typeof window !== 'undefined' && window.location.hostname.includes('ngrok')) {
      return window.location.origin;
    }
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      return process.env.NEXT_PUBLIC_SITE_URL;
    }
    return typeof window !== 'undefined' ? window.location.origin : '';
  };

  // Handle Google OAuth sign-in
  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${getSiteUrl()}/auth/callback?next=/marketplace`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) throw error;
    } catch (error: any) {
      console.error("Google sign-in error:", error.message);
      setGoogleLoading(false);
    }
  };

  // Handle Apple OAuth sign-in
  const handleAppleSignIn = async () => {
    try {
      setAppleLoading(true);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: {
          redirectTo: `${getSiteUrl()}/auth/callback?next=/marketplace`,
        },
      });

      if (error) throw error;
    } catch (error: any) {
      console.error("Apple sign-in error:", error.message);
      setAppleLoading(false);
    }
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
      <motion.header
        style={{
          boxShadow: headerShadow,
          backgroundColor: headerBg,
        }}
        className="fixed top-0 left-0 right-0 z-40 w-full border-b border-gray-200 backdrop-blur-sm"
      >
        {/* Navigation Loading Bar */}
        <AnimatePresence>
          {isNavigating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute top-0 left-0 right-0 h-1 bg-[#FFC72C] overflow-hidden"
            >
              {/* Animated shimmer effect */}
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: "200%" }}
                transition={{
                  repeat: Infinity,
                  duration: 1.2,
                  ease: "easeInOut",
                }}
                className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/60 to-transparent"
              />
              {/* Indeterminate progress animation */}
              <motion.div
                initial={{ left: "-40%", width: "40%" }}
                animate={{ left: "100%", width: "40%" }}
                transition={{
                  repeat: Infinity,
                  duration: 1,
                  ease: [0.4, 0, 0.2, 1],
                }}
                className="absolute inset-y-0 bg-[#E6B328]"
              />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6">
          <div className="flex h-14 sm:h-16 items-center justify-start gap-2 sm:gap-4">
            {/* Logo - Left side on mobile */}
            <button
              onClick={() => router.push('/marketplace')}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0 cursor-pointer translate-y-[1px]"
            >
              <Image 
                src="/yj.svg" 
                alt="Yellow Jersey" 
                width={220} 
                height={36}
                className="h-28 w-auto sm:h-32"
                priority
                unoptimized
              />
            </button>

            {/* Desktop Search Bar (always visible) + Mobile Search (conditional) */}
            {compactSearchOnMobile ? (
              <>
                {/* Desktop: Full search bar */}
                <div className="hidden sm:block flex-[2] ml-[14px]">
                  <InstantSearch listingType={searchListingType} />
                </div>
                {/* Mobile: Search icon, Messages button, and Hamburger (far right) */}
                <div className="sm:hidden flex items-center gap-1 ml-auto">
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
                        onClick={() => router.push('/messages')}
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
                  {/* Mobile Menu Button - Far right */}
                  <button
                    onClick={() => setMobileMenuOpen(true)}
                    className="p-2 -mr-2 rounded-md hover:bg-gray-100 transition-colors flex-shrink-0 cursor-pointer"
                    aria-label="Open menu"
                  >
                    <Menu className="h-5 w-5 text-gray-700 stroke-[1.5]" />
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Always hide search on mobile, show on desktop */}
                <div className="hidden sm:block flex-[2] ml-[14px]">
                  <InstantSearch listingType={searchListingType} />
                </div>
                {/* Mobile: Search icon, Messages button, and Hamburger (far right) */}
                <div className="sm:hidden flex items-center gap-1 ml-auto">
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
                        onClick={() => setMessagesSheetOpen(true)}
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
                  {/* Mobile Menu Button - Far right */}
                  <button
                    onClick={() => setMobileMenuOpen(true)}
                    className="p-2 -mr-2 rounded-md hover:bg-gray-100 transition-colors flex-shrink-0 cursor-pointer"
                    aria-label="Open menu"
                  >
                    <Menu className="h-5 w-5 text-gray-700 stroke-[1.5]" />
                  </button>
                </div>
              </>
            )}

            {/* Desktop Actions - Fixed on far right */}
            <div className="hidden lg:flex items-center gap-3 flex-shrink-0 ml-auto">
              {mounted && user ? (
                <>
                  {/* Icons Group - Messages and Profile */}
                  <div className="flex items-center gap-3">
                    {/* Messages Button */}
                    <NotificationsDropdown />

                    <button
                      onClick={() => router.push('/messages')}
                      className="relative h-9 w-9 rounded-full border border-gray-300 hover:bg-gray-100 transition-colors cursor-pointer flex items-center justify-center"
                      aria-label="Messages"
                    >
                      <Mail className="h-[18px] w-[18px] text-gray-700 stroke-[2]" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </button>

                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <button className="outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-0 cursor-pointer">
                          {shouldShowLogo() ? (
                            <div className="relative h-9 w-9 rounded-full overflow-hidden border border-gray-300 flex-shrink-0">
                              <Image
                                src={profile!.logo_url!}
                                alt={getDisplayName()}
                                fill
                                className="object-cover"
                              />
                            </div>
                          ) : (
                            <UserAvatar name={getDisplayName()} size="sm" className="h-9 w-9 border-gray-300" />
                          )}
                        </button>
                      </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 bg-white rounded-md">
                      {canAccessSettings() && (
                        <>
                          <DropdownMenuItem
                            onClick={() => router.push(getSettingsRoute())}
                            className="cursor-pointer rounded-md"
                          >
                            <Settings className="mr-2 h-4 w-4" />
                            <span>Settings</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem
                        onClick={handleSignOut}
                        className="cursor-pointer text-red-600 focus:text-red-600 rounded-md"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Sign Out</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  </div>

                  {/* Sell Button */}
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="rounded-md bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-medium shadow-sm"
                      >
                        Sell Item
                        <ChevronDown className="ml-1.5 h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 bg-white rounded-md">
                      <DropdownMenuItem
                        onClick={() => setSmartUploadModalOpen(true)}
                        className="cursor-pointer rounded-md"
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        <div className="flex flex-col">
                          <span className="font-medium">Quick Upload</span>
                          <span className="text-xs text-gray-500">AI-powered analysis</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setFacebookModalOpen(true)}
                        className="cursor-pointer rounded-md"
                      >
                        <Image src="/facebook.png" alt="Facebook" width={16} height={16} className="mr-2" />
                        <div className="flex flex-col">
                          <span className="font-medium">Facebook Import</span>
                          <span className="text-xs text-gray-500">Import from Facebook</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => router.push('/marketplace/sell?mode=bulk')}
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
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={openAuthModal}
                    className="rounded-md border-[#FFE8B3] hover:bg-[#FFF8E5] hover:border-[#FFC72C]"
                  >
                    Sign In
                  </Button>
                  {mounted && (
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          className="rounded-md bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-medium shadow-sm"
                        >
                          Sell Item
                          <ChevronDown className="ml-1.5 h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 bg-white rounded-md">
                      <DropdownMenuItem
                        onClick={() => setSellRequirementModalOpen(true)}
                        className="cursor-pointer rounded-md"
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        <div className="flex flex-col">
                          <span className="font-medium">Quick Upload</span>
                          <span className="text-xs text-gray-500">AI-powered analysis</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setSellRequirementModalOpen(true)}
                        className="cursor-pointer rounded-md"
                      >
                        <Image src="/facebook.png" alt="Facebook" width={16} height={16} className="mr-2" />
                        <div className="flex flex-col">
                          <span className="font-medium">Facebook Import</span>
                          <span className="text-xs text-gray-500">Import from Facebook</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setSellRequirementModalOpen(true)}
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
                </>
              )}
            </div>
          </div>
        </div>
      </motion.header>

      {/* Mobile Space Navigator removed - now integrated into UnifiedFilterBar */}

      {/* Mobile Floating List Item Button - Only shown on homepage and product pages */}
      {showFloatingButton && mounted && !mobileUploadMethodOpen && !smartUploadModalOpen && !facebookModalOpen && (
        <div className="sm:hidden fixed bottom-6 left-4 right-4 z-50">
          <Button
            onClick={() => {
              if (user) {
                setMobileUploadMethodOpen(true);
              } else {
                setSellRequirementModalOpen(true);
              }
            }}
            className="w-full rounded-md bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-medium shadow-lg h-12 flex items-center justify-center gap-2"
          >
            <Plus className="h-5 w-5" />
            <span>List Item</span>
            {!user && <span className="text-xs opacity-80">(Sign in required)</span>}
          </Button>
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
              <div className="flex items-center justify-between pl-0 pr-4 h-16 border-b border-gray-200 flex-shrink-0">
                <Image 
                  src="/yj.svg" 
                  alt="Yellow Jersey" 
                  width={280} 
                  height={56}
                  className="h-20 w-auto ml-4"
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
                  className="w-full flex items-center justify-center gap-2 rounded-md bg-[#FFC72C] hover:bg-[#E6B328] px-4 py-2.5 text-sm font-medium text-gray-900 transition-colors"
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
                      openAuthModal();
                    }}
                    className="w-full rounded-md bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-medium"
                  >
                    Sign In
                  </Button>
                )}
              </div>
        </SheetContent>
      </Sheet>

      {/* Sell Item Requirement Modal */}
      <Dialog open={sellRequirementModalOpen} onOpenChange={setSellRequirementModalOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-gray-900">
              Sign in required
            </DialogTitle>
            <DialogDescription className="text-gray-600 pt-2">
              You must create an account or sign in to list an item on Yellow Jersey.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col gap-3 pt-4">
            {/* Google Sign-In Button */}
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || appleLoading}
              className="w-full h-11 text-base font-medium rounded-md border-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-transform"
            >
              {googleLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <GoogleIcon className="mr-2 h-5 w-5" />
              )}
              Continue with Google
            </Button>

            {/* Apple Sign-In Button */}
            <Button
              type="button"
              onClick={handleAppleSignIn}
              disabled={googleLoading || appleLoading}
              className="w-full h-11 text-base font-medium rounded-md bg-black hover:bg-gray-800 text-white active:scale-[0.98] transition-transform"
            >
              {appleLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <AppleIcon className="mr-2 h-5 w-5" />
              )}
              Continue with Apple
            </Button>

            {/* Divider */}
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-500">Or</span>
              </div>
            </div>

            {/* Email Sign In Button */}
            <Button
              variant="outline"
              onClick={() => {
                setSellRequirementModalOpen(false);
                openAuthModal();
              }}
              className="w-full rounded-md border-gray-300 hover:bg-gray-50"
            >
              Continue with Email
            </Button>
          </div>
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
          formData.images?.forEach((img: any, idx: number) => {
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

