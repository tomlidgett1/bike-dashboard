"use client";

import * as React from "react";
import { BarChart3, LayoutGrid, MessageSquare } from "@/components/layout/app-sidebar/dashboard-icons";
import { StoreDashboardManager } from "@/components/dashboard/store-dashboard-manager";
import {
  MetricsInvestigationPanel,
  type MetricsInvestigationState,
} from "@/components/metrics/metrics-investigation-panel";
import { MetricsChatPanel } from "@/components/metrics/metrics-chat-panel";
import { cn } from "@/lib/utils";

type MetricsTab = "investigate" | "dashboard";

export function MetricsWorkspace({
  initialTab = "investigate",
}: {
  initialTab?: "investigate" | "dashboard";
}) {
  const [activeTab, setActiveTab] = React.useState<MetricsTab>(initialTab);
  const [investigation, setInvestigation] = React.useState<MetricsInvestigationState | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center bg-gray-100 p-0.5 rounded-full w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("investigate")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
            activeTab === "investigate"
              ? "text-gray-800 bg-white shadow-sm"
              : "text-gray-600 hover:bg-gray-200/70",
          )}
        >
          <MessageSquare size={15} />
          Investigate
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("dashboard")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
            activeTab === "dashboard"
              ? "text-gray-800 bg-white shadow-sm"
              : "text-gray-600 hover:bg-gray-200/70",
          )}
        >
          <LayoutGrid size={15} />
          My dashboard
        </button>
      </div>

      {activeTab === "investigate" ? (
        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-h-0 overflow-y-auto pr-1">
            <MetricsInvestigationPanel state={investigation} />
          </div>
          <MetricsChatPanel
            className="min-h-[520px] xl:min-h-0 xl:h-full"
            onInvestigationChange={setInvestigation}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mb-3 rounded-md border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-gray-600" />
              <p className="text-sm text-gray-700">
                Pin charts, tables, and pivots from investigations to build your store command centre.
              </p>
            </div>
          </div>
          <StoreDashboardManager />
        </div>
      )}
    </div>
  );
}
