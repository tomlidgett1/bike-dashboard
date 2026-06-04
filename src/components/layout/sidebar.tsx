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
  ShieldCheck,
  Tag,
  HelpCircle,
  ExternalLink,
  Sparkles,
  Truck,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  disabled?: boolean;
}

const mainNavItems: NavItem[] = [
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
    title: "Optimize",
    href: "/optimize",
    icon: Sparkles,
    requiresStore: true,
  },
  {
    title: "Uber",
    href: "/settings/uber",
    icon: Truck,
    requiresStore: true,
  },
  {
    title: "Data",
    href: "/settings/data",
    icon: Database,
    requiresStore: true,
  },
  {
    title: "My Listings",
    href: "/settings/my-listings",
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
];

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string | null;
  onNavigate?: () => void;
}) {
  const isActive = pathname === item.href;
  const Icon = item.icon;

  if (item.disabled) {
    return (
      <div
        className={cn(
          "flex cursor-not-allowed select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm",
          "text-muted-foreground/40"
        )}
        aria-disabled="true"
        title="Coming soon"
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{item.title}</span>
        <span className="ml-auto text-[10px] font-medium tracking-wide text-muted-foreground/30">
          SOON
        </span>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-accent",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
        )}
      />
      <span className="truncate">{item.title}</span>
    </Link>
  );
}

function NavSection({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      {label && (
        <p className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground/50">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

function SidebarFooter({
  profile,
  pathname,
  onNavigate,
}: {
  profile: ReturnType<typeof useUserProfile>["profile"];
  pathname: string | null;
  onNavigate?: () => void;
}) {
  const initials = profile
    ? `${profile.first_name?.[0] ?? ""}${profile.last_name?.[0] ?? ""}`.toUpperCase() || "?"
    : "?";

  return (
    <div className="shrink-0 border-t border-border/60 px-3 py-3 space-y-0.5">
      <Link
        href="/marketplace"
        onClick={onNavigate}
        className="group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Store className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
        <span>Marketplace</span>
        <ExternalLink className="ml-auto h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
      </Link>

      <Link
        href="/marketplace/help"
        onClick={onNavigate}
        className="group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
        <span>Help & Support</span>
      </Link>

      <Separator className="my-2 bg-border/60" />

      <Link
        href="/settings"
        onClick={onNavigate}
        className={cn(
          "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-accent",
          pathname === "/settings" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Avatar className="h-5 w-5 shrink-0">
          {profile?.logo_url ? (
            <AvatarImage src={profile.logo_url} alt={profile.business_name} />
          ) : null}
          <AvatarFallback className="text-[9px] font-bold bg-primary/20 text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-medium leading-none text-foreground">
            {profile?.first_name || profile?.name || "Account"}
          </span>
          <span className="truncate text-[11px] text-muted-foreground/70">
            {profile?.email}
          </span>
        </div>
        <Settings className="ml-auto h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-50 transition-opacity" />
      </Link>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { profile } = useUserProfile();

  const isVerifiedStore =
    profile?.account_type === "bicycle_store" && profile?.bicycle_store === true;

  const filteredNavItems = mainNavItems.filter(
    (item) => !item.requiresStore || isVerifiedStore
  );

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[248px] flex-col border-r border-border/60 bg-sidebar lg:flex">
      {/* Logo / Brand */}
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link
          href="/products"
          className="group flex items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors hover:bg-accent"
        >
          {profile?.logo_url ? (
            <div className="relative h-7 w-7 overflow-hidden rounded-md ring-1 ring-border/50">
              <Image
                src={profile.logo_url}
                alt={profile.business_name || "Logo"}
                fill
                className="object-cover"
                priority
                sizes="28px"
              />
            </div>
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/90 ring-1 ring-primary/20">
              <Bike className="h-4 w-4 text-primary-foreground" />
            </div>
          )}
          <span className="text-[14px] font-semibold text-foreground">
            {profile?.business_name || "Bike Dashboard"}
          </span>
        </Link>
      </div>

      <Separator className="bg-border/60" />

      {/* Navigation */}
      <ScrollArea className="min-h-0 flex-1 px-3 py-4">
        <div className="flex flex-col gap-5">
          <NavSection>
            {filteredNavItems.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </NavSection>

          <NavSection label="Admin">
            {adminItems.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </NavSection>
        </div>
      </ScrollArea>

      {/* Footer */}
      <SidebarFooter profile={profile} pathname={pathname} />
    </aside>
  );
}

// ─── Mobile Sidebar ───────────────────────────────────────────────────────────

export function MobileSidebar() {
  const pathname = usePathname();
  const { profile } = useUserProfile();
  const [open, setOpen] = React.useState(false);
  const close = () => setOpen(false);

  const isVerifiedStore =
    profile?.account_type === "bicycle_store" && profile?.bicycle_store === true;

  const filteredNavItems = mainNavItems.filter(
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
        className="flex h-full w-[272px] flex-col bg-sidebar p-0"
      >
        <SheetHeader className="h-14 shrink-0 flex-row items-center border-b border-border/60 px-4 py-0 space-y-0">
          <SheetTitle className="flex items-center gap-2.5">
            {profile?.logo_url ? (
              <div className="relative h-7 w-7 overflow-hidden rounded-md ring-1 ring-border/50">
                <Image
                  src={profile.logo_url}
                  alt={profile.business_name || "Logo"}
                  fill
                  className="object-cover"
                  priority
                  sizes="28px"
                />
              </div>
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/90 ring-1 ring-primary/20">
                <Bike className="h-4 w-4 text-primary-foreground" />
              </div>
            )}
            <span className="text-[14px] font-semibold text-foreground">
              {profile?.business_name || "Bike Dashboard"}
            </span>
          </SheetTitle>
        </SheetHeader>

        {/* Sell CTA */}
        <div className="shrink-0 px-3 pt-3 pb-2">
          <Link
            href="/marketplace/sell"
            onClick={close}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Tag className="h-4 w-4" />
            Sell Item
          </Link>
        </div>

        <Separator className="bg-border/60" />

        <ScrollArea className="min-h-0 flex-1 px-3 py-4">
          <div className="flex flex-col gap-5">
            <NavSection>
              {filteredNavItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onNavigate={close}
                />
              ))}
            </NavSection>

            <NavSection label="Admin">
              {adminItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onNavigate={close}
                />
              ))}
            </NavSection>
          </div>
        </ScrollArea>

        <SidebarFooter profile={profile} pathname={pathname} onNavigate={close} />
      </SheetContent>
    </Sheet>
  );
}
