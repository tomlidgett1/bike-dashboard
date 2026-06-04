import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATE_LABEL, type MarketplaceState } from "./mock-data";

const DOT: Record<MarketplaceState, string> = {
  live: "bg-emerald-500",
  draft: "bg-muted-foreground/50",
  needs_images: "bg-amber-500",
  hidden: "bg-slate-400 dark:bg-slate-500",
};

/** Marketplace listing status — outline pill + colored status dot. */
export function StatusBadge({ state }: { state: MarketplaceState }) {
  return (
    <Badge variant="outline" className="gap-1.5 font-normal text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", DOT[state])} />
      {STATE_LABEL[state]}
    </Badge>
  );
}
