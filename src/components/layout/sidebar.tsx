"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Settings,
  Zap,
  Bike,
  Menu,
  Package,
  Store,
  Edit,
  Instagram,
  ShieldCheck,
  Tag,
  HelpCircle,
  CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useUserProfile } from "@/lib/hooks/use-user-profile";
import Image from "next/image";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresStore?: boolean;
  isAdmin?: boolean;
}

const navItems: NavItem[] = [
  {
    title: "Products",
    href: "/products",
    icon: Package,
  },
  {
    title: "Store Settings",
    href: "/settings/store",
    icon: Store,
    requiresStore: true,
  },
  {
    title: "My Listings",
    href: "/settings/my-listings",
    icon: Edit,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
  {
    title: "Draft Listings",
    href: "/settings/drafts",
    icon: Edit,
  },
  {
    title: "Connect Lightspeed",
    href: "/connect-lightspeed",
    icon: Zap,
  },
];

const adminItems: NavItem[] = [
  {
    title: "Image QA",
    href: "/admin/image-qa",
    icon: ShieldCheck,
    isAdmin: true,
  },
  {
    title: "Instagram Posts",
    href: "/admin/instagram-posts",
    icon: Instagram,
    isAdmin: true,
  },
  {
    title: "Scheduled Uploads",
    href: "/admin/scheduled-uploads",
    icon: CalendarClock,
    isAdmin: true,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { profile } = useUserProfile();

  // Check if user is verified bicycle store
  const isVerifiedStore =
    profile?.account_type === 'bicycle_store' && profile?.bicycle_store === true;

  // Filter nav items based on user type
  const filteredNavItems = navItems.filter(
    (item) => !item.requiresStore || isVerifiedStore
  );

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 hidden h-screen w-[260px] flex-col border-r border-sidebar-border bg-sidebar lg:flex"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center px-3">
        <Link
          href="/settings"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent"
        >
          {profile?.logo_url ? (
            <div className="relative h-8 w-8 rounded-md overflow-hidden">
              <Image
                src={profile.logo_url}
                alt={profile.business_name || "Logo"}
                fill
                className="object-cover"
                priority
                sizes="32px"
              />
            </div>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Bike className="h-5 w-5 text-primary-foreground" />
            </div>
          )}
          <span className="font-semibold text-sidebar-foreground">
            {profile?.business_name || "Bike Dashboard"}
          </span>
        </Link>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="flex flex-col gap-1">
          {filteredNavItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150",
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
              </Link>
            );
          })}

          {/* Admin Section */}
          <div className="mt-4 pt-4 border-t border-sidebar-border">
            <p className="px-3 text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wider mb-2">
              Admin
            </p>
            {adminItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150",
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
                </Link>
              );
            })}
          </div>

          {/* Go to Marketplace Button */}
          <div className="mt-4 pt-4 border-t border-sidebar-border">
            <Link
              href="/marketplace"
              className="group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <Store
                className="h-[18px] w-[18px] shrink-0 transition-colors text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
              />
              <span className="overflow-hidden whitespace-nowrap">
                Go to Marketplace
              </span>
            </Link>
          </div>

          {/* Help & Support Button */}
          <div className="mt-1">
            <Link
              href="/marketplace/help"
              className="group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <HelpCircle
                className="h-[18px] w-[18px] shrink-0 transition-colors text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
              />
              <span className="overflow-hidden whitespace-nowrap">
                Help & Support
              </span>
            </Link>
          </div>
        </nav>
      </ScrollArea>
    </aside>
  );
}

// Mobile Sidebar using Sheet
export function MobileSidebar() {
  const pathname = usePathname();
  const { profile } = useUserProfile();
  const [open, setOpen] = React.useState(false);

  // Check if user is verified bicycle store
  const isVerifiedStore =
    profile?.account_type === 'bicycle_store' && profile?.bicycle_store === true;

  // Filter nav items based on user type
  const filteredNavItems = navItems.filter(
    (item) => !item.requiresStore || isVerifiedStore
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[280px] bg-sidebar p-0"
      >
        <SheetHeader className="border-b border-sidebar-border px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-left">
            {profile?.logo_url ? (
              <div className="relative h-8 w-8 rounded-md overflow-hidden">
                <Image
                  src={profile.logo_url}
                  alt={profile.business_name || "Logo"}
                  fill
                  className="object-cover"
                  priority
                  sizes="32px"
                />
              </div>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
                <Bike className="h-5 w-5 text-primary-foreground" />
              </div>
            )}
            <span className="font-semibold text-sidebar-foreground">
              {profile?.business_name || "Bike Dashboard"}
            </span>
          </SheetTitle>
        </SheetHeader>

        {/* Sell Item Button */}
        <div className="px-3 py-3 border-b border-sidebar-border">
          <Link
            href="/marketplace/sell"
            onClick={() => setOpen(false)}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[#FFC72C] hover:bg-[#E6B328] px-4 py-2.5 text-sm font-medium text-gray-900 transition-colors"
          >
            <Tag className="h-4 w-4" />
            Sell Item
          </Link>
        </div>

        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="flex flex-col gap-1">
            {filteredNavItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-150",
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
                  <span>{item.title}</span>
                </Link>
              );
            })}

            {/* Admin Section */}
            <div className="mt-4 pt-4 border-t border-sidebar-border">
              <p className="px-3 text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wider mb-2">
                Admin
              </p>
              {adminItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-150",
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
                    <span>{item.title}</span>
                  </Link>
                );
              })}
            </div>

            {/* Go to Marketplace Button */}
            <div className="mt-4 pt-4 border-t border-sidebar-border">
              <Link
                href="/marketplace"
                onClick={() => setOpen(false)}
                className="group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-150 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <Store
                  className="h-[18px] w-[18px] shrink-0 transition-colors text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
                />
                <span>Go to Marketplace</span>
              </Link>
            </div>

            {/* Help & Support Button */}
            <div className="mt-1">
              <Link
                href="/marketplace/help"
                onClick={() => setOpen(false)}
                className="group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-150 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <HelpCircle
                  className="h-[18px] w-[18px] shrink-0 transition-colors text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
                />
                <span>Help & Support</span>
              </Link>
            </div>
          </nav>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

