"use client";

import * as React from "react";
import { Bot, Clock3, RefreshCw } from "lucide-react";
import { ActionCard, CrmSkeleton } from "@/components/crm/primitives";
import {
  errorMessage,
  formatAud,
  formatCrmDateTime,
  type AutomationResponse,
  type CrmAction,
} from "@/components/crm/types";

export function AutomationsView() {
  const [data, setData] = React.useState<AutomationResponse>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/store/crm/automations", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as AutomationResponse;
      if (!response.ok) {
        throw new Error(errorMessage(payload, "Automations could not be loaded."));
      }
      setData(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Automations could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const decide = async (
    action: CrmAction,
    decision: "approve" | "dismiss" | "snooze",
    snoozeUntil?: string,
  ) => {
    const previous = data.approvals ?? [];
    setData((current) => ({
      ...current,
      approvals: (current.approvals ?? []).filter((item) => item.id !== action.id),
    }));
    try {
      const response = await fetch(`/api/store/crm/actions/${action.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: decision,
          ...(snoozeUntil ? { snoozeUntil } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(errorMessage(payload, "The approval could not be updated."));
      }
    } catch (caught) {
      setData((current) => ({ ...current, approvals: previous }));
      setError(
        caught instanceof Error ? caught.message : "The approval could not be updated.",
      );
    }
  };

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-4 md:p-6">
        <CrmSkeleton count={4} className="mx-auto max-w-5xl" />
      </div>
    );
  }

  const automations = data.automations ?? [];
  const approvals = data.approvals ?? [];
  const runs = data.runs ?? [];

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-7">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Automations</h2>
            <p className="mt-1 text-sm text-gray-600">
              Live customer programmes, approvals, and recent runs.
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
            role="alert"
            className="rounded-md bg-white px-4 py-3 text-sm text-gray-700 ring-1 ring-inset ring-gray-200"
          >
            {error}
          </div>
        ) : null}

        <section aria-labelledby="automation-list-heading">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 id="automation-list-heading" className="text-sm font-semibold text-gray-900">
              Programmes
            </h3>
            <span className="text-xs text-gray-500">{automations.length} configured</span>
          </div>
          {automations.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {automations.map((automation) => (
                <article
                  key={automation.id}
                  className="rounded-md bg-white p-4 ring-1 ring-inset ring-gray-200"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500">
                      <Bot className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold text-gray-900">
                          {automation.name}
                        </h4>
                        <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-medium capitalize text-gray-700 ring-1 ring-inset ring-gray-200">
                          {automation.state}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-5 text-gray-600">
                        {automation.description}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-gray-100 pt-3">
                    <div>
                      <dt className="text-[11px] text-gray-500">Pending</dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
                        {automation.pendingCount.toLocaleString("en-AU")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-gray-500">Completed</dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
                        {automation.completedCount.toLocaleString("en-AU")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-gray-500">Revenue</dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
                        {formatAud(automation.attributedRevenue)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                    <span>{automation.channelLabel}</span>
                    <span>
                      {automation.lastRunAt
                        ? `Last ran ${formatCrmDateTime(automation.lastRunAt)}`
                        : "Not run yet"}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState message="No CRM automations are configured yet." />
          )}
        </section>

        <section aria-labelledby="approvals-heading">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 id="approvals-heading" className="text-sm font-semibold text-gray-900">
              Approvals
            </h3>
            <span className="text-xs text-gray-500">{approvals.length} waiting</span>
          </div>
          {approvals.length > 0 ? (
            <div className="space-y-3">
              {approvals.map((approval) => (
                <ActionCard
                  key={approval.id}
                  action={approval}
                  onDecision={(decision, snoozeUntil) =>
                    decide(approval, decision, snoozeUntil)
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState message="There are no approvals waiting for review." />
          )}
        </section>

        {runs.length > 0 ? (
          <section aria-labelledby="runs-heading">
            <h3 id="runs-heading" className="mb-3 text-sm font-semibold text-gray-900">
              Recent runs
            </h3>
            <div className="overflow-hidden rounded-md bg-white ring-1 ring-inset ring-gray-200">
              <ul className="divide-y divide-gray-100">
                {runs.map((run) => (
                  <li key={run.id} className="flex items-start gap-3 px-4 py-3">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {run.automationName || run.name || "Automation run"}
                      </p>
                      {run.summary ? (
                        <p className="mt-0.5 text-xs text-gray-500">{run.summary}</p>
                      ) : null}
                    </div>
                    <span className="text-xs capitalize text-gray-500">
                      {run.status?.replaceAll("_", " ") || "Completed"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md bg-white px-5 py-8 text-center text-sm text-gray-500 ring-1 ring-inset ring-gray-200">
      {message}
    </div>
  );
}
