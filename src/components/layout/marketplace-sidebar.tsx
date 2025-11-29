"use client";

import * as React from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { Package, Store, User, Clock, Sparkles, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/components/providers/auth-provider";
import { useUserProfile } from "@/components/providers/profile-provider";

interface NavItem {
  type: 'item' | 'separator';
  title?: string;
  value?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  {
    type: 'item',
    title: "All Products",
    value: "products",
    icon: Package,
  },
  {
    type: 'item',
    title: "New Products",
    value: "new-products",
    icon: Sparkles,
  },
  {
    type: 'item',
    title: "Used Products",
    value: "used-products",
    icon: RefreshCw,
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

export function MarketplaceSidebar() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { user } = useAuth();
  const { profile } = useUserProfile();

  // Determine active view based on pathname and search params
  const getActiveView = () => {
    if (pathname === "/marketplace/new-products") return "new-products";
    if (pathname === "/marketplace/used-products") return "used-products";
    return searchParams.get("view") || "products";
  };
  
  const activeView = getActiveView();

  // Check if user is a bicycle store waiting for admin approval
  const isWaitingForApproval = profile?.account_type === 'bicycle_store' && profile?.bicycle_store === false;

  return (
    <aside
      className={cn(
        "fixed left-0 top-16 z-30 hidden h-[calc(100vh-4rem)] w-[200px] flex-col border-r border-sidebar-border bg-sidebar lg:flex"
      )}
    >
      {/* Navigation */}
      <ScrollArea className="flex-1 px-2 py-4">
        <nav className="flex flex-col gap-1">
          {navItems.map((item, index) => {
            // Render separator
            if (item.type === 'separator') {
              return (
                <div key={`separator-${index}`} className="my-2 px-2.5">
                  <div className="h-px bg-gray-200" />
                </div>
              );
            }

            // Render nav item
            const isActive = activeView === item.value;
            const Icon = item.icon!;

            const handleClick = () => {
              // Use full page navigation to ensure proper state updates
              let url: string;
              if (item.value === "products") {
                url = "/marketplace";
              } else if (item.value === "new-products") {
                url = "/marketplace/new-products";
              } else if (item.value === "used-products") {
                url = "/marketplace/used-products";
              } else {
                url = `/marketplace?view=${item.value}`;
              }
              window.location.href = url;
            };

            return (
              <button
                key={item.value}
                onClick={handleClick}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-all duration-150 text-left w-full",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-colors",
                    isActive
                      ? "text-sidebar-foreground"
                      : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
                  )}
                />
                <span className="overflow-hidden whitespace-nowrap">
                  {item.title}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Verification Status Message - Below navigation */}
        {isWaitingForApproval && (
          <div className="px-2 pt-4 pb-2">
            <div className="bg-white rounded-md border border-gray-200 p-3 shadow-sm">
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-gray-700 leading-tight">
                  Account awaiting admin approval
                </p>
              </div>
            </div>
          </div>
        )}
      </ScrollArea>
    </aside>
  );
}

