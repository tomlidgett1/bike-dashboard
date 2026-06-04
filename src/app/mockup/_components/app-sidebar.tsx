"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronRight,
  Database,
  Globe,
  LayoutDashboard,
  LifeBuoy,
  Package,
  RefreshCw,
  Settings2,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
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
import { StoreSwitcher } from "./store-switcher";
import { NavUser } from "./nav-user";

type SubItem = { title: string; href?: string };
type NavItem = {
  title: string;
  icon: LucideIcon;
  href?: string;
  badge?: string;
  items?: SubItem[];
};
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: "Store",
    items: [
      { title: "Overview", icon: LayoutDashboard, href: "/mockup" },
      {
        title: "Products",
        icon: Package,
        href: "/mockup/products",
        items: [
          { title: "All products", href: "/mockup/products" },
          { title: "Drafts", href: "/mockup/products" },
          { title: "Categories", href: "/mockup/products" },
          { title: "Brands", href: "/mockup/products" },
        ],
      },
      {
        title: "Storefront",
        icon: Store,
        items: [
          { title: "Home page" },
          { title: "Sections" },
          { title: "Featured products" },
        ],
      },
      { title: "Orders", icon: ShoppingBag, badge: "12" },
    ],
  },
  {
    label: "Growth",
    items: [
      { title: "Optimize", icon: Sparkles, badge: "AI" },
      { title: "Marketplace", icon: Globe },
      { title: "Insights", icon: BarChart3 },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Lightspeed sync", icon: RefreshCw },
      { title: "Uber Direct", icon: Truck },
      { title: "Data & export", icon: Database },
    ],
  },
];

function isItemActive(pathname: string, item: NavItem) {
  if (!item.href) return false;
  if (item.href === "/mockup") return pathname === "/mockup";
  return pathname.startsWith(item.href);
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname() ?? "/mockup";

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <StoreSwitcher />
      </SidebarHeader>

      <SidebarContent className="gap-1">
        {NAV.map((group) => (
          <SidebarGroup key={group.label} className="px-2 py-1">
            <SidebarGroupLabel className="h-7 px-2 text-xs text-sidebar-foreground/70">
              {group.label}
            </SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                // Collapsible parent with sub-items
                if (item.items?.length) {
                  const active = isItemActive(pathname, item);
                  return (
                    <Collapsible
                      key={item.title}
                      asChild
                      defaultOpen={active}
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton tooltip={item.title} isActive={active}>
                            <item.icon />
                            <span>{item.title}</span>
                            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.items.map((sub) => (
                              <SidebarMenuSubItem key={sub.title}>
                                {sub.href ? (
                                  <SidebarMenuSubButton asChild>
                                    <Link href={sub.href}>{sub.title}</Link>
                                  </SidebarMenuSubButton>
                                ) : (
                                  <SidebarMenuSubButton>
                                    {sub.title}
                                  </SidebarMenuSubButton>
                                )}
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                // Plain item (link if href, otherwise inert placeholder button)
                const active = isItemActive(pathname, item);
                return (
                  <SidebarMenuItem key={item.title}>
                    {item.href ? (
                      <SidebarMenuButton
                        asChild
                        tooltip={item.title}
                        isActive={active}
                      >
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton tooltip={item.title}>
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    )}
                    {item.badge ? (
                      <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}

        <SidebarGroup className="mt-auto px-2 py-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="Settings"
                isActive={pathname.startsWith("/mockup/settings")}
              >
                <Link href="/mockup/settings">
                  <Settings2 />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Help & support">
                <LifeBuoy />
                <span>Help &amp; support</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
