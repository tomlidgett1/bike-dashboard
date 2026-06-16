"use client";

import { LayoutGrid, Table2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";

export type ActionsViewMode = "bento" | "simple";

export function ActionsViewToggle({
  view,
  onViewChange,
  className,
}: {
  view: ActionsViewMode;
  onViewChange: (view: ActionsViewMode) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center bg-gray-100 p-0.5 rounded-md w-fit", className)}>
      <button
        type="button"
        onClick={() => onViewChange("bento")}
        className={cn(
          "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
          view === "bento"
            ? "text-gray-800 bg-white shadow-sm"
            : "text-gray-600 hover:bg-gray-200/70",
        )}
      >
        <LayoutGrid className="h-3 w-3" />
        Bento
      </button>
      <button
        type="button"
        onClick={() => onViewChange("simple")}
        className={cn(
          "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
          view === "simple"
            ? "text-gray-800 bg-white shadow-sm"
            : "text-gray-600 hover:bg-gray-200/70",
        )}
      >
        <Table2 className="h-3 w-3" />
        Simple
      </button>
    </div>
  );
}
