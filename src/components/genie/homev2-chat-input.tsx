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
  fileAccept = "application/pdf,.pdf",
  fileButtonLabel = "Attach file",
  canSubmitWithoutText = false,
  placeholderShimmerOnHover = false,
  inputAccessory,
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
  /** Renders above the input row inside the pill (e.g. picked email element badge). */
  inputAccessory?: React.ReactNode;
  /** When set, the + button opens a PDF picker and selected files are passed here. */
  onFileSelected?: (file: File) => void;
  fileAccept?: string;
  fileButtonLabel?: string;
  canSubmitWithoutText?: boolean;
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const headerInputRef = React.useRef<HTMLInputElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isDraggingFile, setIsDraggingFile] = React.useState(false);
  const hasText = value.trim().length > 0;
  const queueMode = isRunning && hasText;
  const canSubmit = hasText || canSubmitWithoutText;
  const canAct = isRunning || canSubmit;
  const placeholderLabel = isRunning ? "Queue another prompt..." : placeholder;
  const showShimmerPlaceholder = Boolean(header && placeholderShimmerOnHover && !hasText);
  const truncatePlaceholder = Boolean(compact && floating && !onFileSelected && !header);
  const showTruncatedPlaceholder = truncatePlaceholder && !hasText;
  const [isMultiline, setIsMultiline] = React.useState(false);

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || header) return;

    if (!hasText) {
      textarea.style.height = "36px";
      setIsMultiline(false);
      return;
    }

    textarea.style.height = "auto";
    const maxHeight = compact ? 132 : 160;
    const scrollHeight = textarea.scrollHeight;
    const nextHeight = Math.min(scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    setIsMultiline(scrollHeight > 44 || value.includes("\n"));
  }, [compact, hasText, header, value]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (isRunning && !hasText) {
          onStop?.();
          return;
        }
        if (canSubmit) onSubmit();
      }}
      onDragEnter={(event) => {
        if (!onFileSelected) return;
        event.preventDefault();
        setIsDraggingFile(true);
      }}
      onDragOver={(event) => {
        if (!onFileSelected) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!onFileSelected) return;
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setIsDraggingFile(false);
      }}
      onDrop={(event) => {
        if (!onFileSelected) return;
        event.preventDefault();
        setIsDraggingFile(false);
        const file = Array.from(event.dataTransfer.files).find((item) =>
          item.type.startsWith("image/"),
        );
        if (file) onFileSelected(file);
      }}
      className="relative w-full"
    >
      {isDraggingFile ? (
        <div className="pointer-events-none absolute inset-1 z-10 flex items-center justify-center rounded-md border border-dashed border-gray-300 bg-white/95 text-xs font-medium text-gray-700">
          Drop image to attach
        </div>
      ) : null}
      {inputAccessory ? (
        <div className="border-b border-border/40 px-2 pb-2 pt-2">{inputAccessory}</div>
      ) : null}
      <div
        className={cn(
          "flex w-full gap-1 px-2",
          header
            ? "relative h-9 items-center rounded-full py-0"
            : cn(
                isMultiline ? "items-end py-2" : "items-center py-2",
                isMultiline || inputAccessory ? "rounded-2xl" : "rounded-full",
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
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-700 transition-colors",
              isMultiline && "mb-0.5",
              floating ? "hover:bg-gray-200/80" : "hover:bg-gray-100",
            )}
            aria-label={fileButtonLabel}
            title={fileButtonLabel}
          >
            <Plus className="h-5 w-5" />
          </button>
        ) : null}
        {onFileSelected ? (
          <input
            ref={fileInputRef}
            type="file"
            accept={fileAccept}
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
            header
              ? "flex h-full flex-1 items-center self-stretch"
              :               truncatePlaceholder
                ? "flex min-w-0 flex-1 items-center self-center"
                : onFileSelected
                  ? "flex min-w-0 flex-1 items-center self-center"
                  : "contents",
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
          {!header && showTruncatedPlaceholder ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-2 right-2 flex items-center truncate text-[15px] text-gray-500"
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
                  if (canSubmit) onSubmit();
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
                  if (canSubmit) onSubmit();
                }
              }}
              rows={1}
              placeholder={showTruncatedPlaceholder ? " " : placeholderLabel}
              className={cn(
                "max-h-[132px] min-h-[36px] flex-1 resize-none border-0 bg-transparent px-2 text-[15px] leading-snug text-foreground outline-none placeholder:text-gray-500",
                showTruncatedPlaceholder ? "overflow-hidden py-2" : "py-2",
                onFileSelected && "px-1",
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
            if (canSubmit) onSubmit();
          }}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full transition-colors",
            header ? "h-7 w-7" : cn("h-9 w-9", isMultiline && "mb-0.5"),
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
