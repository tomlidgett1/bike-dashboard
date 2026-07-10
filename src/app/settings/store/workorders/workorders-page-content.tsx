"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Workorders — open jobs waiting for payment, with voice dictation.
//
// A mechanic picks a job, holds the phone/laptop mic, and says what they did
// to the bike. The recording is transcribed (gpt-4o-transcribe, bike-shop
// vocabulary), reshaped to the selected note template, shown for a quick
// review, then APPENDED to the bottom of the customer note on the Lightspeed
// workorder.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import {
  AlertCircle,
  ChevronLeft,
  Search,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { floatingCardPageHeaderNudgeClass } from "@/lib/layout/floating-card-page";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type Workorder = {
  workorder_id: string;
  status_name: string;
  customer_name: string;
  note: string;
  time_in: string;
  eta_out: string;
  items_subtotal: number | null;
  lines: Array<{ line_id: string; note: string; done: boolean }>;
};

type NoteTemplate = {
  id: string;
  name: string;
  template: string;
  created_at: string;
};

type DictationStep = "idle" | "recording" | "transcribing" | "review" | "saving" | "saved";

const SELECTED_TEMPLATE_KEY = "workorders.selectedTemplateId";
const MAX_RECORDING_MS = 3 * 60 * 1000;

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

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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

// ── Icons ────────────────────────────────────────────────────────────────────

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
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

function WorkordersPageSpinner({ label = "Loading workorders" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500"
    />
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function WorkordersPageContent() {
  const [workorders, setWorkorders] = React.useState<Workorder[] | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);
  const [templates, setTemplates] = React.useState<NoteTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string>("none");
  const [manageOpen, setManageOpen] = React.useState(false);
  const [dictating, setDictating] = React.useState<Workorder | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");

  const loadWorkorders = React.useCallback(async () => {
    setListError(null);
    try {
      const res = await fetch("/api/workorders/open");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load workorders");
      setWorkorders(data.workorders ?? []);
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
    loadWorkorders();
    loadTemplates();
    const stored = window.localStorage.getItem(SELECTED_TEMPLATE_KEY);
    if (stored) setSelectedTemplateId(stored);
  }, [loadWorkorders, loadTemplates]);

  const handleTemplateChange = (value: string) => {
    setSelectedTemplateId(value);
    window.localStorage.setItem(SELECTED_TEMPLATE_KEY, value);
  };

  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ?? null;

  const filteredWorkorders = React.useMemo(
    () => filterWorkorders(workorders ?? [], searchQuery),
    [workorders, searchQuery],
  );

  const selectedWorkorder =
    workorders?.find((workorder) => workorder.workorder_id === selectedId) ?? null;

  React.useEffect(() => {
    if (selectedId && workorders && !workorders.some((w) => w.workorder_id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, workorders]);

  const handleNoteAppended = (workorderId: string, note: string) => {
    setWorkorders((prev) =>
      prev
        ? prev.map((workorder) =>
            workorder.workorder_id === workorderId ? { ...workorder, note } : workorder,
          )
        : prev,
    );
  };

  const showPane = Boolean(selectedWorkorder);

  return (
    <>
      <FloatingCardPageHeader>
        <StoreSettingsPageHeader
          title="Workorders"
          icon={Wrench}
          hideCompose
          className={cn(floatingCardPageHeaderNudgeClass, "!static !pb-0")}
        />
      </FloatingCardPageHeader>

      <FloatingCardPageBody>
        <FloatingCard>
          <WorkordersFilterBar
            selectedTemplateId={selectedTemplateId}
            templates={templates}
            onTemplateChange={handleTemplateChange}
            onOpenFormats={() => setManageOpen(true)}
          />

          <div className="flex min-h-0 flex-1">
            <div
              className={cn(
                "flex min-h-0 w-full min-w-0 flex-col md:flex md:w-[340px] md:shrink-0 md:border-r md:border-border/60 lg:w-[380px]",
                showPane ? "hidden" : "flex",
              )}
            >
              <div className="shrink-0 border-b border-gray-100 px-3 py-2.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <Input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search customer, job number…"
                    className="h-8 rounded-full border-gray-200 bg-white pl-8 text-sm shadow-sm"
                  />
                </div>
              </div>

              <WorkorderList
                workorders={filteredWorkorders}
                loading={workorders === null}
                error={listError}
                searchActive={searchQuery.trim().length > 0}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onRetry={() => {
                  setWorkorders(null);
                  void loadWorkorders();
                }}
              />
            </div>

            <div className={cn("min-w-0 flex-1 flex-col md:flex", showPane ? "flex" : "hidden")}>
              {selectedWorkorder ? (
                <WorkorderDetailPane
                  workorder={selectedWorkorder}
                  onBack={() => setSelectedId(null)}
                  onDictate={() => setDictating(selectedWorkorder)}
                />
              ) : (
                <WorkorderEmptyPane />
              )}
            </div>
          </div>
        </FloatingCard>
      </FloatingCardPageBody>

      <DictationDialog
        workorder={dictating}
        template={selectedTemplate}
        onClose={() => setDictating(null)}
        onAppended={handleNoteAppended}
      />

      <TemplatesDialog
        open={manageOpen}
        templates={templates}
        onClose={() => setManageOpen(false)}
        onChanged={loadTemplates}
      />
    </>
  );
}

// ── Filter bar ───────────────────────────────────────────────────────────────

function WorkordersFilterBar({
  selectedTemplateId,
  templates,
  onTemplateChange,
  onOpenFormats,
}: {
  selectedTemplateId: string;
  templates: NoteTemplate[];
  onTemplateChange: (value: string) => void;
  onOpenFormats: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2.5 rounded-t-xl border-b border-border/60 bg-gray-50 px-4 py-3 md:px-5">
      <Select value={selectedTemplateId} onValueChange={onTemplateChange}>
        <SelectTrigger className={cn(storeSettingsHeaderActionClass(), "h-auto w-auto min-w-[9rem] px-3.5 py-1.5")}>
          <SelectValue placeholder="Note format" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No format</SelectItem>
          {templates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button type="button" className={storeSettingsHeaderActionClass()} onClick={onOpenFormats}>
        Formats
      </button>
      <p className="ml-auto hidden text-xs text-gray-500 md:block">
        Open jobs waiting for payment — tap the mic and say what you&apos;ve done to the bike.
      </p>
    </div>
  );
}

// ── List ─────────────────────────────────────────────────────────────────────

function WorkorderList({
  workorders,
  loading,
  error,
  searchActive,
  selectedId,
  onSelect,
  onRetry,
}: {
  workorders: Workorder[];
  loading: boolean;
  error: string | null;
  searchActive: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <WorkordersPageSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-3 mt-4 rounded-md border border-gray-200 bg-white p-4">
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
        <p className="mt-1 max-w-[240px] text-xs text-gray-500">
          {searchActive
            ? "Try a different customer name or job number."
            : "Nice one — nothing is waiting on payment right now."}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto overscroll-contain">
      {workorders.map((workorder) => (
        <WorkorderListRow
          key={workorder.workorder_id}
          workorder={workorder}
          selected={selectedId === workorder.workorder_id}
          onSelect={() => onSelect(workorder.workorder_id)}
        />
      ))}
    </div>
  );
}

function WorkorderListRow({
  workorder,
  selected,
  onSelect,
}: {
  workorder: Workorder;
  selected: boolean;
  onSelect: () => void;
}) {
  const due = formatDay(workorder.eta_out);
  const preview = workorder.note.split("\n").filter(Boolean).slice(-1)[0] ?? "No notes yet";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
        selected ? "bg-gray-100" : "hover:bg-gray-50",
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white">
        <Wrench className="h-4 w-4 text-gray-500" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
            {workorder.customer_name}
          </p>
          <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
            #{workorder.workorder_id}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500">
          {workorder.status_name}
          {due ? ` · Due ${due}` : ""}
        </p>
        <p className="mt-0.5 truncate text-xs text-gray-400">{preview}</p>
      </div>
    </button>
  );
}

// ── Detail pane ──────────────────────────────────────────────────────────────

function WorkorderEmptyPane() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-md border border-gray-200 bg-white">
        <Wrench className="h-5 w-5 text-gray-400" />
      </span>
      <p className="mt-4 text-sm font-medium text-gray-900">Select a workorder</p>
      <p className="mt-1 max-w-xs text-sm text-gray-500">
        Choose a job on the left to view notes and dictate what you&apos;ve done to the bike.
      </p>
    </div>
  );
}

function WorkorderDetailPane({
  workorder,
  onBack,
  onDictate,
}: {
  workorder: Workorder;
  onBack: () => void;
  onDictate: () => void;
}) {
  const due = formatDay(workorder.eta_out);
  const meta = [workorder.status_name, due ? `Due ${due}` : null].filter(Boolean).join(" · ");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-3 md:px-5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50 md:hidden"
          aria-label="Back to workorders"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-gray-900">{workorder.customer_name}</h2>
          <p className="truncate text-xs text-gray-500">
            #{workorder.workorder_id}
            {meta ? ` · ${meta}` : ""}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Dictate notes for ${workorder.customer_name}`}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-50"
          onClick={onDictate}
        >
          <MicIcon className="size-4" />
          Dictate
        </button>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white px-5 py-5"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {workorder.lines.length > 0 ? (
          <div className="mb-5 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Line items</p>
            <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
              {workorder.lines.map((line, index) => (
                <div
                  key={line.line_id}
                  className={cn(
                    "flex items-start gap-2 px-3 py-2.5 text-sm text-gray-700",
                    index > 0 && "border-t border-gray-100",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-md border text-[10px] font-medium",
                      line.done
                        ? "border-gray-300 bg-gray-100 text-gray-700"
                        : "border-gray-200 bg-white text-gray-400",
                    )}
                  >
                    {line.done ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">{line.note || "Untitled line"}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Customer note</p>
          {workorder.note.trim() ? (
            <div className="rounded-md border border-gray-200 bg-white p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                {workorder.note}
              </p>
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
              No notes on this workorder yet — tap Dictate to add what you&apos;ve done.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Dictation dialog ─────────────────────────────────────────────────────────

function DictationDialog({
  workorder,
  template,
  onClose,
  onAppended,
}: {
  workorder: Workorder | null;
  template: NoteTemplate | null;
  onClose: () => void;
  onAppended: (workorderId: string, note: string) => void;
}) {
  const [step, setStep] = React.useState<DictationStep>("idle");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = React.useState(0);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRef = React.useRef(false);

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

  React.useEffect(() => {
    if (workorder) {
      setStep("idle");
      setNote("");
      setError(null);
      setElapsedMs(0);
      discardRef.current = false;
    }
    return cleanupRecorder;
  }, [workorder, cleanupRecorder]);

  const transcribe = React.useCallback(
    async (blob: Blob, mimeType: string) => {
      setStep("transcribing");
      try {
        const form = new FormData();
        form.append("audio", new File([blob], "dictation", { type: mimeType }));
        if (template) form.append("template", template.template);

        const res = await fetch("/api/workorders/dictate", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Transcription failed");
        setNote(data.note ?? "");
        setStep("review");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transcription failed");
        setStep("idle");
      }
    },
    [template],
  );

  const startRecording = async () => {
    setError(null);
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
          setStep("idle");
          return;
        }
        transcribe(blob, type);
      };

      recorderRef.current = recorder;
      recorder.start();
      setStep("recording");

      const startedAt = Date.now();
      setElapsedMs(0);
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_RECORDING_MS && recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
        }
      }, 200);
    } catch {
      setError("Microphone access is needed to dictate — check browser permissions.");
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") recorder.stop();
  };

  const appendNote = async () => {
    if (!workorder) return;
    const text = note.trim();
    if (!text) return;
    setStep("saving");
    setError(null);
    try {
      const res = await fetch("/api/workorders/append-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workorderId: workorder.workorder_id, text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update workorder");
      onAppended(workorder.workorder_id, data.note ?? text);
      setStep("saved");
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update workorder");
      setStep("review");
    }
  };

  if (!workorder) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
        onClick={() => {
          if (step === "saving") return;
          cleanupRecorder();
          onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-md border border-gray-200 bg-white p-6 animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out sm:mx-4"
      >
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900">{workorder.customer_name}</h3>
          <p className="mt-1 text-[13px] text-gray-500">
            {step === "review" || step === "saving"
              ? template
                ? `Formatted with “${template.name}” — review, then add.`
                : "Review the note, then add it to the workorder."
              : step === "saved"
                ? "Added to the workorder."
                : `Workorder #${workorder.workorder_id}${template ? ` · ${template.name}` : ""}`}
          </p>
        </div>

        {step === "idle" || step === "recording" ? (
          <div className="flex flex-col items-center gap-5 py-4">
            <button
              type="button"
              onClick={step === "recording" ? stopRecording : startRecording}
              aria-label={step === "recording" ? "Stop recording" : "Start recording"}
              className={cn(
                "relative flex size-24 items-center justify-center rounded-full shadow-lg transition-all active:scale-95",
                "bg-gray-900 text-white hover:scale-105",
              )}
            >
              {step === "recording" ? (
                <>
                  <span className="absolute inset-0 animate-ping rounded-full bg-gray-900/20" />
                  <StopIcon className="size-9" />
                </>
              ) : (
                <MicIcon className="size-10" />
              )}
            </button>
            <p className="text-sm text-gray-500">
              {step === "recording"
                ? `Listening… ${formatElapsed(elapsedMs)}`
                : "Tap and say what you've done to the bike"}
            </p>
          </div>
        ) : null}

        {step === "transcribing" ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <WorkordersPageSpinner label="Transcribing" />
            <p className="text-sm text-gray-500">Transcribing…</p>
          </div>
        ) : null}

        {step === "review" || step === "saving" ? (
          <div className="mt-4 space-y-4">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={9}
              className="rounded-md text-sm leading-relaxed"
              disabled={step === "saving"}
            />
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                className="rounded-md text-gray-500"
                disabled={step === "saving"}
                onClick={() => {
                  setNote("");
                  setStep("idle");
                }}
              >
                Re-record
              </Button>
              <Button
                className="rounded-md px-6"
                onClick={appendNote}
                disabled={step === "saving" || !note.trim()}
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
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-md border border-gray-200 bg-white p-6 animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out sm:mx-4"
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
                      onClick={() => remove(template)}
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
                onClick={save}
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
