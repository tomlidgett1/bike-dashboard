"use client";

import * as React from "react";
import { AudioLines, Plus, Square } from "lucide-react";
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
}: {
  value: string;
  isRunning?: boolean;
  compact?: boolean;
  floating?: boolean;
  /** Compact single-line variant for the store settings dashboard header. */
  header?: boolean;
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
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const hasText = value.trim().length > 0;
  const queueMode = isRunning && hasText;
  const canAct = isRunning || hasText;

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, compact ? 132 : 160)}px`;
  }, [compact, value]);

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
          header ? "min-h-[40px] items-center py-1" : "items-end py-2",
          !header && (compact ? "min-h-[56px]" : "min-h-[60px]"),
          floating
            ? "border-0 bg-transparent shadow-none"
            : "border border-gray-200 bg-white shadow-sm",
        )}
      >
        {!header ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-700 transition-colors",
              floating ? "hover:bg-gray-200/80" : "hover:bg-gray-100",
            )}
            aria-label={onFileSelected ? "Attach a supplier invoice PDF" : "Add"}
            title={onFileSelected ? "Attach a supplier invoice PDF" : undefined}
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
          placeholder={isRunning ? "Queue another prompt..." : placeholder}
          className={cn(
            "flex-1 resize-none border-0 bg-transparent px-1 text-foreground outline-none placeholder:text-gray-500",
            header
              ? "min-h-[28px] max-h-[28px] py-1 text-sm leading-snug"
              : "max-h-[132px] min-h-[36px] py-2 text-[15px] leading-snug",
          )}
        />

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
            header ? "h-8 w-8" : "mb-0.5 h-9 w-9",
            canAct ? "bg-gray-900 text-white hover:bg-gray-800" : "bg-gray-200 text-gray-400",
          )}
          aria-label={queueMode ? "Add to queue" : isRunning ? "Stop response" : "Send message"}
        >
          {isRunning && !hasText ? (
            <Square className="h-3.5 w-3.5 fill-current" />
          ) : (
            <AudioLines className="h-4 w-4" />
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
