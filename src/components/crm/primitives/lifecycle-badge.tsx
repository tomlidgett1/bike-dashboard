import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  prospect: "Prospects",
  new: "New",
  active: "Active",
  vip: "High value",
  reactivated: "Reactivated",
  at_risk: "At risk",
  dormant: "Dormant",
  churned: "Churned",
  unknown: "Unallocated",
};

export function LifecycleBadge({
  stage,
  label,
  className,
}: {
  stage?: string | null;
  label?: string | null;
  className?: string;
}) {
  const normalisedStage = stage?.toLowerCase() ?? "unknown";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-white px-2 py-1 text-[11px] font-medium text-gray-700 ring-1 ring-inset ring-gray-200",
        className,
      )}
    >
      {label || LABELS[normalisedStage] || normalisedStage.replaceAll("_", " ")}
    </span>
  );
}
