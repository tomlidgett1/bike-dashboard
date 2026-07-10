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
import { PageBody, PageContainer, PageHeader } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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

// ── Icons (inline so they match the Apple-simple look) ──────────────────────

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

// ── Page ─────────────────────────────────────────────────────────────────────

export function WorkordersPageContent() {
  const [workorders, setWorkorders] = React.useState<Workorder[] | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);
  const [templates, setTemplates] = React.useState<NoteTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string>("none");
  const [manageOpen, setManageOpen] = React.useState(false);
  const [dictating, setDictating] = React.useState<Workorder | null>(null);

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

  const handleNoteAppended = (workorderId: string, note: string) => {
    setWorkorders((prev) =>
      prev
        ? prev.map((workorder) =>
            workorder.workorder_id === workorderId ? { ...workorder, note } : workorder,
          )
        : prev,
    );
  };

  return (
    <PageContainer size="narrow">
      <PageHeader
        title="Workorders"
        description="Open jobs waiting for payment. Tap the mic and say what you've done to the bike."
        actions={
          <div className="flex items-center gap-2">
            <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
              <SelectTrigger className="h-9 w-44 rounded-full bg-white text-sm">
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
            <Button
              variant="outline"
              className="h-9 rounded-full bg-white text-sm font-normal"
              onClick={() => setManageOpen(true)}
            >
              Formats
            </Button>
          </div>
        }
      />

      <PageBody>
        {listError ? (
          <div className="rounded-2xl border border-border bg-white p-6 text-sm text-muted-foreground">
            {listError}
            <Button variant="outline" size="sm" className="ml-3 rounded-full" onClick={() => { setWorkorders(null); loadWorkorders(); }}>
              Retry
            </Button>
          </div>
        ) : null}

        {workorders === null ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-[72px] w-full rounded-2xl" />
            ))}
          </div>
        ) : workorders.length === 0 && !listError ? (
          <div className="rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-foreground">
            No open workorders waiting for payment. Nice one.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-white">
            {workorders.map((workorder, index) => (
              <WorkorderRow
                key={workorder.workorder_id}
                workorder={workorder}
                first={index === 0}
                onDictate={() => setDictating(workorder)}
              />
            ))}
          </div>
        )}
      </PageBody>

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
    </PageContainer>
  );
}

// ── Workorder row ────────────────────────────────────────────────────────────

function WorkorderRow({
  workorder,
  first,
  onDictate,
}: {
  workorder: Workorder;
  first: boolean;
  onDictate: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const due = formatDay(workorder.eta_out);
  const meta = [`#${workorder.workorder_id}`, workorder.status_name, due ? `Due ${due}` : null]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div className={cn("group", !first && "border-t border-border/70")}>
      <div
        className="flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40"
        onClick={() => setExpanded((value) => !value)}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-foreground">
            {workorder.customer_name}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{meta}</p>
          {!expanded && workorder.note ? (
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground/70">
              {workorder.note.split("\n").filter(Boolean).slice(-1)[0]}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={`Dictate notes for ${workorder.customer_name}`}
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-white text-foreground/70 shadow-sm transition-all hover:scale-105 hover:text-foreground active:scale-95"
          onClick={(event) => {
            event.stopPropagation();
            onDictate();
          }}
        >
          <MicIcon className="size-5" />
        </button>
      </div>
      {expanded && workorder.note ? (
        <div className="border-t border-border/50 bg-muted/30 px-5 py-3">
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
            {workorder.note}
          </p>
        </div>
      ) : null}
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

  // Reset whenever a new workorder opens the dialog.
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

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      cleanupRecorder();
      onClose();
    }
  };

  return (
    <Dialog open={workorder !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md rounded-3xl p-8">
        <DialogHeader>
          <DialogTitle className="text-center text-lg font-semibold">
            {workorder?.customer_name}
          </DialogTitle>
          <DialogDescription className="text-center text-[13px]">
            {step === "review" || step === "saving"
              ? template
                ? `Formatted with “${template.name}” — review, then add.`
                : "Review the note, then add it to the workorder."
              : step === "saved"
                ? "Added to the workorder."
                : `Workorder #${workorder?.workorder_id}${template ? `  ·  ${template.name}` : ""}`}
          </DialogDescription>
        </DialogHeader>

        {step === "idle" || step === "recording" ? (
          <div className="flex flex-col items-center gap-5 py-4">
            <button
              type="button"
              onClick={step === "recording" ? stopRecording : startRecording}
              aria-label={step === "recording" ? "Stop recording" : "Start recording"}
              className={cn(
                "relative flex size-24 items-center justify-center rounded-full shadow-lg transition-all active:scale-95",
                step === "recording"
                  ? "bg-foreground text-background"
                  : "bg-foreground text-background hover:scale-105",
              )}
            >
              {step === "recording" ? (
                <>
                  <span className="absolute inset-0 animate-ping rounded-full bg-foreground/20" />
                  <StopIcon className="size-9" />
                </>
              ) : (
                <MicIcon className="size-10" />
              )}
            </button>
            <p className="text-sm text-muted-foreground">
              {step === "recording"
                ? `Listening…  ${formatElapsed(elapsedMs)}`
                : "Tap and say what you've done to the bike"}
            </p>
          </div>
        ) : null}

        {step === "transcribing" ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="size-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
            <p className="text-sm text-muted-foreground">Transcribing…</p>
          </div>
        ) : null}

        {step === "review" || step === "saving" ? (
          <div className="space-y-4">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={9}
              className="rounded-2xl text-sm leading-relaxed"
              disabled={step === "saving"}
            />
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                className="rounded-full text-muted-foreground"
                disabled={step === "saving"}
                onClick={() => {
                  setNote("");
                  setStep("idle");
                }}
              >
                Re-record
              </Button>
              <Button
                className="rounded-full px-6"
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
            <div className="flex size-14 items-center justify-center rounded-full bg-muted">
              <CheckIcon className="size-7 text-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Note added in Lightspeed</p>
          </div>
        ) : null}

        {error ? (
          <p className="text-center text-[13px] text-destructive">{error}</p>
        ) : null}
      </DialogContent>
    </Dialog>
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

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-lg rounded-3xl p-8">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Note formats</DialogTitle>
          <DialogDescription className="text-[13px]">
            Each staff member can save the format their dictated notes should follow.
          </DialogDescription>
        </DialogHeader>

        {!editorOpen ? (
          <div className="space-y-4">
            {templates.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No formats yet — dictated notes are tidied into simple bullet points.
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border">
                {templates.map((template, index) => (
                  <div
                    key={template.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3",
                      index > 0 && "border-t border-border/70",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{template.name}</p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {template.template.split("\n").filter(Boolean)[0]}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full text-muted-foreground"
                      onClick={() => startEdit(template)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full text-muted-foreground"
                      onClick={() => remove(template)}
                    >
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button className="rounded-full px-5" onClick={startCreate}>
                New format
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Format name — e.g. Tom's service notes"
              className="rounded-xl"
            />
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={TEMPLATE_PLACEHOLDER}
              rows={9}
              className="rounded-2xl font-mono text-[13px] leading-relaxed"
            />
            {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                className="rounded-full text-muted-foreground"
                onClick={() => {
                  setCreating(false);
                  setEditing(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className="rounded-full px-6"
                onClick={save}
                disabled={saving || !name.trim() || !body.trim()}
              >
                {saving ? "Saving…" : "Save format"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
