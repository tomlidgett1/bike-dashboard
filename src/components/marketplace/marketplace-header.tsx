"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { Menu, X, Settings, LogOut, Sparkles, FileText, ChevronDown, Search, Package, Store, User, Edit, ShoppingBag, Clock, HelpCircle, Plus } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { InstantSearch } from "./instant-search";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";
import { useAuthModal } from "@/components/providers/auth-modal-provider";
import { UserAvatar } from "@/components/ui/user-avatar";
import { createClient } from "@/lib/supabase/client";
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
import type { ListingImage } from "@/lib/types/listing";

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
}

export function MarketplaceHeader({ compactSearchOnMobile = false }: MarketplaceHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);
  const [sellRequirementModalOpen, setSellRequirementModalOpen] = React.useState(false);
  const [facebookModalOpen, setFacebookModalOpen] = React.useState(false);
  const [smartUploadModalOpen, setSmartUploadModalOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const { scrollY } = useScroll();
  const router = useRouter();
  const { user } = useAuth();
  const { profile, loading } = useUserProfile();
  const { openAuthModal } = useAuthModal();
  const supabase = createClient();

  // Ensure component only renders auth UI on client-side
  React.useEffect(() => {
    setMounted(true);
  }, []);

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
        className="fixed top-0 left-0 right-0 z-50 w-full border-b border-gray-200 backdrop-blur-sm"
      >
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6">
          <div className="flex h-14 sm:h-16 items-center gap-2 sm:gap-4">
            {/* Mobile Menu Button - Left of logo */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-md hover:bg-gray-100 transition-colors flex-shrink-0 cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5 text-gray-700" />
            </button>

            {/* Logo */}
            <button
              onClick={() => router.push('/marketplace')}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0"
            >
              <Image 
                src="/yj.svg" 
                alt="Yellow Jersey" 
                width={180} 
                height={36}
                className="h-8 sm:h-9"
              />
            </button>

            {/* Desktop Search Bar (always visible) + Mobile Search (conditional) */}
            {compactSearchOnMobile ? (
              <>
                {/* Desktop: Full search bar */}
                <div className="hidden sm:block flex-[2] ml-[14px]">
                  <InstantSearch />
                </div>
                {/* Mobile: Search icon button and Sell button */}
                <div className="sm:hidden flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => setMobileSearchOpen(true)}
                    className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                    aria-label="Open search"
                  >
                    <Search className="h-5 w-5 text-gray-700" />
                  </button>
                  <Button
                    onClick={() => {
                      if (user) {
                        setSmartUploadModalOpen(true);
                      } else {
                        setSellRequirementModalOpen(true);
                      }
                    }}
                    size="sm"
                    className="rounded-md bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-medium shadow-sm h-9 px-3"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Sell
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-[2] ml-[14px]">
                <InstantSearch />
              </div>
            )}

            {/* Desktop Actions - Fixed on far right */}
            <div className="hidden lg:flex items-center gap-3 flex-shrink-0 ml-auto">
              {mounted && user ? (
                <>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-0 cursor-pointer">
                        {shouldShowLogo() ? (
                          <div className="relative h-10 w-10 rounded-full overflow-hidden border border-gray-200 flex-shrink-0">
                            <Image
                              src={profile!.logo_url!}
                              alt={getDisplayName()}
                              fill
                              className="object-cover"
                            />
                          </div>
                        ) : (
                          <UserAvatar name={getDisplayName()} size="default" />
                        )}
                        <span className="text-sm font-medium text-gray-700 max-w-[150px] truncate">
                          {getDisplayName()}
                        </span>
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
                          <span className="font-medium">Smart Upload</span>
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
                          <span className="font-medium">Smart Upload</span>
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
                        <FileText className="mr-2 h-4 w-4" />
                        <div className="flex flex-col">
                          <span className="font-medium">Standard Upload</span>
                          <span className="text-xs text-gray-500">Manual form entry</span>
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.header>

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
                  <X className="h-5 w-5 text-gray-600" />
                </button>
              </div>

              {/* User Info (if logged in) */}
              {mounted && user && (
                <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    {shouldShowLogo() ? (
                      <div className="relative h-10 w-10 rounded-full overflow-hidden border border-gray-200 flex-shrink-0">
                        <Image
                          src={profile!.logo_url!}
                          alt={getDisplayName()}
                          fill
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <UserAvatar name={getDisplayName()} size="default" />
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
                      label="Smart Upload"
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
              You must create an account or sign in to sell an item on Yellow Jersey.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col gap-3 pt-4">
            <Button
              onClick={() => {
                setSellRequirementModalOpen(false);
                openAuthModal();
              }}
              className="w-full rounded-md bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-medium shadow-sm"
            >
              Sign In
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSellRequirementModalOpen(false);
                openAuthModal();
              }}
              className="w-full rounded-md border-gray-300 hover:bg-gray-50"
            >
              Create Account
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
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 flex-shrink-0">
              {/* Back/Close button */}
              <button
                onClick={() => setMobileSearchOpen(false)}
                className="p-2 -ml-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
                aria-label="Close search"
              >
                <X className="h-5 w-5 text-gray-600" />
              </button>
              {/* Search input */}
              <div className="flex-1">
                <InstantSearch autoFocus onResultClick={() => setMobileSearchOpen(false)} />
              </div>
            </div>
            {/* Results will show in the dropdown which is positioned absolute below the input */}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

