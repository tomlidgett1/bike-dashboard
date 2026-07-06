"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AltArrowRight,
  Bag,
  Box,
  Database,
  Help,
  HomeSmile,
  Letter,
  Mailbox,
  Settings,
  Shop,
  Sparkles,
  Tag,
  TestTube,
  Widget,
  type SidebarIcon,
} from "./sidebar-icons";
import {
  Collapsible,
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
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { NavUser } from "./nav-user";
import { SidebarLightspeedStatus } from "./sidebar-lightspeed-status";
import { SidebarViewStoreLink } from "./sidebar-view-store-link";
import { SidebarCollapseTrigger } from "./sidebar-collapse-trigger";
import { LightspeedSidebarIcon } from "@/components/genie/lightspeed-logo";
import { cn } from "@/lib/utils";
import { useCustomerInquiriesNeedsActionCount } from "@/lib/hooks/use-customer-inquiries-needs-action-count";
import { useStoreOpenActionsCount } from "@/lib/hooks/use-store-open-actions-count";

const COMPRESSED_NAV_BUTTON =
  "data-active:bg-white data-active:shadow-sm";

type SubItem = { title: string; href: string; exact?: boolean };
type NavItem = {
  title: string;
  icon: SidebarIcon;
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
      { title: "Home", href: "/settings/store/home", icon: HomeSmile, exact: true },
      { title: "To Do", href: "/settings/store/actions", icon: Widget, exact: true },
      { title: "Domestique", href: "/settings/store/domestique", icon: Sparkles, exact: true },
      { title: "Product Catalogue", href: "/products", icon: Box },
      {
        title: "Storefront",
        icon: Shop,
        items: [
          { title: "Landing page", href: "/settings/store/landing" },
          { title: "Carousels", href: "/settings/store/carousels" },
          { title: "Specials", href: "/settings/store/specials" },
          { title: "Offers", href: "/settings/store/offers" },
          { title: "Brands", href: "/settings/store/brands" },
          { title: "Services", href: "/settings/store/services" },
          { title: "Rentals", href: "/settings/store/rentals" },
          { title: "Analytics", href: "/settings/store/analytics" },
          { title: "Product content", href: "/settings/store/products" },
          { title: "Titles", href: "/settings/store/titles" },
        ],
      },
    ],
  },
  {
    label: "Customer service",
    items: [
      { title: "Customer inquiries", href: "/settings/store/customer-inquiries", icon: Letter, exact: true },
      { title: "Outreach", href: "/settings/store/crm", icon: Mailbox, exact: true },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { title: "Orders", href: "/settings/purchases", icon: Bag },
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
      { title: "Data", href: "/settings/data", icon: Database },
      { title: "Test", href: "/settings/test", icon: TestTube, exact: true },
      { title: "Lightspeed", href: "/connect-lightspeed", icon: LightspeedSidebarIcon },
    ],
  },
];

const FOOTER_ITEMS: NavItem[] = [
  { title: "Settings", href: "/settings", icon: Settings, exact: true },
  { title: "Help & support", href: "/marketplace/help", icon: Help },
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
  const isActive = groupActive(pathname, item);
  const [open, setOpen] = React.useState(isActive);

  React.useEffect(() => {
    if (isActive) setOpen(true);
  }, [isActive]);

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            tooltip={item.title}
            isActive={isActive}
            size="sm"
            className={COMPRESSED_NAV_BUTTON}
          >
            <item.icon />
            <span>{item.title}</span>
            <AltArrowRight
              className={cn(
                "ml-auto transition-transform duration-200",
                open && "rotate-90",
              )}
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                duration: 0.4,
                ease: [0.04, 0.62, 0.23, 0.98],
              }}
              className="overflow-hidden"
            >
              <SidebarMenuSub>
                {item.items!.map((sub) => (
                  <SidebarMenuSubItem key={sub.href}>
                    <SidebarMenuSubButton
                      asChild
                      size="sm"
                      isActive={sub.exact ? pathname === sub.href : pathname.startsWith(sub.href)}
                      className="data-active:bg-white data-active:shadow-sm"
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
            </motion.div>
          ) : null}
        </AnimatePresence>
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
          size="sm"
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
      <SidebarMenuButton
        asChild
        tooltip={item.title}
        isActive={flatActive(pathname, item)}
        size="sm"
        className={COMPRESSED_NAV_BUTTON}
      >
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
  const { badge: customerInquiriesBadge } = useCustomerInquiriesNeedsActionCount();
  const { badge: openActionsBadge } = useStoreOpenActionsCount();

  const prefetch = React.useCallback(
    (href: string) => {
      router.prefetch(href);
    },
    [router]
  );

  const enrichNavItem = React.useCallback(
    (item: NavItem): NavItem => {
      if (item.href === "/settings/store/customer-inquiries") {
        return { ...item, badge: customerInquiriesBadge ?? item.badge };
      }
      if (item.href === "/settings/store/actions") {
        return { ...item, badge: openActionsBadge ?? item.badge };
      }
      return item;
    },
    [customerInquiriesBadge, openActionsBadge],
  );

  return (
    <Sidebar collapsible="icon" className="dashboard-app-sidebar" {...props}>
      <SidebarHeader className="gap-1 p-1.5">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <SidebarViewStoreLink />
          </div>
          <SidebarCollapseTrigger className="hover:bg-white/80" />
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {NAV.map((group) => (
          <SidebarGroup key={group.label} className="px-1.5 py-1">
            <SidebarGroupLabel className="h-6 px-2 text-[11px] font-medium uppercase tracking-wide text-sidebar-foreground/55">
              {group.label}
            </SidebarGroupLabel>
            <SidebarMenu className="gap-0.5">
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
                    item={enrichNavItem(item)}
                    pathname={pathname}
                    onPrefetch={prefetch}
                  />
                )
              )}
            </SidebarMenu>
          </SidebarGroup>
        ))}

        <SidebarGroup className="mt-auto px-1.5 py-1">
          <SidebarMenu className="gap-0.5">
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

      <SidebarFooter className="gap-1 p-1.5">
        <SidebarSeparator className="mx-0 w-full" />
        <SidebarLightspeedStatus />
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
