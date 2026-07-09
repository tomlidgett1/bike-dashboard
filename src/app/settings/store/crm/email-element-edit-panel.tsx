"use client";

import * as React from "react";
import { Trash2, X } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { EmailInlineEditState } from "@/app/settings/store/crm/email-preview-design";

export const EMAIL_FONT_OPTIONS = [
  {
    label: "System sans",
    value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', Helvetica, sans-serif" },
] as const;

export const EMAIL_FONT_SIZE_OPTIONS = [12, 14, 16, 18, 20, 24, 28, 32, 36, 48] as const;

function matchFontOption(fontFamily: string): string {
  const normalised = fontFamily.toLowerCase();
  const matched = EMAIL_FONT_OPTIONS.find((option) =>
    option.value.toLowerCase().split(",")[0]?.replace(/['"]/g, "").trim() &&
    normalised.includes(option.value.toLowerCase().split(",")[0]!.replace(/['"]/g, "").trim()),
  );
  if (matched) return matched.value;
  const byFirst = EMAIL_FONT_OPTIONS.find((option) => {
    const first = option.value.split(",")[0]?.replace(/['"]/g, "").trim().toLowerCase();
    return first && normalised.includes(first);
  });
  return byFirst?.value ?? EMAIL_FONT_OPTIONS[0].value;
}

export function EmailElementEditPanel(props: {
  state: EmailInlineEditState;
  onChangeStyles: (styles: Partial<Pick<EmailInlineEditState, "fontFamily" | "fontSize" | "color">>) => void;
  onDone: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const { state, onChangeStyles, onDone, onCancel, onDelete } = props;
  const fontValue = matchFontOption(state.fontFamily);

  return (
    <aside className="flex w-[min(330px,28%)] shrink-0 flex-col overflow-hidden border-l border-border/60 bg-white">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/40 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Edit element</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{state.label}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-gray-100 hover:text-foreground"
          aria-label="Close editor"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {state.isImage ? (
          <div className="rounded-md border border-border/60 bg-white p-3 text-sm text-muted-foreground">
            Image selected. Delete it below or double-click another text element to edit typography.
          </div>
        ) : (
          <>
            <div>
              <Label className="text-xs">Font</Label>
              <select
                value={fontValue}
                onChange={(e) => onChangeStyles({ fontFamily: e.target.value })}
                className="mt-1 w-full rounded-md border border-border/60 bg-white px-3 py-2 text-sm"
              >
                {EMAIL_FONT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs">Text size</Label>
              <div className="mt-1 flex max-w-full flex-wrap items-center gap-1 bg-gray-100 p-0.5 rounded-full w-fit">
                {EMAIL_FONT_SIZE_OPTIONS.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => onChangeStyles({ fontSize: size })}
                    className={cn(
                      "px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                      state.fontSize === size
                        ? "text-gray-800 bg-white shadow-sm"
                        : "text-gray-600 hover:bg-gray-200/70",
                    )}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Text colour</Label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={state.color}
                  onChange={(e) => onChangeStyles({ color: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded-md border border-border/60 bg-white p-1"
                />
                <Input
                  value={state.color}
                  onChange={(e) => onChangeStyles({ color: e.target.value })}
                  className="font-mono text-xs uppercase"
                  spellCheck={false}
                />
              </div>
            </div>

            <p className="text-[11px] leading-snug text-muted-foreground">
              Edit text directly in the preview. Enter saves · Esc cancels.
            </p>
          </>
        )}

        <Button
          type="button"
          variant="outline"
          className="justify-start text-red-700 hover:bg-red-50 hover:text-red-800"
          onClick={onDelete}
        >
          <Trash2 className="mr-1.5 size-4" />
          Delete element
        </Button>
      </div>

      <div className="flex shrink-0 gap-2 border-t border-border/40 px-4 py-3">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" className="flex-1" onClick={onDone}>
          Done
        </Button>
      </div>
    </aside>
  );
}
