"use client";

import * as React from "react";
import { Plus, Send, Square } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";

export function HomeV2ChatInput({
  value,
  isRunning,
  compact,
  floating,
  header,
  onChange,
  onSubmit,
  onStop,
  placeholder = "Ask anything",
  showDisclaimer = true,
  endAccessory,
  onFileSelected,
  placeholderShimmerOnHover = false,
}: {
  value: string;
  isRunning?: boolean;
  compact?: boolean;
  floating?: boolean;
  /** Compact single-line variant for the store settings dashboard header. */
  header?: boolean;
  /** Shimmer the placeholder label when the parent `.group` is hovered (header search). */
  placeholderShimmerOnHover?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  placeholder?: string;
  showDisclaimer?: boolean;
  /** Renders inside the input row, before the send/stop control (e.g. Connect Gmail). */
  endAccessory?: React.ReactNode;
  /** When set, the + button opens a PDF picker and selected files are passed here. */
  onFileSelected?: (file: File) => void;
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const headerInputRef = React.useRef<HTMLInputElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const hasText = value.trim().length > 0;
  const queueMode = isRunning && hasText;
  const canAct = isRunning || hasText;
  const placeholderLabel = isRunning ? "Queue another prompt..." : placeholder;
  const showShimmerPlaceholder = Boolean(header && placeholderShimmerOnHover && !hasText);

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || header) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, compact ? 132 : 160)}px`;
  }, [compact, header, value]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (isRunning && !hasText) {
          onStop?.();
          return;
        }
        if (hasText) onSubmit();
      }}
      className="w-full"
    >
      <div
        className={cn(
          "flex w-full gap-1 rounded-full px-2",
          header
            ? "relative h-9 items-center py-0"
            : cn(
                onFileSelected ? "items-end py-2" : "items-center py-2",
                compact ? "min-h-[56px]" : "min-h-[60px]",
              ),
          floating
            ? "border-0 bg-transparent shadow-none"
            : "border border-gray-200 bg-white shadow-sm",
        )}
      >
        {!header && onFileSelected ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-700 transition-colors",
              floating ? "hover:bg-gray-200/80" : "hover:bg-gray-100",
            )}
            aria-label="Attach a supplier invoice PDF"
            title="Attach a supplier invoice PDF"
          >
            <Plus className="h-5 w-5" />
          </button>
        ) : null}
        {onFileSelected ? (
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFileSelected(file);
              event.target.value = "";
            }}
          />
        ) : null}

        <div
          className={cn(
            "relative min-w-0",
            header ? "flex h-full flex-1 items-center self-stretch" : "contents",
          )}
        >
          {header && showShimmerPlaceholder ? (
            <span
              aria-hidden
              className="genie-header-search-placeholder pointer-events-none absolute inset-y-0 left-0 flex items-center truncate pl-2 pr-1 text-left text-sm text-gray-500"
            >
              {placeholderLabel}
            </span>
          ) : null}
          {header ? (
            <input
              ref={headerInputRef}
              type="text"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (isRunning && !hasText) {
                    onStop?.();
                    return;
                  }
                  if (hasText) onSubmit();
                }
              }}
              placeholder={showShimmerPlaceholder ? " " : placeholderLabel}
              className="h-full w-full min-w-0 appearance-none border-0 bg-transparent p-0 pl-2 pr-1 text-left text-sm text-foreground outline-none placeholder:text-gray-500"
            />
          ) : (
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (isRunning && !hasText) {
                    onStop?.();
                    return;
                  }
                  if (hasText) onSubmit();
                }
              }}
              rows={1}
              placeholder={placeholderLabel}
              className={cn(
                "max-h-[132px] flex-1 resize-none border-0 bg-transparent text-[15px] text-foreground outline-none placeholder:text-gray-500",
                onFileSelected
                  ? "min-h-[36px] px-1 py-2 leading-snug"
                  : "min-h-9 px-2 py-0 leading-9",
              )}
            />
          )}
        </div>

        {endAccessory}

        <button
          type="button"
          disabled={!canAct}
          onClick={() => {
            if (isRunning && !hasText) {
              onStop?.();
              return;
            }
            if (hasText) onSubmit();
          }}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full transition-colors",
            header ? "h-7 w-7" : cn("h-9 w-9", onFileSelected && "mb-0.5"),
            canAct ? "bg-gray-900 text-white hover:bg-gray-800" : "bg-gray-200 text-gray-400",
          )}
          aria-label={queueMode ? "Add to queue" : isRunning ? "Stop response" : "Send message"}
        >
          {isRunning && !hasText ? (
            <Square className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>

      {compact && showDisclaimer ? (
        <p className="mt-2 text-center text-xs text-gray-500">
          Genie can make mistakes. Check important info.
        </p>
      ) : null}
    </form>
  );
}
