"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, X } from "lucide-react";
import type { BikeSpecExploreResult } from "@/lib/ai/bike-spec-explore-schema";
import {
  genieProgressShimmerClassName,
  genieProgressShimmerStyle,
} from "@/lib/genie/shimmer";
import { cn } from "@/lib/utils";

export interface BikeSpecSelection {
  label: string;
  value: string;
  sectionTitle: string;
}

interface BikeSpecExplorePanelProps {
  isOpen: boolean;
  onClose: () => void;
  spec: BikeSpecSelection | null;
  productName?: string | null;
  brand?: string | null;
  model?: string | null;
  bikeType?: string | null;
}

const THINKING_MESSAGES = [
  "Thinking…",
  "Searching official manufacturer sites…",
  "Reading the published specifications…",
  "Gathering official images…",
];

const EASE = [0.04, 0.62, 0.23, 0.98] as const;
const PANEL_CLOSE_MS = 420;
const DESKTOP_PANEL_WIDTH_PX = 400;
const DESKTOP_PANEL_SPRING = { type: "spring" as const, damping: 19, stiffness: 280, mass: 0.82 };
const SHEET_HEIGHT = "min(85dvh, calc(100dvh - env(safe-area-inset-bottom)))";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
      {children}
    </p>
  );
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function ExploreThinkingState({ messageIndex }: { messageIndex: number }) {
  const message = THINKING_MESSAGES[messageIndex % THINKING_MESSAGES.length];

  return (
    <div className="space-y-8">
      <div className="min-h-6">
        <AnimatePresence mode="wait">
          <motion.p
            key={message}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: EASE }}
            className={cn(
              "w-fit max-w-full whitespace-normal text-[15px] leading-relaxed text-gray-500",
              genieProgressShimmerClassName,
            )}
            style={genieProgressShimmerStyle}
          >
            {message}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="space-y-3">
        {["100%", "94%", "88%"].map((width, i) => (
          <motion.div
            key={width}
            animate={{ opacity: [0.35, 0.6, 0.35] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: i * 0.12 }}
            className="h-3 rounded-md bg-gray-200"
            style={{ width }}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            animate={{ opacity: [0.3, 0.55, 0.3] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: i * 0.1 }}
            className="aspect-square rounded-md bg-gray-100"
          />
        ))}
      </div>
    </div>
  );
}

function ExploreResults({ result }: { result: BikeSpecExploreResult }) {
  return (
    <div className="space-y-9 pb-4">
      {result.overview ? (
        <p className="text-[15px] leading-relaxed text-gray-600">{result.overview}</p>
      ) : null}

      {result.images.length > 0 ? (
        <section className="space-y-3">
          <SectionLabel>Images</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            {result.images.map((image) => (
              <a
                key={image.url}
                href={image.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-gray-100 bg-white p-3 transition-colors hover:border-gray-300"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {result.spec_details.length > 0 ? (
        <section className="space-y-3">
          <SectionLabel>Specifications</SectionLabel>
          <dl className="divide-y divide-gray-100">
            {result.spec_details.map((detail, index) => (
              <div
                key={`${detail.label}-${index}`}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 py-3"
              >
                <dt className="text-sm text-gray-500">{detail.label}</dt>
                <dd className="text-right text-sm font-medium text-gray-900">{detail.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {result.sources.length > 0 ? (
        <section className="space-y-3">
          <SectionLabel>Sources</SectionLabel>
          <div className="flex flex-col gap-1">
            {result.sources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-3 rounded-md py-2 text-sm text-gray-600 transition-colors hover:text-gray-900"
              >
                <span className="min-w-0 flex-1 truncate">{source.title}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-gray-400 group-hover:text-gray-600">
                  {hostnameFromUrl(source.url)}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function BikeSpecExplorePanelBody({
  spec,
  isLoading,
  messageIndex,
  error,
  result,
  showFooter,
  onClose,
  onRetry,
}: {
  spec: BikeSpecSelection | null;
  isLoading: boolean;
  messageIndex: number;
  error: string | null;
  result: BikeSpecExploreResult | null;
  showFooter: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <div
      className={cn(
        "grid h-full min-h-0 overflow-hidden",
        showFooter ? "grid-rows-[auto_minmax(0,1fr)_auto]" : "grid-rows-[auto_minmax(0,1fr)]",
      )}
    >
      <header className="min-h-0 overflow-hidden px-4 pt-3 sm:pt-4">
        <div className="mb-3 mx-auto h-1 w-10 rounded-full bg-gray-200 sm:hidden" aria-hidden />
        <div className="flex w-full items-start justify-between gap-3 pb-4 sm:pb-3">
          <div className="min-w-0 flex-1">
            {spec ? (
              <>
                <SectionLabel>
                  {spec.sectionTitle}
                  {spec.label ? ` · ${spec.label}` : ""}
                </SectionLabel>
                <h2
                  id="bike-spec-explore-title"
                  className="mt-2 text-lg font-semibold leading-snug tracking-tight text-gray-900"
                >
                  {spec.value}
                </h2>
              </>
            ) : (
              <h2 id="bike-spec-explore-title" className="text-lg font-semibold text-gray-900">
                Explore specification
              </h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-4 py-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
        {isLoading ? <ExploreThinkingState messageIndex={messageIndex} /> : null}

        {!isLoading && error ? (
          <div className="rounded-md border border-gray-200 bg-white p-5 text-center">
            <p className="text-sm font-medium text-gray-900">Could not load this part</p>
            <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-gray-500">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-5 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
            >
              Try again
            </button>
          </div>
        ) : null}

        {!isLoading && result ? <ExploreResults result={result} /> : null}
      </div>

      {showFooter ? (
        <footer
          className="min-h-0 overflow-hidden border-t border-gray-100 px-4 py-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <p className="text-xs text-gray-400">Sourced from official manufacturer websites.</p>
        </footer>
      ) : null}
    </div>
  );
}

export function BikeSpecExplorePanel({
  isOpen,
  onClose,
  spec,
  productName,
  brand,
  model,
  bikeType,
}: BikeSpecExplorePanelProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [messageIndex, setMessageIndex] = React.useState(0);
  const [result, setResult] = React.useState<BikeSpecExploreResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [retryToken, setRetryToken] = React.useState(0);
  const [shouldRender, setShouldRender] = React.useState(isOpen);
  const [isLeaving, setIsLeaving] = React.useState(false);
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  React.useEffect(() => {
    if (isOpen) {
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
  }, [isOpen, shouldRender]);

  React.useEffect(() => {
    if (!shouldRender) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [shouldRender]);

  React.useEffect(() => {
    if (!isLoading) {
      setMessageIndex(0);
      return;
    }

    const interval = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % THINKING_MESSAGES.length);
    }, 2500);

    return () => window.clearInterval(interval);
  }, [isLoading]);

  React.useEffect(() => {
    if (!isOpen || !spec) return;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setMessageIndex(0);

    const controller = new AbortController();

    const fetchExplore = async () => {
      try {
        const response = await fetch("/api/marketplace/bike-specs/explore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: spec.label,
            value: spec.value,
            sectionTitle: spec.sectionTitle,
            productName,
            brand,
            model,
            bikeType,
          }),
          signal: controller.signal,
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to explore specification");
        }

        setResult(data.result);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchExplore();

    return () => controller.abort();
  }, [isOpen, spec, productName, brand, model, bikeType, retryToken]);

  const handleClose = React.useCallback(() => {
    onClose();
    window.setTimeout(() => {
      setResult(null);
      setError(null);
      setIsLoading(false);
      setMessageIndex(0);
      setRetryToken(0);
    }, PANEL_CLOSE_MS);
  }, [onClose]);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, handleClose]);

  const handleRetry = () => {
    setRetryToken((current) => current + 1);
  };

  if (!shouldRender || !isMounted) return null;

  const panelState = isLeaving ? "closed" : "open";
  const showFooter = !isLoading && !!result;

  const bodyProps = {
    spec,
    isLoading,
    messageIndex,
    error,
    result,
    showFooter,
    onClose: handleClose,
    onRetry: handleRetry,
  };

  const panel = (
    <>
      {/* Mobile: bottom sheet */}
      <div
        data-state={panelState}
        className="store-message-overlay fixed inset-0 z-[100] flex items-end justify-center bg-black/30 px-0 sm:hidden"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) handleClose();
        }}
      >
        <div
          data-state={panelState}
          role="dialog"
          aria-modal="true"
          aria-labelledby="bike-spec-explore-title"
          className="store-message-sheet flex w-full flex-col overflow-hidden rounded-t-2xl border border-gray-200/80 bg-white shadow-xl"
          style={{
            height: SHEET_HEIGHT,
            maxHeight: SHEET_HEIGHT,
          }}
        >
          <BikeSpecExplorePanelBody {...bodyProps} />
        </div>
      </div>

      {/* Desktop: bottom-right popup */}
      <div className="hidden sm:block">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isLeaving ? 0 : 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed inset-0 z-40 bg-black/20"
          style={{ pointerEvents: isLeaving ? "none" : "auto" }}
          onClick={handleClose}
        />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bike-spec-explore-title"
          initial={{ opacity: 0, y: 36, scale: 0.88 }}
          animate={
            isLeaving ? { opacity: 0, y: 24, scale: 0.92 } : { opacity: 1, y: 0, scale: 1 }
          }
          transition={DESKTOP_PANEL_SPRING}
          className={cn(
            "fixed bottom-6 right-6 z-50 flex shrink-0 flex-col overflow-hidden",
            "rounded-2xl border border-gray-200 bg-white shadow-2xl ring-1 ring-black/5",
            "mb-[env(safe-area-inset-bottom)]",
          )}
          style={{
            width: DESKTOP_PANEL_WIDTH_PX,
            height: "min(85vh, 680px)",
            transformOrigin: "bottom right",
            pointerEvents: isLeaving ? "none" : "auto",
          }}
        >
          <BikeSpecExplorePanelBody {...bodyProps} />
        </motion.div>
      </div>
    </>
  );

  return createPortal(panel, document.body);
}
