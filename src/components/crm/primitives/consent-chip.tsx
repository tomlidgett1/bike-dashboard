import { Check, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ConsentChip({
  channel,
  status,
  purpose,
  className,
}: {
  channel: string;
  status: string;
  purpose?: string | null;
  className?: string;
}) {
  const isGranted = status === "granted";
  const isDenied = status === "denied" || status === "withdrawn";
  const Icon = isGranted ? Check : isDenied ? X : Minus;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-gray-700 ring-1 ring-inset ring-gray-200",
        className,
      )}
      title={purpose ? `${purpose} consent: ${status}` : `Consent: ${status}`}
    >
      <Icon className="h-3 w-3 text-gray-500" aria-hidden />
      <span className="capitalize">{channel.replaceAll("_", " ")}</span>
      <span className="text-gray-400">·</span>
      <span className="capitalize">{status.replaceAll("_", " ")}</span>
    </span>
  );
}
