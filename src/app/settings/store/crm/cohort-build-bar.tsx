"use client";

// Natural-language cohort search / create bar for the Groups page.
// Type a cohort → preview exact member count → create smart group.

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Search, X } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AudienceRule } from "@/lib/crm/agent/types";

export type CohortPreview = {
  name: string;
  description: string;
  reason: string;
  rules: AudienceRule[];
  count: number;
  sample: Array<{
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  }>;
  source: "shortcut" | "ai";
  clarification?: string | null;
};

const COHORT_SUGGESTIONS = [
  "People who open my emails",
  "VIP customers",
  "Lapsed in the last 6 months",
  "New customers this quarter",
  "Bought Muc-Off",
  "Haven't had a service recently",
] as const;

const DROPDOWN_TRANSITION = {
  duration: 0.4,
  ease: [0.04, 0.62, 0.23, 0.98] as const,
};

export function CohortBuildBar(props: {
  disabled?: boolean;
  filterQuery?: string;
  onFilterQueryChange?: (query: string) => void;
  onCreated: (result: { name: string; count: number }) => void;
  onError: (message: string) => void;
}) {
  const { disabled, filterQuery, onFilterQueryChange, onCreated, onError } = props;

  const [query, setQuery] = React.useState(filterQuery ?? "");
  const [previewing, setPreviewing] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [preview, setPreview] = React.useState<CohortPreview | null>(null);
  const [focused, setFocused] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const trimmed = query.trim();
  const showSuggestions = focused && !preview && !previewing && trimmed.length === 0;

  const clearPreview = React.useCallback(() => {
    setPreview(null);
  }, []);

  const updateQuery = (value: string) => {
    setQuery(value);
    onFilterQueryChange?.(value);
    setPreview(null);
  };

  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const runPreview = async (promptOverride?: string) => {
    const prompt = (promptOverride ?? query).trim();
    if (!prompt || previewing || creating || disabled) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    updateQuery(prompt);
    setPreviewing(true);
    setPreview(null);

    try {
      const res = await fetch("/api/store/crm/groups/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to build that cohort");
      }
      if (data.status !== "preview" || !data.preview) {
        throw new Error("Unexpected response from cohort builder");
      }
      setPreview(data.preview as CohortPreview);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      onError(error instanceof Error ? error.message : "Failed to build that cohort");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setPreviewing(false);
    }
  };

  const confirmCreate = async () => {
    if (!preview || creating || disabled) return;
    setCreating(true);
    try {
      const res = await fetch("/api/store/crm/groups/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          preview: {
            name: preview.name,
            description: preview.description,
            reason: preview.reason,
            rules: preview.rules,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to create group");
      }
      if (data.status !== "created") {
        throw new Error("Unexpected response while creating group");
      }
      setPreview(null);
      updateQuery("");
      onCreated({ name: String(data.name), count: Number(data.count) || 0 });
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to create group");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      {/* Search row */}
      <div
        className={cn(
          "flex h-10 items-center gap-2 rounded-md border bg-white px-3 transition-colors",
          focused ? "border-border" : "border-border/60",
        )}
      >
        {previewing ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Search className="size-4 shrink-0 text-muted-foreground" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled || previewing || creating}
          onChange={(event) => updateQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            window.setTimeout(() => setFocused(false), 150);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void runPreview();
            }
            if (event.key === "Escape") {
              if (preview) clearPreview();
              else {
                updateQuery("");
                inputRef.current?.blur();
              }
            }
          }}
          placeholder="Search groups or describe a cohort…"
          aria-label="Search groups or build a customer cohort"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              updateQuery("");
              clearPreview();
              inputRef.current?.focus();
            }}
            disabled={previewing || creating}
            className="rounded-md p-1 text-muted-foreground hover:bg-gray-100 hover:text-foreground disabled:opacity-40"
            aria-label="Clear"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
        <Button
          size="sm"
          onClick={() => void runPreview()}
          disabled={disabled || previewing || creating || !trimmed}
          className="h-7 shrink-0 rounded-full px-2.5"
        >
          {previewing ? <Loader2 className="size-3.5 animate-spin" /> : "Build"}
        </Button>
      </div>

      {/* Quiet suggestions */}
      <AnimatePresence initial={false}>
        {showSuggestions ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={DROPDOWN_TRANSITION}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5 px-0.5 pb-0.5">
              {COHORT_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void runPreview(suggestion)}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-gray-100 hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Building status */}
      <AnimatePresence initial={false}>
        {previewing ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-0.5 text-sm text-muted-foreground"
          >
            Building cohort…
          </motion.p>
        ) : null}
      </AnimatePresence>

      {/* Preview — one quiet strip, no nested card */}
      <AnimatePresence initial={false}>
        {preview ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={DROPDOWN_TRANSITION}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 rounded-md bg-gray-50 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{preview.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  <span className="tabular-nums text-foreground">
                    {preview.count.toLocaleString()}
                  </span>
                  {" members"}
                  {preview.description ? (
                    <>
                      <span className="mx-1.5 text-border">·</span>
                      <span className="line-clamp-1">{preview.description}</span>
                    </>
                  ) : null}
                </p>
                {preview.clarification ? (
                  <p className="mt-1 text-xs text-muted-foreground">{preview.clarification}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearPreview}
                  disabled={creating}
                  className="h-8 rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => void confirmCreate()}
                  disabled={creating}
                  className="h-8 rounded-full"
                >
                  {creating ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                  Create group
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
