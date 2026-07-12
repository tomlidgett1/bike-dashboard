import { Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";

function freshnessLabel(value?: string | null): string {
  if (!value) return "Freshness unknown";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "Freshness unknown";

  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
  if (days === 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 30) return `Updated ${days} days ago`;
  if (days < 365) return `Updated ${Math.floor(days / 30)} months ago`;
  return `Updated ${Math.floor(days / 365)} years ago`;
}

export function FreshnessBadge({
  value,
  className,
}: {
  value?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-gray-600 ring-1 ring-inset ring-gray-200",
        className,
      )}
    >
      <Clock3 className="h-3 w-3 text-gray-400" aria-hidden />
      {freshnessLabel(value)}
    </span>
  );
}
