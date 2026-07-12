"use client";

import * as React from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { CrmSkeleton } from "@/components/crm/primitives";
import {
  errorMessage,
  formatAud,
  type AutomationResponse,
} from "@/components/crm/types";

type InsightsResponse = {
  periodDays: number;
  kpis: {
    customers: number;
    customerValue: number;
    attributedRevenue: number;
    openTasks: number;
    completedTasks: number;
    completedWorkorders: number;
    interactions: number;
  };
  lifecycleStages: Record<string, number>;
  activityByChannel: Record<string, number>;
  activityByType: Record<string, number>;
  workordersByStatus: Record<string, number>;
  consentHealth: Record<string, number>;
  performance: Record<string, { samples: number; averageMs: number; p95Ms: number }>;
};

type InsightsData = {
  insights: InsightsResponse | null;
  automations: AutomationResponse | null;
};

export function InsightsView() {
  const [data, setData] = React.useState<InsightsData>({
    insights: null,
    automations: null,
  });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const [insightsResult, automationResult] = await Promise.allSettled([
      fetch("/api/store/crm/insights", { cache: "no-store" }).then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as InsightsResponse;
        if (!response.ok) throw new Error(errorMessage(payload, "CRM insights are unavailable."));
        return payload;
      }),
      fetch("/api/store/crm/automations", { cache: "no-store" }).then(
        async (response) => {
          const payload = (await response.json().catch(() => ({}))) as AutomationResponse;
          if (!response.ok) {
            throw new Error(errorMessage(payload, "Automation metrics are unavailable."));
          }
          return payload;
        },
      ),
    ]);

    setData({
      insights: insightsResult.status === "fulfilled" ? insightsResult.value : null,
      automations:
        automationResult.status === "fulfilled" ? automationResult.value : null,
    });

    const messages = [insightsResult, automationResult]
      .filter((result) => result.status === "rejected")
      .map((result) =>
        result.status === "rejected" && result.reason instanceof Error
          ? result.reason.message
          : "Some insights are unavailable.",
      );
    setError(messages.length ? messages.join(" ") : null);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-4 md:p-6">
        <CrmSkeleton count={4} className="mx-auto max-w-5xl" />
      </div>
    );
  }

  const insights = data.insights;
  const automations = data.automations?.automations ?? [];
  const activeAutomations = automations.filter(
    (automation) => automation.state === "active",
  ).length;
  const pendingApprovals =
    data.automations?.approvals?.length ??
    automations.reduce((sum, automation) => sum + automation.pendingCount, 0);
  const hasData = insights !== null || data.automations !== null;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-7">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Insights</h2>
            <p className="mt-1 text-sm text-gray-600">
              A restrained view of current CRM workload and programme outcomes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-3 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Refresh
          </button>
        </header>

        {error ? (
          <div
            role="status"
            className="rounded-md bg-white px-4 py-3 text-sm text-gray-600 ring-1 ring-inset ring-gray-200"
          >
            {error}
          </div>
        ) : null}

        {hasData ? (
          <>
            <section aria-labelledby="insights-workload-heading">
              <h3 id="insights-workload-heading" className="mb-3 text-sm font-semibold text-gray-900">
                Current workload
              </h3>
              <dl className="grid gap-3 sm:grid-cols-3">
                <Kpi
                  label="Open tasks"
                  value={(insights?.kpis.openTasks ?? 0).toLocaleString("en-AU")}
                />
                <Kpi
                  label="Pending approvals"
                  value={pendingApprovals.toLocaleString("en-AU")}
                />
                <Kpi
                  label="Active automations"
                  value={activeAutomations.toLocaleString("en-AU")}
                />
              </dl>
            </section>

            <section aria-labelledby="insights-outcomes-heading">
              <h3 id="insights-outcomes-heading" className="mb-3 text-sm font-semibold text-gray-900">
                Programme outcomes
              </h3>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Kpi
                  label="Customer value"
                  value={formatAud(insights?.kpis.customerValue ?? 0)}
                  detail={`${(insights?.kpis.customers ?? 0).toLocaleString("en-AU")} customer records`}
                />
                <Kpi
                  label="Attributed revenue"
                  value={formatAud(insights?.kpis.attributedRevenue ?? 0)}
                  detail={`Last ${insights?.periodDays ?? 30} days`}
                />
              </dl>
            </section>

            {insights ? (
              <section aria-labelledby="relationship-health-heading">
                <h3 id="relationship-health-heading" className="mb-3 text-sm font-semibold text-gray-900">
                  Relationship health
                </h3>
                <div className="grid gap-3 lg:grid-cols-2">
                  <Breakdown title="Lifecycle stages" values={insights.lifecycleStages} />
                  <Breakdown title="Customer activity" values={insights.activityByChannel} />
                  <Breakdown title="Workshop status" values={insights.workordersByStatus} />
                  <Breakdown title="Consent health" values={insights.consentHealth} />
                </div>
              </section>
            ) : null}

            {insights && Object.keys(insights.performance).length > 0 ? (
              <section aria-labelledby="crm-speed-heading">
                <h3 id="crm-speed-heading" className="mb-3 text-sm font-semibold text-gray-900">
                  CRM speed
                </h3>
                <div className="overflow-hidden rounded-md bg-white ring-1 ring-inset ring-gray-200">
                  <ul className="divide-y divide-gray-100">
                    {Object.entries(insights.performance).map(([metric, performance]) => (
                      <li key={metric} className="flex items-center justify-between gap-4 px-4 py-3">
                        <div>
                          <p className="text-sm font-medium uppercase text-gray-900">{metric}</p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {performance.samples.toLocaleString("en-AU")} samples
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums text-gray-900">
                            {performance.p95Ms.toLocaleString("en-AU")} ms p95
                          </p>
                          <p className="mt-0.5 text-xs tabular-nums text-gray-500">
                            {performance.averageMs.toLocaleString("en-AU")} ms average
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            ) : null}

            {automations.length > 0 ? (
              <section aria-labelledby="programme-performance-heading">
                <h3 id="programme-performance-heading" className="mb-3 text-sm font-semibold text-gray-900">
                  Programmes
                </h3>
                <div className="overflow-hidden rounded-md bg-white ring-1 ring-inset ring-gray-200">
                  <ul className="divide-y divide-gray-100">
                    {automations.map((automation) => (
                      <li
                        key={automation.id}
                        className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {automation.name}
                          </p>
                          <p className="mt-0.5 text-xs capitalize text-gray-500">
                            {automation.state} · {automation.channelLabel}
                          </p>
                        </div>
                        <div className="text-xs text-gray-500">
                          <span className="font-semibold tabular-nums text-gray-800">
                            {automation.completedCount.toLocaleString("en-AU")}
                          </span>{" "}
                          completed
                        </div>
                        <div className="text-xs font-semibold tabular-nums text-gray-800">
                          {formatAud(automation.attributedRevenue)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <div className="rounded-md bg-white px-6 py-12 text-center ring-1 ring-inset ring-gray-200">
            <BarChart3 className="mx-auto h-8 w-8 text-gray-400" aria-hidden />
            <h3 className="mt-3 text-sm font-semibold text-gray-900">No insights yet</h3>
            <p className="mt-1 text-sm text-gray-600">
              CRM metrics will appear when actions and automations begin reporting data.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Breakdown({ title, values }: { title: string; values: Record<string, number> }) {
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-md bg-white p-4 ring-1 ring-inset ring-gray-200">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h4>
      {entries.length > 0 ? (
        <dl className="mt-3 space-y-2">
          {entries.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 text-sm">
              <dt className="capitalize text-gray-600">{label.replaceAll("_", " ")}</dt>
              <dd className="font-semibold tabular-nums text-gray-900">
                {value.toLocaleString("en-AU")}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-gray-500">No data yet.</p>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-md bg-white p-4 ring-1 ring-inset ring-gray-200">
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value}</dd>
      {detail ? <p className="mt-1 text-xs text-gray-500">{detail}</p> : null}
    </div>
  );
}
