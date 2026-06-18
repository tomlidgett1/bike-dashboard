"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBodyScrollLock } from "@/hooks/use-mobile-sheet-viewport";
import { cn } from "@/lib/utils";

const PANEL_CLOSE_MS = 320;

const STEPS = [
  "Buy with Buy Now at checkout",
  "The store passes your order to an Uber courier",
  "Track delivery to your door in about an hour",
];

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 640px)").matches
      : false,
  );

  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

function UberDeliveryInfoContent({
  onClose,
  variant,
}: {
  onClose: () => void;
  variant: "sheet" | "dialog";
}) {
  return (
    <>
      <div
        className={cn(
          "flex-1 overflow-y-auto px-5 pt-2",
          variant === "dialog" ? "sm:px-6 sm:pt-4" : "pb-2",
        )}
      >
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-900">
            <Image
              src="/uber.png"
              alt=""
              width={40}
              height={16}
              aria-hidden
              style={{ filter: "brightness(0) invert(1)" }}
              className="h-3.5 w-auto object-contain"
            />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">Uber Express</p>
            <p className="text-sm text-gray-500">On-demand delivery</p>
          </div>
        </div>

        <p className="text-[15px] leading-relaxed text-gray-700">
          Get eligible items delivered to your door in about{" "}
          <span className="font-semibold text-[#0eb462]">1 hour</span>, powered by Uber.
        </p>

        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-400">
          How it works
        </p>
        <ol className="mt-3 space-y-3">
          {STEPS.map((step, index) => (
            <li key={step} className="flex gap-3 text-[13px] leading-relaxed text-gray-700">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-semibold text-gray-600">
                {index + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>

        <p className="mt-5 text-[13px] leading-relaxed text-gray-500">
          Available within delivery range of participating stores.
        </p>
      </div>

      <div
        className={cn(
          "shrink-0 border-t border-gray-100 bg-white px-5 py-4",
          variant === "sheet" && "pb-[calc(16px+env(safe-area-inset-bottom))]",
        )}
      >
        <button
          type="button"
          onClick={onClose}
          className="h-11 w-full rounded-md bg-gray-900 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
        >
          Got it
        </button>
      </div>
    </>
  );
}

interface UberDeliveryInfoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UberDeliveryInfoSheet({ open, onOpenChange }: UberDeliveryInfoSheetProps) {
  const isDesktop = useIsDesktop();
  const [mounted, setMounted] = React.useState(false);
  const [shouldRender, setShouldRender] = React.useState(open);
  const [isLeaving, setIsLeaving] = React.useState(false);

  const handleClose = () => onOpenChange(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (open) {
      setShouldRender(true);
      setIsLeaving(false);
      return;
    }

    if (!shouldRender) return;

    setIsLeaving(true);
    const timer = window.setTimeout(() => {
      setShouldRender(false);
      setIsLeaving(false);
    }, PANEL_CLOSE_MS);

    return () => window.clearTimeout(timer);
  }, [open, shouldRender]);

  useBodyScrollLock(shouldRender && !isDesktop);

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="animate-in fade-in duration-200"
          className={cn(
            "flex max-w-sm flex-col gap-0 overflow-hidden rounded-[28px] border border-gray-200/70 bg-white p-0 shadow-2xl",
            "animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out",
          )}
        >
          <DialogTitle className="sr-only">Uber Express delivery</DialogTitle>
          <UberDeliveryInfoContent onClose={handleClose} variant="dialog" />
        </DialogContent>
      </Dialog>
    );
  }

  if (!mounted || !shouldRender) return null;

  const panelState = isLeaving ? "closed" : "open";

  return createPortal(
    <div
      data-state={panelState}
      className="store-message-overlay fixed inset-0 z-[110] flex items-end justify-center bg-black/40 px-0 sm:hidden"
      role="presentation"
      style={{ pointerEvents: isLeaving ? "none" : "auto" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        data-state={panelState}
        role="dialog"
        aria-modal="true"
        aria-label="Uber Express delivery"
        className="store-message-sheet flex w-full max-h-[min(88dvh,520px)] flex-col overflow-hidden rounded-t-2xl border border-gray-200/80 bg-white shadow-xl"
      >
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-gray-200" aria-hidden />
        <UberDeliveryInfoContent onClose={handleClose} variant="sheet" />
      </div>
    </div>,
    document.body,
  );
}
