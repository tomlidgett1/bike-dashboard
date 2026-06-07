"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  Database,
  LifeBuoy,
  MessageSquare,
  Package,
  Settings,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  Truck,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { NavUser } from "./nav-user";
import { SidebarLightspeedStatus } from "./sidebar-lightspeed-status";
import { SidebarViewStoreLink } from "./sidebar-view-store-link";
import { SidebarYjLogo } from "./sidebar-yj-logo";

type SubItem = { title: string; href: string; exact?: boolean };
type NavItem = {
  title: string;
  icon: LucideIcon;
  href?: string;
  badge?: string;
  exact?: boolean;
  disabled?: boolean;
  items?: SubItem[];
};
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: "Store",
    items: [
      { title: "Home", href: "/settings/store/home", icon: Sparkles, exact: true },
      { title: "Nest", href: "/settings/store/nest", icon: MessageSquare, exact: true },
      { title: "Products", href: "/products", icon: Package },
      {
        title: "Storefront",
        icon: Store,
        items: [
          { title: "Landing page", href: "/settings/store/landing" },
          { title: "Carousels", href: "/settings/store/carousels" },
          { title: "Sections", href: "/settings/store/sections" },
          { title: "Brands", href: "/settings/store/brands" },
          { title: "Services", href: "/settings/store/services" },
          { title: "Rentals", href: "/settings/store/rentals" },
          { title: "Analytics", href: "/settings/store/analytics" },
          { title: "Product content", href: "/settings/store/products" },
          { title: "Titles", href: "/settings/store/titles" },
        ],
      },
      { title: "Product Optimise", href: "/optimize", icon: Sparkles },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { title: "Orders", href: "/settings/purchases", icon: ShoppingBag },
      {
        title: "Listings",
        icon: Tag,
        items: [
          { title: "My listings", href: "/settings/my-listings" },
        ],
      },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Uber Direct", href: "/settings/uber", icon: Truck },
      { title: "Data", href: "/settings/data", icon: Database },
      { title: "Lightspeed", href: "/connect-lightspeed", icon: Zap },
    ],
  },
];

const FOOTER_ITEMS: NavItem[] = [
  { title: "Settings", href: "/settings", icon: Settings, exact: true },
  { title: "Help & support", href: "/marketplace/help", icon: LifeBuoy },
];

function flatActive(pathname: string, item: NavItem) {
  if (!item.href) return false;
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

function groupActive(pathname: string, item: NavItem) {
  return !!item.items?.some((sub) => pathname.startsWith(sub.href));
}

function CollapsibleNavItem({
  item,
  pathname,
  onPrefetch,
}: {
  item: NavItem;
  pathname: string;
  onPrefetch: (href: string) => void;
}) {
  const open = groupActive(pathname, item);
  return (
    <Collapsible asChild defaultOpen={open} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title} isActive={open}>
            <item.icon />
            <span>{item.title}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.items!.map((sub) => (
              <SidebarMenuSubItem key={sub.href}>
                <SidebarMenuSubButton
                  asChild
                  isActive={sub.exact ? pathname === sub.href : pathname.startsWith(sub.href)}
                >
                  <Link
                    href={sub.href}
                    onFocus={() => onPrefetch(sub.href)}
                    onPointerEnter={() => onPrefetch(sub.href)}
                  >
                    {sub.title}
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function FlatNavItem({
  item,
  pathname,
  onPrefetch,
}: {
  item: NavItem;
  pathname: string;
  onPrefetch: (href: string) => void;
}) {
  if (item.disabled) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={`${item.title} — coming soon`}
          aria-disabled
          className="cursor-not-allowed opacity-50"
        >
          <item.icon />
          <span>{item.title}</span>
        </SidebarMenuButton>
        <SidebarMenuBadge className="text-[10px] tracking-wide">SOON</SidebarMenuBadge>
      </SidebarMenuItem>
    );
  }
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={item.title} isActive={flatActive(pathname, item)}>
        <Link
          href={item.href!}
          onFocus={() => onPrefetch(item.href!)}
          onPointerEnter={() => onPrefetch(item.href!)}
        >
          <item.icon />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
      {item.badge ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
    </SidebarMenuItem>
  );
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname() ?? "/products";
  const router = useRouter();

  const prefetch = React.useCallback(
    (href: string) => {
      router.prefetch(href);
    },
    [router]
  );

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader
        className={cn(
          "flex flex-col gap-0.5 px-3 pb-2 pt-0",
          "group-data-[collapsible=icon]:gap-0.5 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:pb-2 group-data-[collapsible=icon]:pt-0",
        )}
      >
        <div className="flex h-14 shrink-0 items-center">
          <SidebarYjLogo />
        </div>
        <SidebarViewStoreLink />
      </SidebarHeader>

      <SidebarContent className="gap-1">
        {NAV.map((group) => (
          <SidebarGroup key={group.label} className="px-2 py-1">
            <SidebarGroupLabel className="h-7 px-2 text-xs text-sidebar-foreground/70">
              {group.label}
            </SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) =>
                item.items ? (
                  <CollapsibleNavItem
                    key={item.title}
                    item={item}
                    pathname={pathname}
                    onPrefetch={prefetch}
                  />
                ) : (
                  <FlatNavItem
                    key={item.title}
                    item={item}
                    pathname={pathname}
                    onPrefetch={prefetch}
                  />
                )
              )}
            </SidebarMenu>
          </SidebarGroup>
        ))}

        <SidebarGroup className="mt-auto px-2 py-1">
          <SidebarMenu>
            {FOOTER_ITEMS.map((item) => (
              <FlatNavItem
                key={item.title}
                item={item}
                pathname={pathname}
                onPrefetch={prefetch}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-1">
        <SidebarSeparator className="mx-0 w-full" />
        <SidebarLightspeedStatus />
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
