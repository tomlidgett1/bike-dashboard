"use client";

import {
  Ban,
  CheckCheck,
  Inbox,
  MailQuestionMark,
  Sparkles,
  CircleDot,
  type LucideIcon,
} from "lucide-react";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { NestLogo } from "@/components/genie/nest-logo";
import { cn } from "@/lib/utils";
import { INBOX_TABS, type InboxTab } from "./use-unified-inbox-controller";

const TAB_ICONS: Record<
  InboxTab,
  LucideIcon | "gmail" | "nest"
> = {
  unread: CircleDot,
  all: Inbox,
  needs_reply: MailQuestionMark,
  ready: Sparkles,
  responded: CheckCheck,
  ignored: Ban,
  gmail: "gmail",
  nest: "nest",
};

function TabIcon({ tabId }: { tabId: InboxTab }) {
  const icon = TAB_ICONS[tabId];
  if (icon === "gmail") {
    return <GmailLogo className="h-3 w-auto max-w-[14px]" />;
  }
  if (icon === "nest") {
    return <NestLogo className="h-3 w-3" />;
  }
  const Icon = icon;
  return <Icon className="h-3 w-3" />;
}

export function InboxFilterTabs({
  value,
  onChange,
  counts,
  className,
}: {
  value: InboxTab;
  onChange: (tab: InboxTab) => void;
  counts: Record<InboxTab, number>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 overflow-x-auto rounded-md bg-gray-100 p-0.5 w-fit max-w-full",
        className,
      )}
    >
      {INBOX_TABS.map((tab) => {
        const count = counts[tab.id];
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              active ? "bg-white text-gray-800 shadow-sm" : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <TabIcon tabId={tab.id} />
            {tab.label}
            {count > 0 ? (
              <span
                className={cn(
                  "rounded-md px-1.5 py-0 text-[10px] font-medium",
                  active ? "bg-gray-100 text-gray-600" : "bg-gray-200/80 text-gray-500",
                )}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
