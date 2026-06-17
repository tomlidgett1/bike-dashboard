"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { BottomSheet, Btn, Spinner } from "./ui";

interface AiRedoDialogProps {
  open: boolean;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  submitLabel?: string;
  isSubmitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (hint: string) => void | Promise<void>;
}

export function AiRedoDialog({
  open,
  title = "What is the correct product?",
  subtitle = "Just tell us below.",
  placeholder = "e.g. 2022 Trek Fuel EX 8, not a Top Fuel",
  submitLabel = "Redo with this product",
  isSubmitting = false,
  error,
  onClose,
  onSubmit,
}: AiRedoDialogProps) {
  const [hint, setHint] = React.useState("");

  React.useEffect(() => {
    if (!open) setHint("");
  }, [open]);

  const trimmed = hint.trim();

  return (
    <BottomSheet open={open} onClose={isSubmitting ? () => undefined : onClose} title={title} subtitle={subtitle}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-gray-500">
            Correct product
          </span>
          <textarea
            autoFocus
            value={hint}
            onChange={(event) => setHint(event.target.value)}
            placeholder={placeholder}
            rows={4}
            className="w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-2.5 text-[15px] leading-relaxed text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-900"
          />
        </label>

        {error && (
          <div className="rounded-md border border-gray-200 bg-white p-3">
            <p className="text-[12px] leading-relaxed text-rose-600">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-11 rounded-md px-4 text-[14px] font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40"
          >
            Cancel
          </button>
          <Btn full disabled={!trimmed || isSubmitting} onClick={() => void onSubmit(trimmed)}>
            {isSubmitting ? <Spinner size={18} /> : <RefreshCw className="h-4 w-4" />}
            {isSubmitting ? "Redoing…" : submitLabel}
          </Btn>
        </div>
      </div>
    </BottomSheet>
  );
}
