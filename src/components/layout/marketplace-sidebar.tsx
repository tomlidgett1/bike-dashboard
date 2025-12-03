"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { Package, Store, User, Clock, Settings, Edit, FileText, ShoppingBag, PanelLeftClose, PanelLeft, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";
import { useSidebarState } from "@/lib/hooks/use-sidebar-state";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  const { isCollapsed, toggle, mounted } = useSidebarState();

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
  
  // Build navigation items based on user type
  const navItems = [
    ...browsingNavItems,
    ...(isVerifiedStore ? storeUserItems : individualUserItems),
  ];

  // Render nav item with or without tooltip
  const renderNavItem = (item: NavItem, index: number) => {
    if (item.type === 'separator') {
      return (
        <div key={`separator-${index}`} className="my-2 px-2">
          <div 
            className={cn(
              "h-px bg-gray-200 transition-all duration-400",
              isCollapsed ? "w-[32px] mx-auto" : "w-full"
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
        {!isCollapsed && (
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

    // Wrap with tooltip when collapsed
    if (isCollapsed && mounted) {
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

  return (
    <TooltipProvider>
      <motion.aside
        initial={false}
        animate={{
          width: isCollapsed ? 56 : 200,
        }}
        transition={{
          duration: 0.4,
          ease: [0.04, 0.62, 0.23, 0.98],
        }}
        className={cn(
          "fixed left-0 top-16 z-30 hidden h-[calc(100vh-4rem)] flex-col border-r border-sidebar-border bg-sidebar lg:flex overflow-hidden"
        )}
      >
        {/* Header with Collapse Button */}
        <div className="flex items-center justify-between px-2 pt-4 pb-2">
          {!isCollapsed && (
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
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <button
                onClick={toggle}
                className={cn(
                  "flex items-center justify-center rounded-md p-1.5 transition-all duration-150 cursor-pointer",
                  "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  isCollapsed && "mx-auto"
                )}
                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
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
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-2">
          <nav className="flex flex-col gap-1 px-2">
            {navItems.map((item, index) => renderNavItem(item, index))}
          </nav>

          {/* Verification Status Message */}
          {isWaitingForApproval && (
            <div className="pt-4 pb-2 px-2">
              {isCollapsed ? (
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

        {/* Help and Support Button */}
        <div className="border-t border-sidebar-border p-2 pb-4">
          {isCollapsed ? (
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

