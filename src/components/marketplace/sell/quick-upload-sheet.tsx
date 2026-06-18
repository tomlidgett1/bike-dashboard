"use client";

import * as React from "react";
import { X } from '@/components/layout/app-sidebar/dashboard-icons';
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { FlowGuided, GUIDED_MACRO_LABELS } from "@/app/marketplace/sell-redesign/_components/flow-guided";
import { FlowForm } from "@/app/marketplace/sell-redesign/_components/flow-form";
import { MacroProgressHeader } from "@/app/marketplace/sell-redesign/_components/ui";
import { loadTextUploadDraft } from "@/app/marketplace/sell-redesign/_components/services";
import type { BikeDraft } from "@/app/marketplace/sell-redesign/_components/data";
import type { SingleItemPhotoDraft } from "./single-item-photo-draft";

// ============================================================
// Quick Upload Sheet — guided or form listing after photos
// are collected in the entry flow (count → photos → layout).
// Mobile: bottom sheet. Desktop: centred dialog.
// ============================================================

interface QuickUploadSheetProps {
  isOpen: boolean;
  mode: "guided" | "form";
  onClose: () => void;
  textUploadToken?: string;
  photoDraft?: SingleItemPhotoDraft | null;
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 768px)").matches
      : false,
  );

  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

export function QuickUploadSheet({
  isOpen,
  mode,
  onClose,
  textUploadToken,
  photoDraft,
}: QuickUploadSheetProps) {
  const isDesktop = useIsDesktop();
  const [initialDraft, setInitialDraft] = React.useState<Partial<BikeDraft> | null>(null);
  const [loadingTextUpload, setLoadingTextUpload] = React.useState(false);
  const [textUploadError, setTextUploadError] = React.useState<string | null>(null);
  const [flowInstance, setFlowInstance] = React.useState(0);
  const loadedTokenRef = React.useRef<string | null>(null);
  const [autoAnalyseFromPhotos, setAutoAnalyseFromPhotos] = React.useState(false);
  const [guidedHeader, setGuidedHeader] = React.useState<{
    label: string;
    imageUrl?: string;
  } | null>(null);
  const [guidedMacroStep, setGuidedMacroStep] = React.useState<number | null>(null);

  const handleGuidedHeaderChange = React.useCallback(
    (header: { label: string; imageUrl?: string } | null) => {
      setGuidedHeader(header);
    },
    [],
  );

  const handleMacroStepChange = React.useCallback(
    (step: { step: number; label: string } | null) => {
      setGuidedMacroStep(step?.step ?? null);
    },
    [],
  );

  const handleListAnother = () => {
    setInitialDraft(null);
    loadedTokenRef.current = null;
    setAutoAnalyseFromPhotos(false);
    setGuidedHeader(null);
    setGuidedMacroStep(null);
    setFlowInstance((instance) => instance + 1);
  };

  React.useEffect(() => {
    if (!isOpen) {
      setGuidedHeader(null);
      setGuidedMacroStep(null);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;

    if (textUploadToken) {
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
          setAutoAnalyseFromPhotos(false);
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
    }

    if (photoDraft?.images?.length) {
      setInitialDraft({
        images: photoDraft.images,
        uploadedImages: photoDraft.uploadedImages,
      });
      setAutoAnalyseFromPhotos(true);
      return;
    }

    setInitialDraft(null);
    setAutoAnalyseFromPhotos(false);
  }, [isOpen, textUploadToken, photoDraft]);

  const modeLabel = mode === "guided" ? "Guided" : "Quick upload";

  const flowBody = loadingTextUpload ? (
    <div className="grid flex-1 place-items-center px-6 py-12 text-center">
      <div>
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
        <p className="mt-3 text-[13px] text-gray-500">Loading your text upload…</p>
      </div>
    </div>
  ) : textUploadError ? (
    <div className="grid flex-1 place-items-center px-6 py-12 text-center">
      <div className="rounded-md border border-gray-200 bg-white p-5">
        <h2 className="text-[16px] font-semibold text-gray-900">Text upload unavailable</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-gray-600">{textUploadError}</p>
      </div>
    </div>
  ) : mode === "guided" ? (
    <FlowGuided
      key={`guided-${flowInstance}`}
      initialDraft={flowInstance === 0 ? (initialDraft ?? undefined) : undefined}
      autoAnalyseFromPhotos={flowInstance === 0 && autoAnalyseFromPhotos}
      onListAnother={handleListAnother}
      onGuidedHeaderChange={handleGuidedHeaderChange}
      onMacroStepChange={handleMacroStepChange}
    />
  ) : (
    <FlowForm
      key={`form-${flowInstance}`}
      initialDraft={flowInstance === 0 ? (initialDraft ?? undefined) : undefined}
      autoAnalyseFromPhotos={flowInstance === 0 && autoAnalyseFromPhotos}
      onListAnother={handleListAnother}
    />
  );

  const panelChrome = (
    <>
      <div className="flex min-h-10 flex-shrink-0 items-center justify-between gap-3 px-4 py-1.5 md:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {mode === "guided" && guidedHeader && (
            <>
              {guidedHeader.imageUrl && (
                <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={guidedHeader.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <p className="min-w-0 truncate text-[13px] font-semibold text-gray-800">
                {guidedHeader.label}
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>

      {mode === "guided" && guidedMacroStep !== null && (
        <MacroProgressHeader step={guidedMacroStep} labels={GUIDED_MACRO_LABELS} />
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {flowBody}
      </div>
    </>
  );

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  if (isDesktop) {
    return (
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="animate-in fade-in duration-200"
          className={cn(
            "flex h-[min(94dvh,920px)] max-h-[min(94dvh,920px)] w-[min(calc(100vw-2rem),52rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-[28px] border border-gray-200 bg-white p-0 shadow-xl",
            "animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out",
          )}
        >
          <DialogTitle className="sr-only">{modeLabel}</DialogTitle>
          {panelChrome}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[94dvh] max-h-[94dvh] flex-col gap-0 overflow-hidden rounded-t-xl p-0 data-[side=bottom]:h-[94dvh] data-[side=bottom]:max-h-[94dvh]"
        showCloseButton={false}
      >
        <SheetTitle className="sr-only">{modeLabel}</SheetTitle>
        <div className="flex flex-shrink-0 justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>
        {panelChrome}
      </SheetContent>
    </Sheet>
  );
}
