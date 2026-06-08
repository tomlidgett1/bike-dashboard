"use client";

import * as React from "react";
import { AudioLines, Plus, Square } from "lucide-react";
import { cn } from "@/lib/utils";

export function HomeV2ChatInput({
  value,
  isRunning,
  compact,
  floating,
  onChange,
  onSubmit,
  onStop,
  placeholder = "Ask anything",
  showDisclaimer = true,
  endAccessory,
}: {
  value: string;
  isRunning?: boolean;
  compact?: boolean;
  floating?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  placeholder?: string;
  showDisclaimer?: boolean;
  /** Renders inside the input row, before the send/stop control (e.g. Connect Gmail). */
  endAccessory?: React.ReactNode;
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
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
          "flex w-full items-end gap-1 rounded-full px-2 py-2",
          compact ? "min-h-[56px]" : "min-h-[60px]",
          floating
            ? "border-0 bg-transparent shadow-none"
            : "border border-gray-200 bg-white shadow-sm",
        )}
      >
        <button
          type="button"
          className={cn(
            "mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-700 transition-colors",
            floating ? "hover:bg-gray-200/80" : "hover:bg-gray-100",
          )}
          aria-label="Add"
        >
          <Plus className="h-5 w-5" />
        </button>

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
          className="max-h-[132px] min-h-[36px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-[15px] leading-snug text-foreground outline-none placeholder:text-gray-500"
        />

        {endAccessory}

        <button
          type={isRunning && !hasText ? "button" : "submit"}
          disabled={!canAct}
          onClick={isRunning && !hasText ? onStop : undefined}
          className={cn(
            "mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
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
