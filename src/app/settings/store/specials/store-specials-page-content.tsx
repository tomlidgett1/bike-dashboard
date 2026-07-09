"use client";

import * as React from "react";
import {
  Tags,
  CalendarDays,
  GalleryHorizontal,
  Chart2,
  Restart,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";
import { cn } from "@/lib/utils";
import type {
  SpecialsAnalyticsSummary,
  SpecialsConfig,
  SpecialsConfigUpdate,
  SpecialsCycleWithItems,
} from "@/lib/types/specials";
import { SpecialsSchedulePanel } from "@/components/settings/specials/specials-schedule-panel";
import { SpecialsCyclesView } from "@/components/settings/specials/specials-cycles-view";
import { SpecialsHomepagePreview } from "@/components/settings/specials/specials-homepage-preview";
import { SpecialsPerformance } from "@/components/settings/specials/specials-performance";

type SpecialsTab = "schedule" | "upcoming" | "preview" | "performance";

const TABS: { id: SpecialsTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "upcoming", label: "Upcoming", icon: Tags },
  { id: "preview", label: "Homepage preview", icon: GalleryHorizontal },
  { id: "performance", label: "Performance", icon: Chart2 },
];

export function StoreSpecialsPageContent() {
  const [activeTab, setActiveTab] = React.useState<SpecialsTab>("schedule");
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [config, setConfig] = React.useState<SpecialsConfig | null>(null);
  const [cycles, setCycles] = React.useState<SpecialsCycleWithItems[]>([]);
  const [aiAvailable, setAiAvailable] = React.useState(true);
  const [analytics, setAnalytics] = React.useState<SpecialsAnalyticsSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadCycles = React.useCallback(async () => {
    const res = await fetch("/api/store/specials/cycles", { cache: "no-store" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Failed to load specials");
    const data = await res.json();
    setConfig(data.config as SpecialsConfig);
    setCycles((data.cycles ?? []) as SpecialsCycleWithItems[]);
  }, []);

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [cyclesRes, cfgRes] = await Promise.all([
          fetch("/api/store/specials/cycles", { cache: "no-store" }),
          fetch("/api/store/specials/config", { cache: "no-store" }),
        ]);
        if (!active) return;
        if (cyclesRes.ok) {
          const data = await cyclesRes.json();
          setConfig(data.config as SpecialsConfig);
          setCycles((data.cycles ?? []) as SpecialsCycleWithItems[]);
        }
        if (cfgRes.ok) {
          const data = await cfgRes.json();
          setAiAvailable(!!data.ai_available);
          if (data.config) setConfig(data.config as SpecialsConfig);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load specials");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleSaveConfig = React.useCallback(
    async (update: SpecialsConfigUpdate) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/store/specials/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Failed to save settings");
        setConfig(data.config as SpecialsConfig);
        await loadCycles();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save settings");
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [loadCycles],
  );

  const handleRefresh = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/store/specials/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to refresh");
      setConfig(data.config as SpecialsConfig);
      setCycles((data.cycles ?? []) as SpecialsCycleWithItems[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh");
    } finally {
      setBusy(false);
    }
  }, []);

  const loadAnalytics = React.useCallback(async () => {
    try {
      const res = await fetch("/api/store/specials/analytics", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data.analytics as SpecialsAnalyticsSummary);
      }
    } catch {
      /* analytics is best-effort */
    }
  }, []);

  React.useEffect(() => {
    if (activeTab === "performance" && !analytics) void loadAnalytics();
  }, [activeTab, analytics, loadAnalytics]);

  const activeCycle = React.useMemo(
    () => cycles.find((c) => c.status === "active") ?? cycles[0] ?? null,
    [cycles],
  );

  return (
    <DashboardFloatingPage
      title="Specials"
      icon={Tags}
      description="An AI-curated carousel of discounted products that rotates automatically — priced from your Lightspeed margins and sell-through."
      flush
      actions={
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={handleRefresh}
          disabled={busy || loading || !config?.is_enabled}
        >
          <Restart className={cn("size-4", busy && "animate-spin")} />
          Regenerate
        </Button>
      }
      toolbar={
        <div className="flex items-center bg-gray-100 p-0.5 rounded-full w-fit">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors",
                  activeTab === tab.id
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70",
                )}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>
      }
    >
      <div className="space-y-6 p-4 md:p-5">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading || !config ? (
          <SettingsManagerLoading className="min-h-72" />
        ) : activeTab === "schedule" ? (
          <SpecialsSchedulePanel
            config={config}
            aiAvailable={aiAvailable}
            saving={busy}
            onSave={handleSaveConfig}
          />
        ) : activeTab === "upcoming" ? (
          <SpecialsCyclesView
            config={config}
            cycles={cycles}
            busy={busy}
            onChanged={loadCycles}
            onRefresh={handleRefresh}
          />
        ) : activeTab === "preview" ? (
          <SpecialsHomepagePreview config={config} cycle={activeCycle} />
        ) : (
          <SpecialsPerformance analytics={analytics} onReload={loadAnalytics} />
        )}
      </div>
    </DashboardFloatingPage>
  );
}
