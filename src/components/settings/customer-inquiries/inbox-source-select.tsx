"use client";

import { useState } from "react";
import { Filter } from "@/components/layout/app-sidebar/dashboard-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  INBOX_SOURCE_OPTIONS,
  type InboxSourceTab,
} from "@/components/settings/customer-inquiries/use-unified-inbox-controller";
import { cn } from "@/lib/utils";

export function InboxSourceSelect({
  value,
  onChange,
  className,
}: {
  value: InboxSourceTab;
  onChange: (value: InboxSourceTab) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected =
    INBOX_SOURCE_OPTIONS.find((option) => option.id === value) ?? INBOX_SOURCE_OPTIONS[0];
  const isFiltered = value !== "all";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "flex w-fit items-center rounded-full bg-gray-100 p-0.5",
          className,
        )}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Filter by source: ${selected.label}`}
            className={cn(
              "relative flex h-8 shrink-0 items-center justify-center rounded-full px-3.5 text-sm font-medium transition-colors",
              isFiltered || open
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <Filter className="size-[15px] shrink-0" />
          </button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent align="start" className="min-w-40 rounded-lg bg-white p-1.5">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as InboxSourceTab)}
        >
          {INBOX_SOURCE_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <DropdownMenuRadioItem
                key={option.id}
                value={option.id}
                className="gap-2 rounded-md text-sm"
              >
                <Icon className="size-[15px]" />
                {option.label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
