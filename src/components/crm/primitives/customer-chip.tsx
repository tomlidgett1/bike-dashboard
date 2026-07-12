import Link from "next/link";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

type CustomerChipProps = {
  customerId?: string | null;
  name?: string | null;
  detail?: string | null;
  className?: string;
  compact?: boolean;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function CustomerChip({
  customerId,
  name,
  detail,
  className,
  compact = false,
}: CustomerChipProps) {
  const label = name?.trim() || "Unknown customer";
  const content = (
    <>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md bg-gray-100 font-semibold text-gray-600",
          compact ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs",
        )}
        aria-hidden
      >
        {name ? initials(label) : <UserRound className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-gray-900">{label}</span>
        {detail ? (
          <span className="block truncate text-xs text-gray-500">{detail}</span>
        ) : null}
      </span>
    </>
  );

  const classes = cn(
    "inline-flex min-w-0 items-center gap-2 rounded-md bg-white px-1.5 py-1 text-left ring-1 ring-inset ring-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2",
    className,
  );

  return customerId ? (
    <Link href={`/settings/store/crm/customers/${customerId}`} className={classes}>
      {content}
    </Link>
  ) : (
    <span className={classes}>{content}</span>
  );
}
