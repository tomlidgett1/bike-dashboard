"use client";

import * as React from "react";
import { CheckCircle2, RefreshCw, Sparkles } from "lucide-react";
import { ActionCard, CrmSkeleton } from "@/components/crm/primitives";
import {
  errorMessage,
  type CrmAction,
  type TodayGroupResponse,
  type TodayResponse,
} from "@/components/crm/types";

function responseGroups(payload: TodayResponse): TodayGroupResponse[] {
  return payload.groups ?? payload.today?.groups ?? [];
}

function groupActions(group: TodayGroupResponse): CrmAction[] {
  return group.actions ?? group.items ?? [];
}

export function TodayView() {
  const [groups, setGroups] = React.useState<TodayGroupResponse[]>([]);
  const [summary, setSummary] = React.useState<Record<string, unknown>>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const requestRef = React.useRef(0);

  const load = React.useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/store/crm/today", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as TodayResponse;
      if (!response.ok) {
        throw new Error(errorMessage(payload, "Today could not be loaded."));
      }
      if (requestId !== requestRef.current) return;
      setGroups(responseGroups(payload));
      setSummary(payload.summary ?? { total: payload.today?.totalCount });
    } catch (caught) {
      if (requestId !== requestRef.current) return;
      setError(caught instanceof Error ? caught.message : "Today could not be loaded.");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    return () => {
      requestRef.current += 1;
    };
  }, [load]);

  const decide = React.useCallback(
    async (
      action: CrmAction,
      decision: "approve" | "dismiss" | "snooze",
      snoozeUntil?: string,
    ) => {
      const previous = groups;
      setGroups((current) =>
        current.map((group) => {
          const actions = groupActions(group).filter((item) => item.id !== action.id);
          return {
            ...group,
            count: actions.length,
            actions,
            items: undefined,
          };
        }),
      );
      setNotice(
        decision === "approve"
          ? "Action approved."
          : decision === "dismiss"
            ? "Action dismissed."
            : "Action snoozed.",
      );

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
          throw new Error(errorMessage(payload, "The action could not be updated."));
        }
      } catch (caught) {
        setGroups(previous);
        setNotice(null);
        setError(
          caught instanceof Error ? caught.message : "The action could not be updated.",
        );
      }
    },
    [groups],
  );

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <CrmSkeleton count={2} />
          <CrmSkeleton count={3} />
        </div>
      </div>
    );
  }

  if (error && groups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-md bg-white p-6 text-center ring-1 ring-inset ring-gray-200">
          <p className="text-sm font-medium text-gray-900">Today is unavailable</p>
          <p className="mt-1 text-sm text-gray-600">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Try again
          </button>
        </div>
      </div>
    );
  }

  const total = groups.reduce((sum, group) => sum + groupActions(group).length, 0);
  const summaryEntries = Object.entries(summary)
    .filter(([, value]) => typeof value === "number")
    .slice(0, 4) as Array<[string, number]>;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-4xl space-y-7">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Today</h2>
            <p className="mt-1 text-sm text-gray-600">
              Ranked follow-ups and approvals that need your attention.
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

        {summaryEntries.length > 0 ? (
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {summaryEntries.map(([key, value]) => (
              <div
                key={key}
                className="rounded-md bg-white p-3 ring-1 ring-inset ring-gray-200"
              >
                <dt className="text-xs font-medium capitalize text-gray-500">
                  {key.replaceAll("_", " ")}
                </dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums text-gray-900">
                  {value.toLocaleString("en-AU")}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="rounded-md bg-white px-4 py-3 text-sm text-gray-700 ring-1 ring-inset ring-gray-200"
          >
            {error}
          </div>
        ) : null}
        {notice ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-md bg-white px-4 py-3 text-sm text-gray-700 ring-1 ring-inset ring-gray-200"
          >
            <CheckCircle2 className="h-4 w-4 text-gray-500" aria-hidden />
            {notice}
          </div>
        ) : null}

        {total === 0 ? (
          <div className="rounded-md bg-white px-6 py-12 text-center ring-1 ring-inset ring-gray-200">
            <Sparkles className="mx-auto h-8 w-8 text-gray-400" aria-hidden />
            <h3 className="mt-3 text-sm font-semibold text-gray-900">You are all caught up</h3>
            <p className="mt-1 text-sm text-gray-600">
              New customer actions will appear here as they become due.
            </p>
          </div>
        ) : (
          groups.map((group) => {
            const actions = groupActions(group);
            if (actions.length === 0) return null;
            return (
              <section key={group.id ?? group.key ?? group.label}>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold text-gray-900">{group.label}</h3>
                  <span className="text-xs tabular-nums text-gray-500">
                    {actions.length} {actions.length === 1 ? "action" : "actions"}
                  </span>
                </div>
                <div className="space-y-3">
                  {actions.map((action, index) => (
                    <ActionCard
                      key={action.id}
                      action={action}
                      rank={index + 1}
                      onDecision={(decision, snoozeUntil) =>
                        decide(action, decision, snoozeUntil)
                      }
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
