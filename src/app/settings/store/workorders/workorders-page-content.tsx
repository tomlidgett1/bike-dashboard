"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Workorders — open jobs waiting for payment, with one-click voice dictation.
//
// Single narrow-row table (most recently edited first). Tap Dictate to start
// recording immediately; stop opens a review popup where staff can re-pick a
// note format, edit, then append to the Lightspeed workorder note.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ClipboardList,
  DocumentText,
  History,
  Microphone,
  Notes,
  Notebook,
  Search,
  Stop,
  Wrench,
} from "@/components/layout/app-sidebar/dashboard-icons";
import {
  FloatingCard,
  FloatingCardPageBody,
  FloatingCardPageHeader,
} from "@/components/layout/floating-card-page";
import {
  StoreSettingsPageHeader,
  storeSettingsHeaderActionClass,
} from "@/components/settings/actions-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { floatingCardPageHeaderNudgeClass } from "@/lib/layout/floating-card-page";
import { buildCustomerEnquiriesNestUrl } from "@/lib/customer-inquiries/enquiries-deep-link";
import { NestLogo } from "@/components/genie/nest-logo";
import { LightspeedLogo } from "@/components/genie/lightspeed-logo";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type Workorder = {
  workorder_id: string;
  status_name: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  note: string;
  time_in: string;
  eta_out: string;
  updated_at: string;
  items_subtotal: number | null;
  lines: Array<{ line_id: string; note: string; done: boolean }>;
};

type NoteTemplate = {
  id: string;
  name: string;
  template: string;
  created_at: string;
};

type DictationLogEntry = {
  id: string;
  workorder_id: string;
  customer_name: string;
  template_name: string | null;
  raw_transcript: string;
  formatted_note: string;
  saved_note: string;
  started_at: string;
  created_at: string;
};

type DictationStep = "recording" | "transcribing" | "review" | "saving" | "saved";

const SELECTED_TEMPLATE_KEY = "workorders.selectedTemplateId";
const STANDARD_TEMPLATE_ID = "none";
const MAX_RECORDING_MS = 3 * 60 * 1000;

const TEMPLATE_ICONS = [DocumentText, Notes, ClipboardList, Notebook] as const;

// ── Small helpers ────────────────────────────────────────────────────────────

function formatDay(iso: string): string | null {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Australia/Melbourne",
  }).format(new Date(parsed));
}

function formatRelativeEdited(iso: string): string | null {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  const diffMs = Date.now() - parsed;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDay(iso);
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function formatLogTimestamp(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Melbourne",
  }).format(new Date(parsed));
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function workorderStatusBadgeClass(statusName: string): string {
  const value = statusName.trim().toLowerCase();
  if (/(today|due today)/.test(value)) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (/(finish|finished|done|complete|ready|pickup)/.test(value)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (/(progress|working|service|repair)/.test(value)) {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }
  if (/(wait|pending|hold|parts)/.test(value)) {
    return "border-orange-200 bg-orange-50 text-orange-800";
  }
  if (/(paid|closed)/.test(value)) {
    return "border-gray-200 bg-gray-100 text-gray-700";
  }
  if (/(quote|estimate)/.test(value)) {
    return "border-violet-200 bg-violet-50 text-violet-800";
  }
  return "border-gray-200 bg-gray-50 text-gray-700";
}

function WorkorderStatusBadge({ status }: { status: string }) {
  const label = status.trim() || "Unknown";
  return (
    <span
      className={cn(
        "inline-flex max-w-full truncate rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4",
        workorderStatusBadgeClass(label),
      )}
    >
      {label}
    </span>
  );
}

function filterWorkorders(workorders: Workorder[], query: string): Workorder[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return workorders;
  return workorders.filter((workorder) => {
    const haystack = [
      workorder.customer_name,
      workorder.workorder_id,
      workorder.status_name,
      workorder.note,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(trimmed);
  });
}

function sortByMostRecentlyEdited(workorders: Workorder[]): Workorder[] {
  return [...workorders].sort((a, b) => {
    const aTs = Date.parse(a.updated_at) || 0;
    const bTs = Date.parse(b.updated_at) || 0;
    return bTs - aTs;
  });
}

type WorkorderSortKey = "updated" | "customer" | "job" | "status" | "note";
type WorkorderSortDirection = "asc" | "desc";

function latestNotePreview(workorder: Workorder): string {
  return workorder.note.split("\n").filter(Boolean).slice(-1)[0]?.trim() ?? "";
}

function sortWorkorders(
  workorders: Workorder[],
  sortKey: WorkorderSortKey,
  sortDirection: WorkorderSortDirection,
): Workorder[] {
  const direction = sortDirection === "asc" ? 1 : -1;

  return [...workorders].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case "customer":
        result = a.customer_name.localeCompare(b.customer_name, "en-AU", { sensitivity: "base" });
        break;
      case "job":
        result = Number(a.workorder_id) - Number(b.workorder_id);
        break;
      case "status":
        result = a.status_name.localeCompare(b.status_name, "en-AU", { sensitivity: "base" });
        break;
      case "note": {
        const aNote = latestNotePreview(a);
        const bNote = latestNotePreview(b);
        if (!aNote && bNote) result = 1;
        else if (aNote && !bNote) result = -1;
        else result = aNote.localeCompare(bNote, "en-AU", { sensitivity: "base" });
        break;
      }
      case "updated":
      default:
        result = (Date.parse(a.updated_at) || 0) - (Date.parse(b.updated_at) || 0);
        break;
    }

    if (result === 0 && sortKey !== "updated") {
      result = (Date.parse(a.updated_at) || 0) - (Date.parse(b.updated_at) || 0);
    }

    return result * direction;
  });
}

function WorkorderSortButton({
  label,
  column,
  sortKey,
  sortDirection,
  onSort,
  align = "left",
}: {
  label: string;
  column: WorkorderSortKey;
  sortKey: WorkorderSortKey;
  sortDirection: WorkorderSortDirection;
  onSort: (column: WorkorderSortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === column;
  const Icon = !active ? ArrowUpDown : sortDirection === "asc" ? ArrowUp : ArrowDown;

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-0.5 py-0.5 transition-colors hover:text-gray-600",
        align === "right" && "ml-auto",
      )}
    >
      {label}
      <Icon className={cn("h-3 w-3 shrink-0", active ? "text-gray-500" : "text-gray-300")} />
    </button>
  );
}

function WorkordersPageSpinner({ label = "Loading workorders" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500"
    />
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M5 12.5 10 17.5 19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function WorkordersPageContent() {
  const [workorders, setWorkorders] = React.useState<Workorder[] | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);
  const [templates, setTemplates] = React.useState<NoteTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string>(STANDARD_TEMPLATE_ID);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [logOpen, setLogOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeSession, setActiveSession] = React.useState<{
    workorder: Workorder;
    templateId: string;
  } | null>(null);
  const stopRecordingRef = React.useRef<(() => void) | null>(null);

  const loadWorkorders = React.useCallback(async () => {
    setListError(null);
    try {
      const res = await fetch("/api/workorders/open");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load workorders");
      const next = sortByMostRecentlyEdited((data.workorders ?? []) as Workorder[]);
      setWorkorders(next);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Failed to load workorders");
      setWorkorders((prev) => prev ?? []);
    }
  }, []);

  const loadTemplates = React.useCallback(async () => {
    try {
      const res = await fetch("/api/workorders/templates");
      const data = await res.json();
      if (res.ok) setTemplates(data.templates ?? []);
    } catch {
      // Non-fatal — dictation still works without a template.
    }
  }, []);

  React.useEffect(() => {
    void loadWorkorders();
    void loadTemplates();
    const stored = window.localStorage.getItem(SELECTED_TEMPLATE_KEY);
    if (stored) setSelectedTemplateId(stored);
  }, [loadWorkorders, loadTemplates]);

  const resolveTemplate = React.useCallback(
    (templateId: string) =>
      templateId === STANDARD_TEMPLATE_ID
        ? null
        : (templates.find((template) => template.id === templateId) ?? null),
    [templates],
  );

  const filteredWorkorders = React.useMemo(
    () => filterWorkorders(workorders ?? [], searchQuery),
    [workorders, searchQuery],
  );

  const handleNoteAppended = (workorderId: string, note: string) => {
    setWorkorders((prev) => {
      if (!prev) return prev;
      const next = prev.map((workorder) =>
        workorder.workorder_id === workorderId
          ? { ...workorder, note, updated_at: new Date().toISOString() }
          : workorder,
      );
      return sortByMostRecentlyEdited(next);
    });
  };

  const startDictation = (workorder: Workorder, templateId?: string) => {
    if (activeSession) return;
    setActiveSession({
      workorder,
      templateId: templateId ?? selectedTemplateId,
    });
  };

  return (
    <>
      <FloatingCardPageHeader>
        <StoreSettingsPageHeader
          title="Workorders"
          icon={Wrench}
          hideCompose
          className={cn(floatingCardPageHeaderNudgeClass, "!static !pb-0")}
          trailingActions={
            <button
              type="button"
              onClick={() => setLogOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
              aria-label="View recent dictated notes"
            >
              <History className="h-4 w-4" size={16} />
              <span className="hidden sm:inline">Recent dictations</span>
            </button>
          }
        />
      </FloatingCardPageHeader>

      <FloatingCardPageBody>
        <FloatingCard>
          <WorkordersToolbar
            onOpenFormats={() => setManageOpen(true)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />

          <WorkorderTable
            workorders={filteredWorkorders}
            loading={workorders === null}
            error={listError}
            searchActive={searchQuery.trim().length > 0}
            selectedTemplateId={selectedTemplateId}
            templates={templates}
            recordingWorkorderId={
              activeSession ? activeSession.workorder.workorder_id : null
            }
            onDictate={startDictation}
            onStopRecording={() => stopRecordingRef.current?.()}
            onRetry={() => {
              setWorkorders(null);
              void loadWorkorders();
            }}
          />
        </FloatingCard>
      </FloatingCardPageBody>

      <DictationSession
        session={activeSession}
        templates={templates}
        resolveTemplate={resolveTemplate}
        stopRecordingRef={stopRecordingRef}
        onClose={() => setActiveSession(null)}
        onAppended={handleNoteAppended}
        onTemplateIdChange={(templateId) =>
          setActiveSession((prev) => (prev ? { ...prev, templateId } : prev))
        }
      />

      <TemplatesDialog
        open={manageOpen}
        templates={templates}
        onClose={() => setManageOpen(false)}
        onChanged={loadTemplates}
      />

      <DictationLogDialog open={logOpen} onClose={() => setLogOpen(false)} />
    </>
  );
}

// ── Toolbar ──────────────────────────────────────────────────────────────────

function WorkordersToolbar({
  onOpenFormats,
  searchQuery,
  onSearchChange,
}: {
  onOpenFormats: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-3 border-b border-border/60 bg-gray-50 px-4 py-3 md:flex-row md:items-center md:px-5">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <button
          type="button"
          className={storeSettingsHeaderActionClass()}
          onClick={onOpenFormats}
        >
          <ClipboardList className="h-3.5 w-3.5 shrink-0" size={14} />
          Formats
        </button>
      </div>

      <div className="relative w-full md:ml-auto md:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <Input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search customer, job number…"
          className="h-8 rounded-full border-gray-200 bg-white pl-8 text-sm shadow-sm"
        />
      </div>
    </div>
  );
}

function TemplateChip({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-white text-gray-800 shadow-sm ring-1 ring-gray-200"
          : "text-gray-600 hover:bg-gray-200/70",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" size={14} />
      <span className="max-w-[9rem] truncate">{label}</span>
    </button>
  );
}

// ── Table ────────────────────────────────────────────────────────────────────

function WorkorderTable({
  workorders,
  loading,
  error,
  searchActive,
  selectedTemplateId,
  templates,
  recordingWorkorderId,
  onDictate,
  onStopRecording,
  onRetry,
}: {
  workorders: Workorder[];
  loading: boolean;
  error: string | null;
  searchActive: boolean;
  selectedTemplateId: string;
  templates: NoteTemplate[];
  recordingWorkorderId: string | null;
  onDictate: (workorder: Workorder, templateId?: string) => void;
  onStopRecording: () => void;
  onRetry: () => void;
}) {
  const [sortKey, setSortKey] = React.useState<WorkorderSortKey>("updated");
  const [sortDirection, setSortDirection] = React.useState<WorkorderSortDirection>("desc");

  const sortedWorkorders = React.useMemo(
    () => sortWorkorders(workorders, sortKey, sortDirection),
    [workorders, sortKey, sortDirection],
  );

  const handleSort = React.useCallback(
    (column: WorkorderSortKey) => {
      if (sortKey === column) {
        setSortDirection((currentDirection) => (currentDirection === "asc" ? "desc" : "asc"));
        return;
      }
      setSortKey(column);
      setSortDirection(column === "updated" ? "desc" : "asc");
    },
    [sortKey],
  );

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center py-20">
        <WorkordersPageSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-4 rounded-md border border-gray-200 bg-white p-4">
        <div className="flex items-start gap-2 text-sm text-gray-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
          <div className="min-w-0 flex-1">
            <span>{error}</span>
            <Button variant="outline" size="sm" className="mt-3 rounded-md" onClick={onRetry}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (workorders.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-md border border-gray-200 bg-white">
          <Wrench className="h-5 w-5 text-gray-400" />
        </span>
        <p className="mt-4 text-sm font-medium text-gray-900">
          {searchActive ? "No workorders match your search" : "No open workorders waiting for payment"}
        </p>
        <p className="mt-1 max-w-[260px] text-xs text-gray-500">
          {searchActive
            ? "Try a different customer name or job number."
            : "Nice one — nothing is waiting on payment right now."}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="sticky top-0 z-[1] hidden grid-cols-[minmax(0,1.4fr)_5.5rem_minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-3 border-b border-gray-100 bg-white/95 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-400 backdrop-blur md:grid md:px-5">
        <WorkorderSortButton
          label="Customer"
          column="customer"
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
        <WorkorderSortButton
          label="Job"
          column="job"
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
        <WorkorderSortButton
          label="Status"
          column="status"
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
        <WorkorderSortButton
          label="Latest note"
          column="note"
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
        <span className="text-right">Dictate</span>
      </div>
      <div className="divide-y divide-gray-100">
        {sortedWorkorders.map((workorder) => (
          <WorkorderRow
            key={workorder.workorder_id}
            workorder={workorder}
            selectedTemplateId={selectedTemplateId}
            templates={templates}
            isRecording={recordingWorkorderId === workorder.workorder_id}
            dictationLocked={recordingWorkorderId !== null}
            onDictate={onDictate}
            onStopRecording={onStopRecording}
          />
        ))}
      </div>
    </div>
  );
}

function WorkorderRow({
  workorder,
  selectedTemplateId,
  templates,
  isRecording,
  dictationLocked,
  onDictate,
  onStopRecording,
}: {
  workorder: Workorder;
  selectedTemplateId: string;
  templates: NoteTemplate[];
  isRecording: boolean;
  dictationLocked: boolean;
  onDictate: (workorder: Workorder, templateId?: string) => void;
  onStopRecording: () => void;
}) {
  const [rowTemplateId, setRowTemplateId] = React.useState(selectedTemplateId);
  const [templateMenuOpen, setTemplateMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setRowTemplateId(selectedTemplateId);
  }, [selectedTemplateId]);

  React.useEffect(() => {
    if (!templateMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setTemplateMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [templateMenuOpen]);

  const due = formatDay(workorder.eta_out);
  const edited = formatRelativeEdited(workorder.updated_at);
  const preview = workorder.note.split("\n").filter(Boolean).slice(-1)[0] ?? "No notes yet";
  const fullNote = workorder.note.trim();
  const activeTemplateName =
    rowTemplateId === STANDARD_TEMPLATE_ID
      ? "Standard"
      : (templates.find((template) => template.id === rowTemplateId)?.name ?? "Standard");
  const messageHref = buildCustomerEnquiriesNestUrl({
    compose: true,
    phone: workorder.customer_phone ?? undefined,
    name: workorder.customer_name,
    customerId: workorder.customer_id,
  });

  return (
    <div
      className={cn(
        "grid grid-cols-1 items-center gap-2 px-4 py-2 transition-colors md:grid-cols-[minmax(0,1.4fr)_5.5rem_minmax(0,1fr)_minmax(0,1.2fr)_auto] md:gap-3 md:px-5 md:py-1.5",
        isRecording ? "bg-gray-50" : "hover:bg-gray-50/80",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <LightspeedLogo className="h-6 w-6 shrink-0 rounded-full object-cover" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-gray-900">{workorder.customer_name}</p>
            {edited ? (
              <span className="hidden shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 sm:inline">
                {edited}
              </span>
            ) : null}
          </div>
          <p className="truncate text-[11px] text-gray-400 md:hidden">
            #{workorder.workorder_id}
            {due ? ` · Due ${due}` : ""}
          </p>
        </div>
      </div>

      <p className="hidden truncate text-xs tabular-nums text-gray-500 md:block">
        #{workorder.workorder_id}
      </p>

      <div className="hidden min-w-0 items-center gap-1.5 md:flex">
        <WorkorderStatusBadge status={workorder.status_name} />
        {due ? <span className="truncate text-xs text-gray-400">Due {due}</span> : null}
      </div>

      {fullNote ? (
        <TooltipProvider delayDuration={1000}>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="hidden truncate text-xs text-gray-400 md:block">{preview}</p>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={6}
              className="max-w-sm whitespace-pre-wrap rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-xs leading-relaxed text-gray-700 shadow-md"
            >
              {fullNote}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <p className="hidden truncate text-xs text-gray-400 md:block">{preview}</p>
      )}

      <div className="flex items-center justify-end gap-1.5">
        <Link
          href={messageHref}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-50 sm:px-3"
          aria-label={`Send Nest message to ${workorder.customer_name}`}
        >
          <NestLogo className="h-[14px] w-[14px]" />
          <span className="hidden sm:inline">Send message</span>
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            disabled={dictationLocked && !isRecording}
            onClick={() => setTemplateMenuOpen((open) => !open)}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 text-xs text-gray-600 shadow-sm transition-colors hover:bg-gray-50",
              (dictationLocked && !isRecording) && "opacity-50",
            )}
            aria-label="Choose note format for this dictation"
          >
            <Notes className="h-3.5 w-3.5" />
            <span className="hidden max-w-[5.5rem] truncate sm:inline">{activeTemplateName}</span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-gray-400 transition-transform duration-200",
                templateMenuOpen && "rotate-180",
              )}
            />
          </button>

          <AnimatePresence>
            {templateMenuOpen ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg"
              >
                <div className="py-1">
                  <TemplateMenuItem
                    active={rowTemplateId === STANDARD_TEMPLATE_ID}
                    label="Standard"
                    onClick={() => {
                      setRowTemplateId(STANDARD_TEMPLATE_ID);
                      setTemplateMenuOpen(false);
                    }}
                  />
                  {templates.map((template) => (
                    <TemplateMenuItem
                      key={template.id}
                      active={rowTemplateId === template.id}
                      label={template.name}
                      onClick={() => {
                        setRowTemplateId(template.id);
                        setTemplateMenuOpen(false);
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <button
          type="button"
          disabled={dictationLocked && !isRecording}
          aria-label={
            isRecording
              ? `Stop dictation for ${workorder.customer_name}`
              : `Dictate notes for ${workorder.customer_name}`
          }
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium shadow-sm transition-colors",
            isRecording
              ? "bg-gray-900 text-white hover:bg-gray-800"
              : "border border-gray-200 bg-white text-gray-800 hover:bg-gray-50",
            dictationLocked && !isRecording && "opacity-50",
          )}
          onClick={() => {
            if (isRecording) {
              onStopRecording();
              return;
            }
            onDictate(workorder, rowTemplateId);
          }}
        >
          {isRecording ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              Recording…
            </>
          ) : (
            <>
              <Microphone className="h-3.5 w-3.5" />
              Dictate notes
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function TemplateMenuItem({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center px-3 py-2 text-left text-xs transition-colors",
        active ? "bg-gray-50 font-medium text-gray-900" : "text-gray-600 hover:bg-gray-50",
      )}
    >
      {label}
    </button>
  );
}

// ── Dictation session (record immediately → review popup on stop) ────────────

function DictationSession({
  session,
  templates,
  resolveTemplate,
  stopRecordingRef,
  onClose,
  onAppended,
  onTemplateIdChange,
}: {
  session: { workorder: Workorder; templateId: string } | null;
  templates: NoteTemplate[];
  resolveTemplate: (templateId: string) => NoteTemplate | null;
  stopRecordingRef: React.MutableRefObject<(() => void) | null>;
  onClose: () => void;
  onAppended: (workorderId: string, note: string) => void;
  onTemplateIdChange: (templateId: string) => void;
}) {
  const [step, setStep] = React.useState<DictationStep>("recording");
  const [note, setNote] = React.useState("");
  const [transcript, setTranscript] = React.useState("");
  const [initialFormattedNote, setInitialFormattedNote] = React.useState("");
  const [startedAt, setStartedAt] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [reformatting, setReformatting] = React.useState(false);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRef = React.useRef(false);
  const startedForIdRef = React.useRef<string | null>(null);

  const cleanupRecorder = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      discardRef.current = true;
      recorder.stop();
    }
    recorderRef.current = null;
  }, []);

  const template = session ? resolveTemplate(session.templateId) : null;

  const formatNote = React.useCallback(
    async (args: { audio?: Blob; mimeType?: string; transcriptText?: string; templateText: string }) => {
      const form = new FormData();
      if (args.audio && args.mimeType) {
        form.append("audio", new File([args.audio], "dictation", { type: args.mimeType }));
      }
      if (args.transcriptText) form.append("transcript", args.transcriptText);
      if (args.templateText) form.append("template", args.templateText);

      const res = await fetch("/api/workorders/dictate", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transcription failed");
      return {
        transcript: String(data.transcript ?? ""),
        note: String(data.note ?? ""),
      };
    },
    [],
  );

  const startRecording = React.useCallback(async () => {
    if (!session) return;
    setError(null);
    setStep("recording");
    setNote("");
    setTranscript("");
    setInitialFormattedNote("");
    setStartedAt(new Date().toISOString());
    setElapsedMs(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      discardRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (discardRef.current) return;

        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size === 0) {
          setError("Nothing recorded — try again");
          setStep("review");
          return;
        }

        setStep("transcribing");
        const templateText = resolveTemplate(session.templateId)?.template ?? "";
        void formatNote({ audio: blob, mimeType: type, templateText })
          .then((result) => {
            setTranscript(result.transcript);
            setInitialFormattedNote(result.note);
            setNote(result.note);
            setStep("review");
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : "Transcription failed");
            setStep("review");
          });
      };

      recorderRef.current = recorder;
      recorder.start();

      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_RECORDING_MS && recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
        }
      }, 200);
    } catch {
      setError("Microphone access is needed to dictate — check browser permissions.");
      setStep("review");
    }
  }, [formatNote, resolveTemplate, session]);

  React.useEffect(() => {
    if (!session) {
      startedForIdRef.current = null;
      cleanupRecorder();
      return;
    }

    const sessionKey = session.workorder.workorder_id;
    if (startedForIdRef.current === sessionKey) return;
    startedForIdRef.current = sessionKey;
    void startRecording();

    return cleanupRecorder;
  }, [cleanupRecorder, session, startRecording]);

  const stopRecording = React.useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") recorder.stop();
  }, []);

  React.useEffect(() => {
    stopRecordingRef.current = stopRecording;
    return () => {
      stopRecordingRef.current = null;
    };
  }, [stopRecording, stopRecordingRef]);

  const reformatWithTemplate = async (templateId: string) => {
    if (!transcript.trim()) {
      onTemplateIdChange(templateId);
      return;
    }
    onTemplateIdChange(templateId);
    setReformatting(true);
    setError(null);
    try {
      const templateText = resolveTemplate(templateId)?.template ?? "";
      const result = await formatNote({
        transcriptText: transcript,
        templateText,
      });
      setInitialFormattedNote(result.note);
      setNote(result.note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reformat note");
    } finally {
      setReformatting(false);
    }
  };

  const appendNote = async () => {
    if (!session) return;
    const text = note.trim();
    if (!text) return;
    setStep("saving");
    setError(null);
    try {
      const templateName =
        session.templateId === STANDARD_TEMPLATE_ID
          ? "Standard"
          : (templates.find((item) => item.id === session.templateId)?.name ?? "Standard");

      const res = await fetch("/api/workorders/append-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workorderId: session.workorder.workorder_id,
          text,
          dictationLog:
            transcript.trim() && initialFormattedNote.trim() && startedAt
              ? {
                  startedAt,
                  rawTranscript: transcript.trim(),
                  formattedNote: initialFormattedNote.trim(),
                  customerName: session.workorder.customer_name,
                  templateName,
                }
              : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update workorder");
      onAppended(session.workorder.workorder_id, data.note ?? text);
      setStep("saved");
      setTimeout(onClose, 1100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update workorder");
      setStep("review");
    }
  };

  if (!session) return null;

  const showPopup = step !== "recording";

  return (
    <>
      {/* Inline recording bar — no popup until stop */}
      {step === "recording" ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-6">
          <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gray-400" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gray-800" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">
                Listening to {session.workorder.customer_name}
              </p>
              <p className="text-xs text-gray-500">
                {formatElapsed(elapsedMs)}
                {template ? ` · ${template.name}` : " · Standard"}
              </p>
            </div>
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800"
            >
              <Stop className="h-4 w-4" />
              Stop
            </button>
            <button
              type="button"
              onClick={() => {
                cleanupRecorder();
                onClose();
              }}
              className="rounded-md px-2 text-xs text-gray-500 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {showPopup ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
            onClick={() => {
              if (step === "saving" || step === "transcribing") return;
              cleanupRecorder();
              onClose();
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white p-6 animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out sm:mx-4"
          >
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900">
                {session.workorder.customer_name}
              </h3>
              <p className="mt-1 text-[13px] text-gray-500">
                {step === "transcribing"
                  ? "Transcribing your notes…"
                  : step === "saved"
                    ? "Added to the workorder."
                    : "Review the note, switch format if needed, then add."}
              </p>
            </div>

            {step === "transcribing" ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <WorkordersPageSpinner label="Transcribing" />
              </div>
            ) : null}

            {step === "review" || step === "saving" ? (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-gray-500">Note format</p>
                  <div className="flex flex-wrap gap-1.5">
                    <TemplateChip
                      active={session.templateId === STANDARD_TEMPLATE_ID}
                      icon={DocumentText}
                      label="Standard"
                      onClick={() => {
                        if (step === "saving" || reformatting) return;
                        void reformatWithTemplate(STANDARD_TEMPLATE_ID);
                      }}
                    />
                    {templates.map((item, index) => {
                      const Icon = TEMPLATE_ICONS[index % TEMPLATE_ICONS.length];
                      return (
                        <TemplateChip
                          key={item.id}
                          active={session.templateId === item.id}
                          icon={Icon}
                          label={item.name}
                          onClick={() => {
                            if (step === "saving" || reformatting) return;
                            void reformatWithTemplate(item.id);
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="relative">
                  <Textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={9}
                    className="rounded-md text-sm leading-relaxed"
                    disabled={step === "saving" || reformatting}
                  />
                  {reformatting ? (
                    <div className="absolute inset-0 flex items-center justify-center rounded-md bg-white/70">
                      <WorkordersPageSpinner label="Reformatting" />
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    className="rounded-md text-gray-500"
                    disabled={step === "saving" || reformatting}
                    onClick={() => {
                      cleanupRecorder();
                      startedForIdRef.current = null;
                      void startRecording();
                    }}
                  >
                    Re-record
                  </Button>
                  <Button
                    className="rounded-md px-6"
                    onClick={() => void appendNote()}
                    disabled={step === "saving" || reformatting || !note.trim()}
                  >
                    {step === "saving" ? "Adding…" : "Add to workorder"}
                  </Button>
                </div>
              </div>
            ) : null}

            {step === "saved" ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="flex size-14 items-center justify-center rounded-md border border-gray-200 bg-gray-50">
                  <CheckIcon className="size-7 text-gray-900" />
                </div>
                <p className="text-sm text-gray-500">Note added in Lightspeed</p>
              </div>
            ) : null}

            {error ? <p className="mt-3 text-center text-[13px] text-destructive">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

// ── Templates dialog ─────────────────────────────────────────────────────────

const TEMPLATE_PLACEHOLDER = `WORK COMPLETED:
- ...

PARTS FITTED:
- ...

RECOMMENDED NEXT SERVICE:
- ...`;

function TemplatesDialog({
  open,
  templates,
  onClose,
  onChanged,
}: {
  open: boolean;
  templates: NoteTemplate[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = React.useState<NoteTemplate | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [body, setBody] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const editorOpen = creating || editing !== null;

  React.useEffect(() => {
    if (!open) {
      setEditing(null);
      setCreating(false);
      setError(null);
    }
  }, [open]);

  const startCreate = () => {
    setCreating(true);
    setEditing(null);
    setName("");
    setBody("");
    setError(null);
  };

  const startEdit = (template: NoteTemplate) => {
    setEditing(template);
    setCreating(false);
    setName(template.name);
    setBody(template.template);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/workorders/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing?.id,
          name: name.trim(),
          template: body.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setCreating(false);
      setEditing(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (template: NoteTemplate) => {
    try {
      await fetch(`/api/workorders/templates?id=${encodeURIComponent(template.id)}`, {
        method: "DELETE",
      });
      onChanged();
    } catch {
      // List refresh will show the true state.
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white p-6 animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out sm:mx-4"
      >
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Note formats</h3>
          <p className="mt-1 text-[13px] text-gray-500">
            Each staff member can save the format their dictated notes should follow.
          </p>
        </div>

        {!editorOpen ? (
          <div className="mt-4 space-y-4">
            {templates.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500">
                No formats yet — dictated notes are tidied into simple bullet points.
              </p>
            ) : (
              <div className="overflow-hidden rounded-md border border-gray-200">
                {templates.map((template, index) => (
                  <div
                    key={template.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3",
                      index > 0 && "border-t border-gray-100",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{template.name}</p>
                      <p className="truncate text-[12px] text-gray-500">
                        {template.template.split("\n").filter(Boolean)[0]}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-md text-gray-500"
                      onClick={() => startEdit(template)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-md text-gray-500"
                      onClick={() => void remove(template)}
                    >
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button className="rounded-md px-5" onClick={startCreate}>
                New format
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Format name — e.g. Tom's service notes"
              className="rounded-md"
            />
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={TEMPLATE_PLACEHOLDER}
              rows={9}
              className="rounded-md font-mono text-[13px] leading-relaxed"
            />
            {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                className="rounded-md text-gray-500"
                onClick={() => {
                  setCreating(false);
                  setEditing(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className="rounded-md px-6"
                onClick={() => void save()}
                disabled={saving || !name.trim() || !body.trim()}
              >
                {saving ? "Saving…" : "Save format"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dictation log dialog ─────────────────────────────────────────────────────

function DictationLogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [logs, setLogs] = React.useState<DictationLogEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadLogs = React.useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/workorders/dictation-logs");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load dictation logs");
      setLogs((data.logs ?? []) as DictationLogEntry[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dictation logs");
      setLogs([]);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setLogs(null);
    void loadLogs();
  }, [loadLogs, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out sm:mx-4"
      >
        <div className="shrink-0 border-b border-gray-100 px-6 py-5">
          <h3 className="text-lg font-semibold text-gray-900">Recent dictations</h3>
          <p className="mt-1 text-[13px] text-gray-500">
            Notes dictated from this page — what was said, how it was transcribed, and what was
            saved.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {logs === null ? (
            <div className="flex justify-center py-12">
              <WorkordersPageSpinner label="Loading dictation logs" />
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {logs !== null && logs.length === 0 && !error ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No dictations logged yet — entries appear here after you dictate and save a note.
            </p>
          ) : null}

          {logs !== null && logs.length > 0 ? (
            <div className="space-y-3">
              {logs.map((log) => (
                <DictationLogCard key={log.id} log={log} />
              ))}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-gray-100 px-6 py-4">
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              className="rounded-md text-gray-500"
              onClick={() => void loadLogs()}
              disabled={logs === null}
            >
              Refresh
            </Button>
            <Button className="rounded-md px-6" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DictationLogCard({ log }: { log: DictationLogEntry }) {
  const savedDiffers =
    log.saved_note.trim() !== log.formatted_note.trim() &&
    log.saved_note.trim().length > 0;

  return (
    <article className="rounded-md border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {log.customer_name || "Unknown customer"}
            <span className="ml-1.5 font-normal text-gray-400">#{log.workorder_id}</span>
          </p>
          <p className="mt-0.5 text-[12px] text-gray-500">
            {formatLogTimestamp(log.started_at)}
            {log.template_name ? ` · ${log.template_name}` : " · Standard"}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <DictationLogSection label="What they said" text={log.raw_transcript} />
        <DictationLogSection label="Transcribed to" text={log.formatted_note} />
        {savedDiffers ? (
          <DictationLogSection label="Saved to workorder" text={log.saved_note} />
        ) : null}
      </div>
    </article>
  );
}

function DictationLogSection({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50/80 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">{text}</p>
    </div>
  );
}
