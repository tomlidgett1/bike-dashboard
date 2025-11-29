"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Package, Store, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface NavItem {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  {
    title: "All Products",
    value: "products",
    icon: Package,
  },
  {
    title: "Stores",
    value: "stores",
    icon: Store,
  },
  {
    title: "Individual Sellers",
    value: "sellers",
    icon: User,
  },
];

export function MarketplaceSidebar() {
  const searchParams = useSearchParams();
  const activeView = searchParams.get("view") || "products";

  return (
    <aside
      className={cn(
        "fixed left-0 top-16 z-30 hidden h-[calc(100vh-4rem)] w-[200px] flex-col border-r border-sidebar-border bg-sidebar lg:flex"
      )}
    >
      {/* Navigation */}
      <ScrollArea className="flex-1 px-2 py-4">
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = activeView === item.value;
            const Icon = item.icon;

            const handleClick = () => {
              // Use full page navigation to ensure proper state updates
              const url = item.value === "products" 
                ? "/marketplace" 
                : `/marketplace?view=${item.value}`;
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
      </ScrollArea>
    </aside>
  );
}

