"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { Menu, X, Settings, LogOut, Sparkles, FileText, ChevronDown, Search, Package, Store, User, Edit, ShoppingBag, Clock, HelpCircle, Plus, Mail, Loader2, Upload } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { InstantSearch } from "./instant-search";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";
import { useAuthModal } from "@/components/providers/auth-modal-provider";
import { UserAvatar } from "@/components/ui/user-avatar";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FacebookImportModal } from "./sell/facebook-import-modal";
import { SmartUploadModal } from "./sell/smart-upload-modal";
import { MobileUploadMethodDialog } from "./sell/mobile-upload-method-dialog";
import type { ListingImage } from "@/lib/types/listing";

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
}

export function MarketplaceHeader({ compactSearchOnMobile = true, showFloatingButton = false }: MarketplaceHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);
  const [sellRequirementModalOpen, setSellRequirementModalOpen] = React.useState(false);
  const [facebookModalOpen, setFacebookModalOpen] = React.useState(false);
  const [smartUploadModalOpen, setSmartUploadModalOpen] = React.useState(false);
  const [mobileUploadMethodOpen, setMobileUploadMethodOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [appleLoading, setAppleLoading] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const { scrollY } = useScroll();
  const router = useRouter();
  const { user } = useAuth();
  const { profile, loading } = useUserProfile();
  const { openAuthModal } = useAuthModal();
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

  // Ensure component only renders auth UI on client-side
  React.useEffect(() => {
    setMounted(true);
  }, []);

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
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6">
          <div className="flex h-14 sm:h-16 items-center justify-start gap-2 sm:gap-4">
            {/* Mobile Menu Button and Logo Container */}
            <div className="flex items-center gap-2 lg:gap-2">
              {/* Mobile Menu Button - Left of logo */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 -ml-2 rounded-md hover:bg-gray-100 transition-colors flex-shrink-0 cursor-pointer z-10"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5 text-gray-700 stroke-[1.5]" />
              </button>

              {/* Logo */}
              <button
                onClick={() => router.push('/marketplace')}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0 cursor-pointer translate-y-[1px]"
              >
                <Image 
                  src="/yj.svg" 
                  alt="Yellow Jersey" 
                  width={220} 
                  height={36}
                  className="h-24 w-auto sm:h-32"
                />
              </button>
            </div>

            {/* Desktop Search Bar (always visible) + Mobile Search (conditional) */}
            {compactSearchOnMobile ? (
              <>
                {/* Desktop: Full search bar */}
                <div className="hidden sm:block flex-[2] ml-[14px]">
                  <InstantSearch />
                </div>
                {/* Mobile: Search icon and Messages button (if logged in) */}
                <div className="sm:hidden flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => setMobileSearchOpen(true)}
                    className="h-9 w-9 rounded-md hover:bg-gray-100 transition-colors flex items-center justify-center"
                    aria-label="Open search"
                  >
                    <Search className="h-[18px] w-[18px] text-gray-700 stroke-[2]" />
                  </button>
                  {mounted && user && (
                    <button
                      onClick={() => router.push('/messages')}
                      className="relative h-9 w-9 hover:bg-gray-100 rounded-md transition-colors flex items-center justify-center"
                      aria-label="Messages"
                    >
                      <Mail className="h-[18px] w-[18px] text-gray-700 stroke-[2]" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Always hide search on mobile, show on desktop */}
                <div className="hidden sm:block flex-[2] ml-[14px]">
                  <InstantSearch />
                </div>
                {/* Mobile: Search icon and Messages button (if logged in) */}
                <div className="sm:hidden flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => setMobileSearchOpen(true)}
                    className="h-9 w-9 rounded-md hover:bg-gray-100 transition-colors flex items-center justify-center"
                    aria-label="Open search"
                  >
                    <Search className="h-[18px] w-[18px] text-gray-700 stroke-[2]" />
                  </button>
                  {mounted && user && (
                    <button
                      onClick={() => router.push('/messages')}
                      className="relative h-9 w-9 hover:bg-gray-100 rounded-md transition-colors flex items-center justify-center"
                      aria-label="Messages"
                    >
                      <Mail className="h-[18px] w-[18px] text-gray-700 stroke-[2]" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </button>
                  )}
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
                      <DropdownMenuItem
                        onClick={() => router.push('/marketplace/sell?mode=manual')}
                        className="cursor-pointer rounded-md"
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        <div className="flex flex-col">
                          <span className="font-medium">Standard Upload</span>
                          <span className="text-xs text-gray-500">Manual form entry</span>
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
                      <DropdownMenuItem
                        onClick={() => setSellRequirementModalOpen(true)}
                        className="cursor-pointer rounded-md"
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        <div className="flex flex-col">
                          <span className="font-medium">Standard Upload</span>
                          <span className="text-xs text-gray-500">Manual form entry</span>
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

      {/* Mobile Floating List Item Button - Only shown on homepage and product pages */}
      {showFloatingButton && mounted && (
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

      {/* Mobile Slide-out Menu - Rendered outside header for proper positioning */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-[100] lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Slide-out Panel */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
              className="fixed top-0 left-0 bottom-0 w-[300px] bg-white z-[101] lg:hidden flex flex-col shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 flex-shrink-0">
                <Image 
                  src="/yj.svg" 
                  alt="Yellow Jersey" 
                  width={140} 
                  height={28}
                  className="h-7"
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

              {/* Navigation - Scrollable */}
              <div className="flex-1 overflow-y-auto">
                {/* Browse Section */}
                <div className="px-4 py-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Browse</p>
                  <nav className="space-y-1">
                    <MobileNavItem
                      icon={Package}
                      label="All Products"
                      onClick={() => {
                        router.push('/marketplace');
                        setMobileMenuOpen(false);
                      }}
                    />
                    <MobileNavItem
                      icon={Store}
                      label="Stores"
                      onClick={() => {
                        router.push('/marketplace?view=stores');
                        setMobileMenuOpen(false);
                      }}
                    />
                    <MobileNavItem
                      icon={User}
                      label="Individual Sellers"
                      onClick={() => {
                        router.push('/marketplace?view=sellers');
                        setMobileMenuOpen(false);
                      }}
                    />
                  </nav>
                </div>

                {/* Sell Section */}
                <div className="px-4 py-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Sell</p>
                  <nav className="space-y-1">
                    <MobileNavItem
                      icon={Sparkles}
                      label="Quick Upload"
                      subtitle="AI-powered analysis"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        if (user) {
                          setSmartUploadModalOpen(true);
                        } else {
                          setSellRequirementModalOpen(true);
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        if (user) {
                          setFacebookModalOpen(true);
                        } else {
                          setSellRequirementModalOpen(true);
                        }
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left hover:bg-gray-100 transition-colors"
                    >
                      <Image src="/facebook.png" alt="Facebook" width={20} height={20} className="flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">Facebook Import</p>
                        <p className="text-xs text-gray-500">Import from Facebook</p>
                      </div>
                    </button>
                    <MobileNavItem
                      icon={Upload}
                      label="Bulk Upload"
                      subtitle="Upload multiple products"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        if (user) {
                          router.push('/marketplace/sell?mode=bulk');
                        } else {
                          setSellRequirementModalOpen(true);
                        }
                      }}
                    />
                    <MobileNavItem
                      icon={FileText}
                      label="Standard Upload"
                      subtitle="Manual form entry"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        if (user) {
                          router.push('/marketplace/sell?mode=manual');
                        } else {
                          setSellRequirementModalOpen(true);
                        }
                      }}
                    />
                  </nav>
                </div>

                {/* User Section (if logged in) */}
                {mounted && user && (
                  <div className="px-4 py-3 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Your Account</p>
                    <nav className="space-y-1">
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
                        icon={Edit}
                        label="My Listings"
                        onClick={() => {
                          router.push('/settings/my-listings');
                          setMobileMenuOpen(false);
                        }}
                      />
                      <MobileNavItem
                        icon={FileText}
                        label="Draft Listings"
                        onClick={() => {
                          router.push('/settings/drafts');
                          setMobileMenuOpen(false);
                        }}
                      />
                      <MobileNavItem
                        icon={ShoppingBag}
                        label="My Purchases"
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
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
          router.push('/marketplace/sell?mode=bulk');
        }}
        onSelectComprehensive={() => {
          router.push('/marketplace/sell');
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
            className="fixed inset-0 z-[102] bg-white sm:hidden flex flex-col overflow-hidden"
          >
            {/* Search Header */}
            <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 flex-shrink-0">
              {/* Back/Close button */}
              <button
                onClick={() => setMobileSearchOpen(false)}
                className="p-2 -ml-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
                aria-label="Close search"
              >
                <X className="h-5 w-5 text-gray-700 stroke-[1.5]" />
              </button>
              <span className="text-sm font-medium text-gray-900">Search</span>
            </div>
            
            {/* Search input and results - full page mode */}
            <div className="flex-1 flex flex-col min-h-0 px-3 py-3 overflow-hidden">
              <InstantSearch 
                autoFocus 
                onResultClick={() => setMobileSearchOpen(false)} 
                mobileFullPage 
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

