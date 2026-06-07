"use client";

import { GenieChart } from "@/components/genie/genie-chart";
import { GenieDataTable } from "@/components/genie/genie-data-table";
import { GeniePivotTable } from "@/components/genie/genie-pivot-table";
import type { DashboardWidget } from "@/lib/dashboard/store-dashboard";

export function DashboardWidgetRenderer({ widget }: { widget: DashboardWidget }) {
  const dateFormat = widget.dateFormat ?? "default";
  const fieldFormats = widget.fieldFormats;

  switch (widget.payload.type) {
    case "chart":
      return <GenieChart chart={widget.payload.data} variant="dashboard" embedded />;
    case "table":
      return (
        <GenieDataTable
          table={widget.payload.data}
          variant="dashboard"
          embedded
          showCsvDownload={false}
          dateFormat={dateFormat}
          columnFormats={fieldFormats?.tableColumns}
        />
      );
    case "pivot":
      return (
        <GeniePivotTable
          table={widget.payload.data}
          embedded
          showCsvDownload={false}
          dateFormat={dateFormat}
          fieldFormats={fieldFormats}
        />
      );
    default:
      return null;
  }
}
