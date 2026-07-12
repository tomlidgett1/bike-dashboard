"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  BarChart3,
  Bot,
  Inbox,
  MailPlus,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CRM_TABS = [
  { label: "Inbox", href: "/settings/store/crm/inbox", icon: Inbox },
  { label: "Customers", href: "/settings/store/crm/customers", icon: Users },
  { label: "Today", href: "/settings/store/crm/today", icon: Zap },
  { label: "Outreach", href: "/settings/store/crm/outreach", icon: MailPlus },
  { label: "Automations", href: "/settings/store/crm/automations", icon: Bot },
  { label: "Insights", href: "/settings/store/crm/insights", icon: BarChart3 },
] as const;

export function CrmRouteTabs() {
  const pathname = usePathname() ?? "/settings/store/crm/today";

  return (
    <nav aria-label="CRM sections" className="overflow-x-auto pb-0.5">
      <div className="flex w-max items-center rounded-full bg-gray-100 p-1">
        {CRM_TABS.map((tab) => {
          const active =
            pathname === tab.href ||
            (tab.href.endsWith("/customers") && pathname.startsWith(`${tab.href}/`));
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1",
                active ? "text-gray-800" : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              {active ? (
                <motion.div
                  layoutId="crm-route-tabs-slider"
                  className="absolute inset-0 rounded-full bg-white shadow-sm"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                />
              ) : null}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon size={15} aria-hidden />
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
