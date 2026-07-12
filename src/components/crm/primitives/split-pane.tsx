import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SplitPane({
  list,
  detail,
  hasSelection,
  className,
}: {
  list: ReactNode;
  detail: ReactNode;
  hasSelection: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid h-full min-h-0 grid-cols-1 overflow-hidden rounded-md bg-white ring-1 ring-inset ring-gray-200 md:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]",
        className,
      )}
    >
      <aside
        className={cn(
          "min-h-0 overflow-hidden border-gray-200 md:block md:border-r",
          hasSelection ? "hidden" : "block",
        )}
      >
        {list}
      </aside>
      <main
        className={cn(
          "min-h-0 overflow-hidden md:block",
          hasSelection ? "block" : "hidden",
        )}
      >
        {detail}
      </main>
    </div>
  );
}
