"use client";

import * as React from "react";
import {
  Clock3,
  History,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  NestContentRevision,
  NestWorkspaceContext,
  NestWorkspaceField,
  NestWorkspaceRuntimeLayer,
} from "@/lib/nest/nest-workspace-types";
import { cn } from "@/lib/utils";
import { loadNestHistory, postNestWorkspace } from "./workspace-api";
import {
  ConfigEditorDialog,
  ConfirmActionDialog,
} from "./workspace-dialogs";
import {
  BusyLabel,
  CollapsiblePanel,
  WorkspaceNotice,
  formatWorkspaceDate,
} from "./workspace-ui";

function formatMinuteOfDay(value: unknown): string {
  const minutes = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(minutes)) return "Unknown time";
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = Math.max(0, Math.floor(minutes % 60));
  const suffix = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")}${suffix}`;
}

function openingScheduleLines(schedule: Record<string, unknown>): string[] {
  if (!Array.isArray(schedule.rules)) return [];
  return schedule.rules.flatMap((rule) => {
    if (!rule || typeof rule !== "object") return [];
    const row = rule as Record<string, unknown>;
    const days = Array.isArray(row.days)
      ? row.days
          .filter((day): day is string => typeof day === "string")
          .map((day) => day.charAt(0).toUpperCase() + day.slice(1))
          .join(", ")
      : "Selected days";
    const message =
      typeof row.message === "string" && row.message.trim()
        ? ` — ${row.message.trim()}`
        : "";
    return [
      `${days}: ${formatMinuteOfDay(row.startMinute)}–${formatMinuteOfDay(row.endMinute)}${message}`,
    ];
  });
}

function RuntimeLayerList({
  layers,
  emptyLabel,
}: {
  layers: NestWorkspaceRuntimeLayer[];
  emptyLabel: string;
}) {
  if (layers.length === 0) {
    return <p className="text-sm text-gray-500">{emptyLabel}</p>;
  }
  return (
    <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
      {layers.map((layer) => (
        <div
          key={layer.id}
          className="px-4 py-3"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-gray-900">{layer.title}</p>
            <span className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
              {layer.enabled ? "Active" : "Inactive"}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            {layer.description}
          </p>
        </div>
      ))}
    </div>
  );
}

export function OverviewSection({
  context,
}: {
  context: NestWorkspaceContext;
}) {
  const completion =
    context.health.totalFields > 0
      ? Math.round(
          (context.health.completedFields / context.health.totalFields) * 100,
        )
      : 0;
  const scheduleLines = openingScheduleLines(context.openingSchedule);

  const stats = [
    {
      label: "Business facts",
      value: `${context.health.completedFields}/${context.health.totalFields}`,
      description: `${completion}% complete`,
    },
    {
      label: "Knowledge items",
      value: String(context.health.knowledgeCount),
      description: "Available reference items",
    },
    {
      label: "Needs review",
      value: String(
        context.health.possibleDuplicateCount +
          context.health.failedKnowledgeCount,
      ),
      description: `${context.health.possibleDuplicateCount} possible duplicates · ${context.health.failedKnowledgeCount} failed`,
    },
  ];

  return (
    <section aria-labelledby="overview-heading" className="space-y-4">
      <div>
        <h2
          id="overview-heading"
          className="text-lg font-semibold tracking-tight text-gray-900"
        >
          Overview
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-500">
          See what Nest knows, where it can use that knowledge and which
          protections are always applied.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Active workspace
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight text-gray-900">
              {context.displayName}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Business timezone: {context.businessTimezone || "Not configured"}
            </p>
          </div>
          <span className="self-start rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600">
            Updated {formatWorkspaceDate(context.configUpdatedAt)}
          </span>
        </div>
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-gray-700">
              Business fact coverage
            </span>
            <span className="tabular-nums text-gray-500">{completion}%</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-md bg-gray-100"
            role="progressbar"
            aria-label="Business fact completion"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completion}
          >
            <div
              className="h-full rounded-md bg-gray-700 transition-[width] duration-300"
              style={{ width: `${completion}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-gray-200 bg-white p-4"
          >
            <p className="text-xs font-medium text-gray-500">{stat.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-gray-900">
              {stat.value}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              {stat.description}
            </p>
          </div>
        ))}
      </div>

      <WorkspaceNotice title="Nest improves through your store content">
        This does not retrain hidden model weights. Changes update the facts,
        instructions and knowledge supplied to Nest for each customer reply.
      </WorkspaceNotice>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Your complete store context
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            These are read-only compiled views. Edit the source facts from
            Knowledge or Behaviour.
          </p>
        </div>
        <CollapsiblePanel
          title="Compiled store prompt"
          description="All business-owned facts assembled for Nest."
          badge="Your content"
        >
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
            {context.compiledStorePrompt.trim() ||
              "No compiled store prompt is available yet."}
          </p>
        </CollapsiblePanel>
        <CollapsiblePanel
          title="Opening message schedule"
          description={`Timezone: ${context.businessTimezone}`}
          badge={
            context.openingSchedule.enabled === true ? "Active" : "Inactive"
          }
        >
          {scheduleLines.length > 0 ? (
            <ul className="space-y-2 text-sm leading-relaxed text-gray-700">
              {scheduleLines.map((line) => (
                <li
                  key={line}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2"
                >
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">
              No scheduled opening messages are configured.
            </p>
          )}
        </CollapsiblePanel>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Protected runtime layers
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            These layers are managed by Nest and shown here in plain English.
            They cannot be edited from the knowledge workspace.
          </p>
        </div>
        <CollapsiblePanel
          title="Models"
          description="The AI models Nest may use to understand and answer a customer."
          badge="Protected"
          defaultOpen
        >
          <div className="grid gap-2 md:grid-cols-2">
            {context.runtime.models.map((model) => (
              <div
                key={`${model.label}-${model.value}`}
                className="rounded-xl border border-gray-200 bg-white p-3"
              >
                <p className="text-sm font-medium text-gray-900">
                  {model.label}
                </p>
                <p className="mt-1 text-xs font-medium text-gray-700">
                  {model.value}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                  {model.description}
                </p>
              </div>
            ))}
          </div>
        </CollapsiblePanel>
        <CollapsiblePanel
          title="Information inputs"
          description="The approved sources Nest can read when preparing an answer."
          badge="Protected"
        >
          <RuntimeLayerList
            layers={context.runtime.inputs}
            emptyLabel="No runtime inputs are currently listed."
          />
        </CollapsiblePanel>
        <CollapsiblePanel
          title="Guardrails"
          description="Safety and accuracy rules checked before Nest replies."
          badge="Protected"
        >
          <RuntimeLayerList
            layers={context.runtime.guardrails}
            emptyLabel="No runtime guardrails are currently listed."
          />
        </CollapsiblePanel>
        <CollapsiblePanel
          title="Tools"
          description="Approved actions Nest may take while helping a customer."
          badge="Protected"
        >
          <RuntimeLayerList
            layers={context.runtime.tools}
            emptyLabel="No runtime tools are currently listed."
          />
        </CollapsiblePanel>
      </div>
    </section>
  );
}

export function BehaviourSection({
  context,
  onReload,
}: {
  context: NestWorkspaceContext;
  onReload: () => Promise<void>;
}) {
  const [editingField, setEditingField] =
    React.useState<NestWorkspaceField | null>(null);
  const behaviourFields = context.fields.filter(
    (field) => field.category === "behaviour",
  );

  return (
    <section aria-label="Behaviour" className="space-y-4">
      {behaviourFields.length > 0 ? (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {behaviourFields.map((field) => (
            <article
              key={field.key}
              className="p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">
                    {field.label}
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                    {field.description}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingField(field)}
                  aria-label={`Edit ${field.label}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              </div>
              <p
                className={cn(
                  "mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-700",
                  !field.value.trim() && "italic text-gray-400",
                )}
              >
                {field.value.trim() || "No guidance added yet."}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <WorkspaceNotice title="No editable behaviour fields">
          Protected runtime behaviour is still shown below.
        </WorkspaceNotice>
      )}

      <CollapsiblePanel
        title="How Nest is protected"
        description="Read-only accuracy, privacy and delivery rules applied to every reply."
        badge="Protected"
      >
        <div className="space-y-4">
        <RuntimeLayerList
          layers={context.runtime.guardrails}
          emptyLabel="No protected guardrails are currently listed."
        />
        {context.personalityPrompt ? (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-2 text-xs font-medium text-gray-500">
              Compiled personality guidance
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
              {context.personalityPrompt}
            </p>
          </div>
        ) : null}
        </div>
      </CollapsiblePanel>

      <ConfigEditorDialog
        field={editingField}
        expectedUpdatedAt={context.configUpdatedAt}
        onOpenChange={(open) => {
          if (!open) setEditingField(null);
        }}
        onSaved={onReload}
      />
    </section>
  );
}

function snapshotText(value: Record<string, unknown> | null): string {
  if (!value) return "Nothing";
  const rows = Object.entries(value)
    .filter(([key]) => !["id", "brandKey", "createdAt", "updatedAt"].includes(key))
    .map(([key, entry]) => {
      const label = key
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/_/g, " ")
        .replace(/^./, (character) => character.toUpperCase());
      const text =
        typeof entry === "string"
          ? entry
          : Array.isArray(entry)
            ? entry.join(", ")
            : JSON.stringify(entry);
      return `${label}: ${text}`;
    });
  return rows.length ? rows.join("\n") : "Nothing";
}

function HistoryEntry({
  revision,
  onRestore,
}: {
  revision: NestContentRevision;
  onRestore: (revision: NestContentRevision) => void;
}) {
  const target =
    revision.targetType === "config" ? "Business setting" : "Knowledge item";
  const operation =
    revision.operation === "create"
      ? "Created"
      : revision.operation === "update"
        ? "Updated"
        : revision.operation === "delete"
          ? "Deleted"
          : "Restored";

  return (
    <CollapsiblePanel
      title={`${operation} ${target.toLowerCase()}`}
      description={`${revision.targetKey} · ${formatWorkspaceDate(revision.createdAt)}`}
      badge={revision.source}
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Before
          </p>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-gray-700">
            {snapshotText(revision.beforeValue)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
            After
          </p>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-gray-700">
            {snapshotText(revision.afterValue)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-400">
          Changed by {revision.actorRole || "Nest"}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onRestore(revision)}
          disabled={revision.operation === "restore"}
        >
          <History className="h-3.5 w-3.5" />
          Restore previous version
        </Button>
      </div>
    </CollapsiblePanel>
  );
}

export function HistorySection({
  onReload,
  embedded = false,
}: {
  onReload: () => Promise<void>;
  embedded?: boolean;
}) {
  const [revisions, setRevisions] = React.useState<NestContentRevision[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [restoring, setRestoring] =
    React.useState<NestContentRevision | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRevisions(await loadNestHistory());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load Nest change history.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section
      aria-labelledby={embedded ? undefined : "history-heading"}
      className="space-y-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {embedded ? <span /> : (
          <div>
            <h2
              id="history-heading"
              className="text-lg font-semibold tracking-tight text-gray-900"
            >
              History
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-500">
              Review manual, coaching and restore changes made to Nest knowledge.
            </p>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? (
            <BusyLabel>Loading…</BusyLabel>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </>
          )}
        </Button>
      </div>

      {loading ? (
        <div
          className="space-y-3"
          aria-label="Loading change history"
          aria-busy="true"
        >
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="h-20 animate-pulse rounded-xl border border-gray-200 bg-white"
            />
          ))}
        </div>
      ) : error ? (
        <WorkspaceNotice
          title="Could not load history"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
            >
              Try again
            </Button>
          }
        >
          <span role="alert">{error}</span>
        </WorkspaceNotice>
      ) : revisions.length === 0 ? (
        <WorkspaceNotice title="No changes recorded yet">
          Saved changes will appear here with their previous and new values.
        </WorkspaceNotice>
      ) : (
        <div className="space-y-3">
          {revisions.map((revision) => (
            <HistoryEntry
              key={revision.id}
              revision={revision}
              onRestore={setRestoring}
            />
          ))}
        </div>
      )}

      <ConfirmActionDialog
        open={Boolean(restoring)}
        onOpenChange={(open) => {
          if (!open) setRestoring(null);
        }}
        title="Restore this version?"
        description="This creates a new history entry and replaces the current value with the previous version shown below."
        confirmLabel="Restore version"
        busyLabel="Restoring…"
        onConfirm={async () => {
          if (!restoring) return;
          await postNestWorkspace({
            action: "revision.restore",
            revisionId: restoring.id,
          });
          await Promise.all([onReload(), refresh()]);
        }}
      >
        {restoring ? (
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              Previous version
            </p>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-gray-700">
              {snapshotText(restoring.beforeValue)}
            </p>
          </div>
        ) : null}
      </ConfirmActionDialog>
    </section>
  );
}
