"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { Package, Store, User, Clock, Settings, Edit, FileText, ShoppingBag, PanelLeftClose, PanelLeft, HelpCircle, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";
import { useSidebarState } from "@/lib/hooks/use-sidebar-state";
import { UserAvatar } from "@/components/ui/user-avatar";
import Image from "next/image";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";

interface NavItem {
  type: 'item' | 'separator';
  title?: string;
  value?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

// Common browsing items shown to all users
const browsingNavItems: NavItem[] = [
  {
    type: 'item',
    title: "All Products",
    value: "products",
    icon: Package,
  },
  {
    type: 'separator',
  },
  {
    type: 'item',
    title: "Stores",
    value: "stores",
    icon: Store,
  },
  {
    type: 'item',
    title: "Individual Sellers",
    value: "sellers",
    icon: User,
  },
];

// User-specific items for individual users (non-bicycle stores)
const individualUserItems: NavItem[] = [
  {
    type: 'separator',
  },
  {
    type: 'item',
    title: "My Store",
    value: "my-store",
    icon: Store,
  },
  {
    type: 'item',
    title: "My Listings",
    value: "my-listings",
    icon: Edit,
  },
  {
    type: 'item',
    title: "Draft Listings",
    value: "drafts",
    icon: FileText,
  },
  {
    type: 'item',
    title: "My Purchases",
    value: "purchases",
    icon: ShoppingBag,
  },
  {
    type: 'item',
    title: "Settings",
    value: "settings",
    icon: Settings,
  },
];

// User-specific items for bicycle stores (verified)
const storeUserItems: NavItem[] = [
  {
    type: 'separator',
  },
  {
    type: 'item',
    title: "My Store",
    value: "my-store",
    icon: Store,
  },
  {
    type: 'item',
    title: "Settings",
    value: "settings",
    icon: Settings,
  },
];

function MarketplaceSidebarContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { isCollapsed, toggle, mounted, isHovered, setIsHovered } = useSidebarState();
  
  // Delay before collapsing when hover ends
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  
  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setIsHovered(true);
  };
  
  const handleMouseLeave = () => {
    // Add a small delay before collapsing to prevent flickering
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 100);
  };
  
  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Determine active view based on pathname and search params
  const getActiveView = () => {
    const path = pathname;
    if (path === "/settings" || path === "/marketplace/settings") return "settings";
    if (path === "/settings/my-listings") return "my-listings";
    if (path === "/settings/drafts") return "drafts";
    if (path === "/settings/purchases") return "purchases";
    // Check if user is viewing their own store
    const storeMatch = path.match(/^\/marketplace\/store\/(.+)$/);
    if (storeMatch && (storeMatch[1] === profile?.user_id || storeMatch[1] === user?.id)) {
      return "my-store";
    }
    return searchParams.get("view") || "products";
  };
  
  const activeView = getActiveView();

  // Check if user is a verified bicycle store
  const isVerifiedStore = profile?.account_type === 'bicycle_store' && profile?.bicycle_store === true;
  
  // Check if user is a bicycle store waiting for admin approval
  const isWaitingForApproval = profile?.account_type === 'bicycle_store' && profile?.bicycle_store === false;

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

  // Check if user is a bicycle store with logo
  const shouldShowLogo = () => {
    return profile?.account_type === 'bicycle_store' && profile?.logo_url;
  };

  // Get the appropriate settings route based on account type
  const getSettingsRoute = () => {
    if (profile?.account_type === 'bicycle_store' && profile?.bicycle_store === true) {
      return '/settings'; // Bike store settings
    }
    return '/marketplace/settings'; // Individual user settings
  };

  // All authenticated users can access settings
  const canAccessSettings = () => {
    return !!user;
  };

  const supabase = createClient();
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/marketplace');
    router.refresh();
  };
  
  // 🔍 DEBUG: Account approval status
  React.useEffect(() => {
    if (user) {
      console.log('🔍 [SIDEBAR] Account Approval Debug:', {
        userId: user.id,
        hasProfile: !!profile,
        accountType: profile?.account_type,
        bicycleStoreFlag: profile?.bicycle_store,
        isVerifiedStore,
        isWaitingForApproval,
        shouldShowApprovalBadge: isWaitingForApproval,
        profileData: profile
      });
    }
  }, [user, profile, isVerifiedStore, isWaitingForApproval]);
  
  // Build navigation items based on user type
  // Only show user-specific items when logged in
  const navItems = [
    ...browsingNavItems,
    ...(user ? (isVerifiedStore ? storeUserItems : individualUserItems) : []),
  ];

  // Render nav item with or without tooltip
  const renderNavItem = (item: NavItem, index: number) => {
    if (item.type === 'separator') {
      return (
        <div key={`separator-${index}`} className="my-2 px-2">
          <div 
            className={cn(
              "h-px bg-gray-200 transition-all duration-400",
              isExpanded ? "w-full" : "w-[32px] mx-auto"
            )}
          />
        </div>
      );
    }

    const isActive = activeView === item.value;
    const Icon = item.icon!;

    const handleClick = () => {
      let url: string;
      if (item.value === "products") {
        url = "/marketplace";
      } else if (item.value === "settings") {
        url = isVerifiedStore ? "/settings" : "/marketplace/settings";
      } else if (item.value === "my-listings") {
        url = "/settings/my-listings";
      } else if (item.value === "drafts") {
        url = "/settings/drafts";
      } else if (item.value === "purchases") {
        url = "/settings/purchases";
      } else if (item.value === "my-store") {
        url = `/marketplace/store/${profile?.user_id || user?.id}`;
      } else {
        url = `/marketplace?view=${item.value}`;
      }
      router.push(url);
    };

    const buttonContent = (
      <button
        key={item.value}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        className={cn(
          "group flex items-center rounded-md text-sm font-medium transition-all duration-150 text-left w-full relative h-[38px] cursor-pointer",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}
      >
        {/* Fixed icon container - icon never moves */}
        <div className="w-[40px] h-full flex items-center justify-center shrink-0">
          <Icon
            className={cn(
              "h-[18px] w-[18px] shrink-0 transition-colors",
              isActive
                ? "text-sidebar-foreground"
                : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
            )}
          />
        </div>
        
        {/* Text label with smooth fade */}
        {isExpanded && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden whitespace-nowrap pl-1 pr-2.5 h-full flex items-center"
          >
            {item.title}
          </motion.span>
        )}
      </button>
    );

    // Wrap with tooltip when collapsed and not hovered
    if (!isExpanded && mounted) {
      return (
        <Tooltip key={item.value} delayDuration={100}>
          <TooltipTrigger asChild>
            {buttonContent}
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="rounded-md">
            <p>{item.title}</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return buttonContent;
  };

  // Determine if sidebar should be expanded (manually toggled open OR hovered while collapsed)
  const isExpanded = !isCollapsed || (isCollapsed && isHovered);
  
  return (
    <TooltipProvider>
      <motion.aside
        initial={false}
        animate={{
          width: isExpanded ? 200 : 56,
        }}
        transition={{
          duration: 0.2,
          ease: [0.04, 0.62, 0.23, 0.98],
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "fixed left-0 top-16 z-[45] hidden h-[calc(100vh-4rem)] flex-col border-r border-t border-sidebar-border bg-sidebar lg:flex overflow-x-hidden"
        )}
      >
        {/* Header with Collapse Button */}
        <div className={cn(
          "relative flex items-center px-2 pt-4 pb-2 bg-sidebar shrink-0",
          isExpanded ? "justify-between" : "justify-center"
        )}>
          {isExpanded && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="text-xs font-semibold text-gray-500 uppercase tracking-wider pl-2"
            >
              Browse
            </motion.span>
          )}
          {mounted && (
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <button
                  onClick={toggle}
                  className="flex items-center justify-center rounded-md p-1.5 transition-all duration-150 cursor-pointer text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  type="button"
                >
                  {isCollapsed ? (
                    <PanelLeft className="h-[18px] w-[18px]" />
                  ) : (
                    <PanelLeftClose className="h-[18px] w-[18px]" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8} className="rounded-md">
                <p>{isCollapsed ? "Expand sidebar" : "Collapse sidebar"}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="relative flex-1 py-2 overflow-y-auto">
          <nav className="flex flex-col gap-1 px-2">
            {navItems.map((item, index) => renderNavItem(item, index))}
          </nav>

          {/* Verification Status Message */}
          {isWaitingForApproval && (
            <div className="pt-4 pb-2 px-2">
              {(() => {
                console.log('🟡 [SIDEBAR] Rendering "Account awaiting admin approval" badge');
                return null;
              })()}
              {!isExpanded ? (
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <div className="bg-white rounded-md border border-gray-200 py-2 shadow-sm flex items-center justify-center">
                      <Clock className="h-4 w-4 text-amber-600 flex-shrink-0" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8} className="rounded-md">
                    <p className="text-xs">Account awaiting admin approval</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <div className="bg-white rounded-md border border-gray-200 shadow-sm">
                  <div className="flex items-center">
                    <div className="w-[40px] flex items-center justify-center py-2 shrink-0">
                      <Clock className="h-4 w-4 text-amber-600 flex-shrink-0" />
                    </div>
                    <p className="text-xs text-gray-700 leading-tight pl-1 pr-3 py-2">
                      Account awaiting admin approval
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* User Info */}
        {user && (
          <div className="border-t border-sidebar-border p-2">
            <DropdownMenu modal={false}>
              {!isExpanded ? (
                <>
                  <Tooltip delayDuration={100}>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <button className="w-full flex items-center justify-center outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-0 cursor-pointer">
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
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8} className="rounded-md">
                      <p className="max-w-[200px] truncate">{getDisplayName()}</p>
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent side="right" align="end" className="w-48 bg-white rounded-md">
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
                </>
              ) : (
                <>
                  <DropdownMenuTrigger asChild>
                    <button className="w-full flex items-center gap-2 px-1 py-1.5 rounded-md hover:bg-sidebar-accent transition-colors outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-0 cursor-pointer">
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
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-sm font-medium text-sidebar-foreground/80 truncate flex-1 min-w-0 text-left"
                      >
                        {getDisplayName()}
                      </motion.span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="end" className="w-48 bg-white rounded-md">
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
                </>
              )}
            </DropdownMenu>
          </div>
        )}

        {/* Help and Support Button */}
        <div className="border-t border-sidebar-border p-2 pb-4">
          {!isExpanded ? (
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    // TODO: Add help and support functionality
                    console.log('Help and Support clicked');
                  }}
                  className="w-full flex items-center rounded-md text-sm font-medium transition-all duration-150 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground h-[38px] cursor-pointer"
                >
                  <div className="w-[40px] h-full flex items-center justify-center shrink-0">
                    <HelpCircle className="h-[18px] w-[18px] shrink-0" />
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8} className="rounded-md">
                <p>Help & Support</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={() => {
                // TODO: Add help and support functionality
                console.log('Help and Support clicked');
              }}
              className="w-full flex items-center rounded-md text-sm font-medium transition-all duration-150 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground h-[38px] cursor-pointer"
            >
              <div className="w-[40px] h-full flex items-center justify-center shrink-0">
                <HelpCircle className="h-[18px] w-[18px] shrink-0" />
              </div>
              <span className="overflow-hidden whitespace-nowrap pl-1 pr-2.5 h-full flex items-center">
                Help & Support
              </span>
            </button>
          )}
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}

// Wrap with Suspense to handle useSearchParams SSR requirements
export function MarketplaceSidebar() {
  return (
    <Suspense fallback={
      <div className="hidden lg:block w-[60px] flex-shrink-0 bg-sidebar border-r border-sidebar-border" />
    }>
      <MarketplaceSidebarContent />
    </Suspense>
  );
}

