import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

const DOT: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground/50",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  info: "bg-sky-500",
};

/**
 * A neutral outline pill with a small semantic status dot. Used for listing
 * states, connection states, etc. The dot is the only colour — keeps the UI
 * calm and consistent.
 */
export function StatusBadge({
  label,
  tone = "neutral",
  className,
}: {
  label: React.ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 rounded-md border-gray-200 bg-white font-normal text-muted-foreground",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT[tone])} />
      {label}
    </Badge>
  );
}
