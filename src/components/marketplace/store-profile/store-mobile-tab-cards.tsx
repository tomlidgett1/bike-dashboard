"use client";

import * as React from "react";
import {
  Bike,
  Calendar,
  Wrench,
  type LucideIcon,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { BikeIcon } from "@/components/ui/bike-icon";
import { cn } from "@/lib/utils";
import type { StoreTab } from "@/components/marketplace/store-profile/store-profile-chrome";

const MOBILE_TAB_CARDS: {
  key: StoreTab;
  label: string;
  cta: string;
  icon?: LucideIcon;
  bikeIcon?: string;
  accentIcon?: boolean;
}[] = [
  {
    key: "bikes",
    label: "Bikes",
    cta: "Shop now",
    icon: Bike,
    accentIcon: true,
  },
  {
    key: "products",
    label: "Products",
    cta: "Browse all",
    bikeIcon: "noun-bike-helmet-6991316.svg",
  },
  {
    key: "rentals",
    label: "Rentals",
    cta: "Book now",
    icon: Calendar,
  },
  {
    key: "service",
    label: "Services",
    cta: "Learn more",
    icon: Wrench,
  },
];

export function StoreMobileTabCards({
  activeTab,
  onTabSelect,
  className,
}: {
  activeTab?: StoreTab | null;
  onTabSelect: (tab: StoreTab) => void;
  className?: string;
}) {
  return (
    <nav
      aria-label="Store sections"
      className={cn("md:hidden", className)}
    >
      <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain scrollbar-hide pb-0.5">
        {MOBILE_TAB_CARDS.map(({ key, label, cta, icon: Icon, bikeIcon, accentIcon }) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onTabSelect(key)}
              className={cn(
                "flex min-w-[84px] flex-shrink-0 flex-col items-center rounded-md border px-2 py-2.5 text-center backdrop-blur-md transition-colors cursor-pointer",
                active
                  ? "border-[#ffde59]/50 bg-black/40 ring-1 ring-[#ffde59]/30"
                  : "border-white/20 bg-black/30 hover:border-white/30 hover:bg-black/40",
              )}
            >
              {bikeIcon ? (
                <BikeIcon
                  iconName={bikeIcon}
                  size={26}
                  className="h-[26px] w-[26px] brightness-0 invert opacity-90"
                />
              ) : Icon ? (
                <Icon
                  className={cn(
                    "h-[26px] w-[26px]",
                    accentIcon ? "text-[#ffde59]" : "text-white/90",
                  )}
                  strokeWidth={1.5}
                />
              ) : null}
              <span className="mt-2 text-xs font-semibold leading-tight text-white">
                {label}
              </span>
              <span className="mt-1 text-[10px] text-white/55">
                {cta}
                <span className="ml-0.5" aria-hidden="true">
                  →
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
