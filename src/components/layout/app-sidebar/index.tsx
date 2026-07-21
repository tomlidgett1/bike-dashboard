"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AltArrowRight,
  Bag,
  Banknote,
  Box,
  Chart2,
  Database,
  Ghost,
  Help,
  HomeSmile,
  Inbox,
  Instagram,
  MagicStick3,
  MagniferZoomIn,
  Mailbox,
  ScanSearch,
  Settings,
  Shop,
  Table2,
  Tag,
  Wrench,
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
import { SidebarNavIcon } from "./sidebar-nav-icon";
import { LightspeedSidebarIcon } from "@/components/genie/lightspeed-logo";
import { cn } from "@/lib/utils";
import { useCustomerInquiriesUnreadCount } from "@/lib/hooks/use-customer-inquiries-unread-count";

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
  matchActive?: (pathname: string) => boolean;
};
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: "Store",
    items: [
      { title: "Home", href: "/settings/store/home", icon: HomeSmile, exact: true },
      {
        title: "Supplier Lookup",
        href: "/settings/store/supplier-lookup",
        icon: MagniferZoomIn,
        exact: true,
      },
      { title: "Agents", href: "/settings/store/agents", icon: Ghost, exact: true },
      { title: "Demo", href: "/settings/store/demo", icon: MagicStick3, exact: true },
      { title: "Workorders", href: "/settings/store/workorders", icon: Wrench, exact: true },
      { title: "Analytics New", href: "/settings/store/analytics-new", icon: Chart2, exact: true },
      { title: "Build a Table", href: "/settings/store/build-table", icon: Table2, exact: true },
      { title: "Product Catalogue", href: "/products", icon: Box },
      { title: "Scrape", href: "/settings/store/scrape", icon: ScanSearch, exact: true },
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
          { title: "Analytics", href: "/settings/store/analytics", exact: true },
          { title: "Product content", href: "/settings/store/products" },
          { title: "Titles", href: "/settings/store/titles" },
        ],
      },
    ],
  },
  {
    label: "Customer service",
    items: [
      {
        title: "Inbox",
        href: "/settings/store/crm/inbox",
        icon: Inbox,
        exact: true,
      },
      {
        title: "CRM",
        href: "/settings/store/crm/today",
        icon: Mailbox,
        matchActive: (pathname) =>
          pathname.startsWith("/settings/store/crm") &&
          !pathname.startsWith("/settings/store/crm/inbox"),
      },
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
      { title: "Payments", href: "/settings/store/payments", icon: Banknote, exact: true },
      { title: "Instagram", href: "/settings/store/instagram", icon: Instagram, exact: true },
      { title: "Lightspeed", href: "/connect-lightspeed", icon: LightspeedSidebarIcon },
    ],
  },
];

const FOOTER_ITEMS: NavItem[] = [
  { title: "Settings", href: "/settings", icon: Settings, exact: true },
  { title: "Help & support", href: "/marketplace/help", icon: Help },
];

function flatActive(pathname: string, item: NavItem) {
  if (item.matchActive) return item.matchActive(pathname);
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
  inboxBadge,
}: {
  item: NavItem;
  pathname: string;
  onPrefetch: (href: string) => void;
  inboxBadge?: string;
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
            <SidebarNavIcon icon={item.icon} />
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
                        <span>{sub.title}</span>
                        {sub.href === "/settings/store/crm/inbox" && inboxBadge ? (
                          <span className="ml-auto rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-gray-600">
                            {inboxBadge}
                          </span>
                        ) : null}
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
  inboxBadge,
}: {
  item: NavItem;
  pathname: string;
  onPrefetch: (href: string) => void;
  inboxBadge?: string;
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
          <SidebarNavIcon icon={item.icon} />
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
          <SidebarNavIcon icon={item.icon} />
          <span>{item.title}</span>
          {item.href === "/settings/store/crm/inbox" && inboxBadge ? (
            <span className="ml-auto rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-gray-600">
              {inboxBadge}
            </span>
          ) : null}
        </Link>
      </SidebarMenuButton>
      {item.badge ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
    </SidebarMenuItem>
  );
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname() ?? "/products";
  const router = useRouter();
  const { badge: customerInquiriesBadge } = useCustomerInquiriesUnreadCount();

  const prefetch = React.useCallback(
    (href: string) => {
      router.prefetch(href);
    },
    [router]
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
                    inboxBadge={item.title === "CRM" ? customerInquiriesBadge : undefined}
                  />
                ) : (
                  <FlatNavItem
                    key={item.title}
                    item={item}
                    pathname={pathname}
                    onPrefetch={prefetch}
                    inboxBadge={item.title === "Inbox" ? customerInquiriesBadge : undefined}
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
