"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Loader2, Sparkles, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Lesson {
  id: string;
  scope: string;
  kind: "avoid" | "prefer";
  lesson: string;
  evidence: string | null;
  source: string;
  reinforced_count: number;
  active: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  error_recovery: "Recovered from an error",
  recheck: "Self-corrected mid-run",
  verification: "Quality check",
  user_feedback: "Your 👍 / 👎",
  reflection: "Reflection",
};

export function GenieLessonsButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="What Genie has learned"
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:border-gray-300 hover:text-gray-900"
      >
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="hidden sm:inline">Learned</span>
      </button>
      {open ? <GenieLessonsModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function GenieLessonsModal({ onClose }: { onClose: () => void }) {
  const [lessons, setLessons] = React.useState<Lesson[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/genie/lessons");
        const data = (await res.json()) as { lessons?: Lesson[] };
        if (!cancelled) setLessons(Array.isArray(data.lessons) ? data.lessons : []);
      } catch {
        if (!cancelled) setLessons([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = async (lesson: Lesson) => {
    const nextActive = !lesson.active;
    setLessons((prev) => prev?.map((item) => (item.id === lesson.id ? { ...item, active: nextActive } : item)) ?? prev);
    try {
      await fetch("/api/genie/lessons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lesson.id, active: nextActive }),
      });
    } catch {
      // Revert on failure.
      setLessons((prev) => prev?.map((item) => (item.id === lesson.id ? { ...item, active: lesson.active } : item)) ?? prev);
    }
  };

  const remove = async (lesson: Lesson) => {
    setLessons((prev) => prev?.filter((item) => item.id !== lesson.id) ?? prev);
    try {
      await fetch("/api/genie/lessons", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lesson.id }),
      });
    } catch {
      // Best-effort; a failed delete simply reappears on next open.
    }
  };

  if (typeof document === "undefined") return null;

  const activeCount = lessons?.filter((lesson) => lesson.active).length ?? 0;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/20 animate-in fade-in"
      />
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl animate-in fade-in zoom-in-95">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">What Genie has learned</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Lessons Genie picks up from its own runs and your 👍/👎. Toggle one off to stop applying it, or delete it.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {lessons === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : lessons.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-gray-700">Nothing learned yet</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500">
                As you use Genie, it captures fixes for mistakes it recovers from and patterns you reward with 👍 — and applies them automatically next time.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                {activeCount} active · {lessons.length} total
              </p>
              {lessons.map((lesson) => (
                <div
                  key={lesson.id}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 transition-opacity",
                    lesson.active ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-60",
                  )}
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        lesson.kind === "prefer" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700",
                      )}
                    >
                      {lesson.kind === "prefer" ? "Prefer" : "Avoid"}
                    </span>
                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                      {lesson.scope}
                    </span>
                    {lesson.reinforced_count > 1 ? (
                      <span className="text-[10px] text-gray-400">×{lesson.reinforced_count}</span>
                    ) : null}
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggle(lesson)}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                          lesson.active
                            ? "bg-primary/10 text-primary hover:bg-primary/20"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200",
                        )}
                      >
                        {lesson.active ? "On" : "Off"}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(lesson)}
                        aria-label="Delete lesson"
                        className="rounded-md p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[13px] leading-snug text-gray-800">{lesson.lesson}</p>
                  {lesson.evidence ? (
                    <p className="mt-0.5 text-[11px] text-gray-400">{lesson.evidence}</p>
                  ) : null}
                  <p className="mt-1 text-[10px] text-gray-300">{SOURCE_LABELS[lesson.source] ?? lesson.source}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
