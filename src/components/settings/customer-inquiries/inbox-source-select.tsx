"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const selected = INBOX_SOURCE_OPTIONS.find((option) => option.id === value);

  return (
    <Select value={value} onValueChange={(next) => onChange(next as InboxSourceTab)}>
      <SelectTrigger
        size="sm"
        className={cn(
          "h-8 min-w-[8.5rem] rounded-full border-gray-200/80 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-800 shadow-sm",
          className,
        )}
      >
        <SelectValue>
          <span className="flex items-center gap-1.5">
            {selected?.icon ? <selected.icon className="size-[15px] shrink-0" /> : null}
            {selected?.label ?? "Source"}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="rounded-md">
        {INBOX_SOURCE_OPTIONS.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            <span className="flex items-center gap-1.5">
              <option.icon className="size-[15px] shrink-0" />
              {option.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
