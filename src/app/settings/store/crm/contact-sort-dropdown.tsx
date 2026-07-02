"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDown,
  ArrowUpDown,
  BarChart3,
  ChevronDown,
  Clock,
  DollarSign,
  History,
  ShoppingBag,
  Sparkles,
  User,
  Users,
} from "@/components/layout/app-sidebar/dashboard-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { CrmContactGroup, CrmContactSort } from "@/lib/crm/types";

type SortOption = {
  id: CrmContactSort;
  label: string;
  description: string;
  icon: LucideIcon;
};

const SORT_GROUPS: { label?: string; options: SortOption[] }[] = [
  {
    options: [
      {
        id: "recent",
        label: "Recently added",
        description: "Newest imports first",
        icon: Clock,
      },
      {
        id: "name_asc",
        label: "Name A–Z",
        description: "Alphabetical order",
        icon: User,
      },
    ],
  },
  {
    label: "Customer tenure",
    options: [
      {
        id: "joined_newest",
        label: "Newest customers",
        description: "Joined most recently",
        icon: Sparkles,
      },
      {
        id: "joined_oldest",
        label: "Longest customers",
        description: "Joined earliest",
        icon: History,
      },
    ],
  },
  {
    label: "Spend",
    options: [
      {
        id: "spend_high",
        label: "Highest spend",
        description: "Top lifetime value",
        icon: DollarSign,
      },
      {
        id: "spend_low",
        label: "Lowest spend",
        description: "Smallest lifetime value",
        icon: DollarSign,
      },
    ],
  },
  {
    label: "Visits",
    options: [
      {
        id: "visits_high",
        label: "Most visits",
        description: "Highest purchase frequency",
        icon: BarChart3,
      },
      {
        id: "visits_low",
        label: "Fewest visits",
        description: "Lowest purchase frequency",
        icon: BarChart3,
      },
    ],
  },
  {
    options: [
      {
        id: "last_purchase",
        label: "Recent purchasers",
        description: "Bought most recently",
        icon: ShoppingBag,
      },
    ],
  },
];

const ALL_SORT_OPTIONS = SORT_GROUPS.flatMap((group) => group.options);

function sortLabel(sort: CrmContactSort): string {
  return ALL_SORT_OPTIONS.find((option) => option.id === sort)?.label ?? "Sort";
}

function SortMenuItem({
  option,
  active,
  onSelect,
}: {
  option: SortOption;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = option.icon;
  const showDown =
    option.id === "spend_low" || option.id === "visits_low";

  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className={cn(
        "cursor-pointer gap-2.5 rounded-md py-2",
        active && "bg-zinc-100",
      )}
    >
      <span className="relative flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-600">
        <Icon className="size-3.5" />
        {showDown ? (
          <ArrowDown className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-white text-zinc-500" />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">{option.label}</p>
        <p className="text-[11px] text-muted-foreground">{option.description}</p>
      </div>
    </DropdownMenuItem>
  );
}

export function ContactSortDropdown({
  value,
  onChange,
}: {
  value: CrmContactSort;
  onChange: (value: CrmContactSort) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Sort contacts"
          className="flex h-9 items-center gap-1.5 rounded-md border border-border/60 bg-white px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
        >
          <ArrowUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="max-w-[9rem] truncate">{sortLabel(value)}</span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-60 rounded-md border border-border/60 bg-white p-1 shadow-lg"
      >
        {SORT_GROUPS.map((group, groupIndex) => (
          <React.Fragment key={group.label ?? `group-${groupIndex}`}>
            {groupIndex > 0 ? <DropdownMenuSeparator className="my-1" /> : null}
            {group.label ? (
              <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </DropdownMenuLabel>
            ) : null}
            {group.options.map((option) => (
              <SortMenuItem
                key={option.id}
                option={option}
                active={value === option.id}
                onSelect={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
              />
            ))}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ContactGroupFilterDropdown({
  groups,
  value,
  onChange,
}: {
  groups: CrmContactGroup[];
  value: string;
  onChange: (groupId: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = groups.find((group) => group.id === value);
  const label = selected?.name ?? "All groups";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Filter by group"
          className="flex h-9 items-center gap-1.5 rounded-md border border-border/60 bg-white px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
        >
          <Users className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="max-w-[8rem] truncate">{label}</span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-56 rounded-md border border-border/60 bg-white p-1 shadow-lg"
      >
        <DropdownMenuItem
          onSelect={() => {
            onChange("");
            setOpen(false);
          }}
          className={cn("cursor-pointer gap-2.5 rounded-md py-2", !value && "bg-zinc-100")}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-600">
            <Users className="size-3.5" />
          </span>
          <div>
            <p className="text-xs font-medium text-foreground">All groups</p>
            <p className="text-[11px] text-muted-foreground">Every contact</p>
          </div>
        </DropdownMenuItem>
        {groups.length > 0 ? <DropdownMenuSeparator className="my-1" /> : null}
        {groups.map((group) => (
          <DropdownMenuItem
            key={group.id}
            onSelect={() => {
              onChange(group.id);
              setOpen(false);
            }}
            className={cn(
              "cursor-pointer gap-2.5 rounded-md py-2",
              value === group.id && "bg-zinc-100",
            )}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-600">
              <Users className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{group.name}</p>
              {group.member_count != null ? (
                <p className="text-[11px] text-muted-foreground">
                  {group.member_count.toLocaleString()} member
                  {group.member_count === 1 ? "" : "s"}
                </p>
              ) : null}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
