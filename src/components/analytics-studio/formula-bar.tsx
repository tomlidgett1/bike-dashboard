"use client";

import * as React from "react";
import { Undo2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AnalyticsSource } from "@/lib/analytics-studio/catalog";
import {
  applyFormulaSuggestion,
  formulaSuggestions,
  type FormulaSuggestion,
} from "@/lib/analytics-studio/formula";

const COLUMN_REF_RE = /(\[[^\]]*\]|\*)/g;

function isKnownColumnRef(raw: string, source?: AnalyticsSource): boolean {
  if (raw === "*") return true;
  const inner = raw.replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return false;
  if (!source) return true;
  const needle = inner.toLowerCase();
  return source.columns.some(
    (column) =>
      column.label.toLowerCase() === needle || column.key.toLowerCase() === needle,
  );
}

/** Mirror layer: column refs in blue when they match the source catalog. */
function FormulaHighlightText({
  value,
  source,
}: {
  value: string;
  source?: AnalyticsSource;
}) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  COLUMN_REF_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = COLUMN_REF_RE.exec(value)) !== null) {
    if (match.index > last) {
      nodes.push(
        <span key={key++} className="text-gray-800">
          {value.slice(last, match.index)}
        </span>,
      );
    }
    const token = match[0]!;
    const known = isKnownColumnRef(token, source);
    nodes.push(
      <span
        key={key++}
        className={known ? "text-blue-600" : "text-red-500"}
      >
        {token}
      </span>,
    );
    last = match.index + token.length;
  }
  if (last < value.length) {
    nodes.push(
      <span key={key++} className="text-gray-800">
        {value.slice(last)}
      </span>,
    );
  }
  return <>{nodes}</>;
}

export function FormulaBar({
  value,
  onChange,
  onCommit,
  onCancel,
  source,
  disabled,
  placeholder,
  error,
  leading,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  source?: AnalyticsSource;
  disabled?: boolean;
  placeholder?: string;
  error?: string | null;
  /** Quick actions rendered to the left of the fx label. */
  leading?: React.ReactNode;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const highlightRef = React.useRef<HTMLDivElement>(null);
  const [caret, setCaret] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);

  const suggestions = React.useMemo(
    () => (disabled ? [] : formulaSuggestions(value, caret, source)),
    [value, caret, source, disabled],
  );

  React.useEffect(() => {
    setHighlight(0);
  }, [suggestions]);

  const syncCaret = () => {
    const el = inputRef.current;
    if (!el) return;
    setCaret(el.selectionStart ?? el.value.length);
  };

  const syncHighlightScroll = () => {
    const input = inputRef.current;
    const mirror = highlightRef.current;
    if (!input || !mirror) return;
    mirror.scrollLeft = input.scrollLeft;
  };

  const applySuggestion = (suggestion: FormulaSuggestion) => {
    const next = applyFormulaSuggestion(value, caret, suggestion);
    onChange(next.text);
    setOpen(true);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
      syncHighlightScroll();
    });
  };

  return (
    <div
      data-analytics-formula-bar
      className="shrink-0 border-b border-gray-200 bg-white px-3 py-1.5"
    >
      <div className="flex items-center gap-2">
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="h-7 w-7 text-gray-500 hover:text-gray-800 disabled:opacity-30"
            title="Undo (⌘Z)"
            aria-label="Undo"
            disabled={!canUndo || !onUndo}
            onClick={() => onUndo?.()}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="h-7 w-7 text-gray-500 hover:text-gray-800 disabled:opacity-30"
            title="Redo (⇧⌘Z)"
            aria-label="Redo"
            disabled={!canRedo || !onRedo}
            onClick={() => onRedo?.()}
          >
            <Undo2 className="h-3.5 w-3.5 scale-x-[-1]" />
          </Button>
        </div>
        {leading ? <div className="flex shrink-0 items-center gap-1.5">{leading}</div> : null}
        <span className="select-none px-1 font-serif text-sm italic text-gray-400">fx</span>
        <div className="relative min-w-0 flex-1">
          {value ? (
            <div
              ref={highlightRef}
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 overflow-hidden rounded-md px-2.5 font-mono text-xs",
                "flex items-center whitespace-pre",
                disabled ? "bg-gray-50" : "bg-white",
              )}
            >
              <FormulaHighlightText value={value} source={source} />
            </div>
          ) : null}
          <input
            ref={inputRef}
            type="text"
            value={value}
            disabled={disabled}
            placeholder={placeholder ?? "Sum([Column])"}
            spellCheck={false}
            onChange={(event) => {
              onChange(event.target.value);
              setOpen(true);
              setCaret(event.target.selectionStart ?? event.target.value.length);
              requestAnimationFrame(syncHighlightScroll);
            }}
            onClick={syncCaret}
            onKeyUp={syncCaret}
            onSelect={syncCaret}
            onScroll={syncHighlightScroll}
            onFocus={() => {
              syncCaret();
              setOpen(true);
            }}
            onBlur={() => {
              // Allow suggestion click before closing.
              window.setTimeout(() => setOpen(false), 120);
            }}
            onKeyDown={(event) => {
              if (disabled) return;
              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
                onCancel();
                return;
              }
              if (open && suggestions.length > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setHighlight((index) => (index + 1) % suggestions.length);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setHighlight(
                    (index) => (index - 1 + suggestions.length) % suggestions.length,
                  );
                  return;
                }
                if (event.key === "Tab" || (event.key === "Enter" && !event.metaKey && !event.ctrlKey)) {
                  // Tab always accepts suggestion; Enter accepts if menu open,
                  // otherwise commits (handled below when menu closed).
                  if (event.key === "Tab" || suggestions.length > 0) {
                    const suggestion = suggestions[highlight];
                    if (suggestion && (event.key === "Tab" || open)) {
                      // Enter with open menu: if the text already looks complete,
                      // prefer commit. Heuristic: ends with ')' → commit.
                      if (event.key === "Enter" && value.trim().endsWith(")")) {
                        event.preventDefault();
                        setOpen(false);
                        onCommit();
                        return;
                      }
                      if (event.key === "Tab" || event.key === "Enter") {
                        event.preventDefault();
                        applySuggestion(suggestion);
                        return;
                      }
                    }
                  }
                }
              }
              if (event.key === "Enter") {
                event.preventDefault();
                setOpen(false);
                onCommit();
              }
            }}
            className={cn(
              "relative z-[1] h-8 w-full rounded-md border border-gray-200 px-2.5 font-mono text-xs outline-none",
              "placeholder:text-gray-400 focus:border-gray-300 focus:ring-0 caret-gray-800",
              "selection:bg-blue-100",
              value
                ? "bg-transparent text-transparent selection:text-transparent"
                : "bg-white text-gray-800",
              disabled && "cursor-not-allowed bg-gray-50",
              disabled && !value && "text-gray-400",
              error && "border-red-300 focus:border-red-400",
            )}
          />
          {open && !disabled && suggestions.length > 0 ? (
            <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-56 overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-md animate-in fade-in slide-in-from-top-1 zoom-in-95 duration-200">
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.kind}-${suggestion.label}-${index}`}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applySuggestion(suggestion);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs",
                    index === highlight ? "bg-gray-100 text-gray-900" : "text-gray-700 hover:bg-gray-50",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{suggestion.label}</span>
                  <span className="shrink-0 text-[10px] text-gray-400">{suggestion.detail}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {error ? (
        <div className="mt-1.5 rounded-xl bg-white px-2.5 py-1.5 text-[11px] text-red-600">
          {error}
        </div>
      ) : null}
    </div>
  );
}
