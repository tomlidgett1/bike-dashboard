"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { FlowGuided } from "@/app/marketplace/sell-redesign/_components/flow-guided";
import { FlowForm } from "@/app/marketplace/sell-redesign/_components/flow-form";
import { loadTextUploadDraft } from "@/app/marketplace/sell-redesign/_components/services";
import type { BikeDraft } from "@/app/marketplace/sell-redesign/_components/data";

// ============================================================
// Quick Upload Sheet — hosts the guided and form listing flows
// in the same full-height bottom sheet used by bulk upload, so
// the whole listing journey stays in a sheet instead of a page.
// ============================================================

interface QuickUploadSheetProps {
  isOpen: boolean;
  mode: "guided" | "form";
  onClose: () => void;
  textUploadToken?: string;
}

export function QuickUploadSheet({ isOpen, mode, onClose, textUploadToken }: QuickUploadSheetProps) {
  const [initialDraft, setInitialDraft] = React.useState<Partial<BikeDraft> | null>(null);
  const [loadingTextUpload, setLoadingTextUpload] = React.useState(false);
  const [textUploadError, setTextUploadError] = React.useState<string | null>(null);
  const loadedTokenRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!isOpen || !textUploadToken) {
      if (!textUploadToken) {
        setInitialDraft(null);
        loadedTokenRef.current = null;
      }
      return;
    }
    if (loadedTokenRef.current === textUploadToken) return;

    let cancelled = false;
    const load = async () => {
      setLoadingTextUpload(true);
      setTextUploadError(null);
      try {
        const draft = await loadTextUploadDraft(textUploadToken);
        if (cancelled) return;
        loadedTokenRef.current = textUploadToken;
        setInitialDraft(draft);
      } catch (error) {
        if (!cancelled) {
          setTextUploadError(
            error instanceof Error ? error.message : "Could not load this text upload.",
          );
        }
      } finally {
        if (!cancelled) setLoadingTextUpload(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [isOpen, textUploadToken]);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="flex max-h-[96dvh] flex-col gap-0 overflow-hidden rounded-t-xl p-0 sm:mx-auto sm:max-w-[480px]"
        style={{ height: "96dvh" }}
        showCloseButton={false}
      >
        <SheetTitle className="sr-only">
          {mode === "guided" ? "Quick upload" : "Fill in a form"}
        </SheetTitle>
        {/* Handle bar */}
        <div className="flex flex-shrink-0 justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        {/* Slim header */}
        <div className="flex h-9 flex-shrink-0 items-center justify-between px-4">
          <span className="rounded-md bg-gray-100 px-2 py-1 text-[12px] font-semibold text-gray-600">
            {mode === "guided" ? "Quick upload" : "Fill in a form"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        {/* Flow body — flows manage their own scroll/CTA inside this container */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {loadingTextUpload ? (
            <div className="grid min-h-[70dvh] place-items-center px-6 text-center">
              <div>
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
                <p className="mt-3 text-[13px] text-gray-500">Loading your text upload…</p>
              </div>
            </div>
          ) : textUploadError ? (
            <div className="grid min-h-[70dvh] place-items-center px-6 text-center">
              <div className="rounded-md border border-gray-200 bg-white p-5">
                <h2 className="text-[16px] font-semibold text-gray-900">Text upload unavailable</h2>
                <p className="mt-2 text-[13px] leading-relaxed text-gray-600">{textUploadError}</p>
              </div>
            </div>
          ) : mode === "guided" ? (
            <FlowGuided initialDraft={initialDraft ?? undefined} />
          ) : (
            <FlowForm initialDraft={initialDraft ?? undefined} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
