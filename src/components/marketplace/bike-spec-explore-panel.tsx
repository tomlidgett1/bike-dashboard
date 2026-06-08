"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { BikeSpecExploreResult } from "@/lib/ai/bike-spec-explore-schema";

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

const THINKING_SHIMMER_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(90deg, #a3a3a3 0%, #a3a3a3 38%, #525252 50%, #a3a3a3 62%, #a3a3a3 100%)",
  backgroundSize: "220% 100%",
};

const THINKING_MESSAGES = [
  "Thinking…",
  "Searching official manufacturer sites…",
  "Reading the published specifications…",
  "Gathering official images…",
];

const EASE = [0.04, 0.62, 0.23, 0.98] as const;

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
            className="w-fit max-w-full whitespace-normal bg-clip-text text-[15px] leading-relaxed text-transparent animate-[agent-text-shimmer_5.5s_linear_infinite]"
            style={THINKING_SHIMMER_STYLE}
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="space-y-9"
    >
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
    </motion.div>
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

  const handleClose = () => {
    onClose();
    window.setTimeout(() => {
      setResult(null);
      setError(null);
      setIsLoading(false);
      setMessageIndex(0);
      setRetryToken(0);
    }, 300);
  };

  const handleRetry = () => {
    setRetryToken((current) => current + 1);
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 border-gray-200 p-0 sm:max-w-md"
      >
        <SheetTitle className="sr-only">
          {spec ? `${spec.value} specifications` : "Explore specification"}
        </SheetTitle>

        <div className="flex h-full flex-col bg-white">
          <header className="flex items-start gap-3 border-b border-gray-100 px-6 pb-5 pt-6">
            <div className="min-w-0 flex-1">
              {spec ? (
                <>
                  <SectionLabel>
                    {spec.sectionTitle}
                    {spec.label ? ` · ${spec.label}` : ""}
                  </SectionLabel>
                  <h2 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-gray-900">
                    {spec.value}
                  </h2>
                </>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="-mr-1 -mt-1 shrink-0 rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close panel"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7 [scrollbar-width:thin]">
            {isLoading ? <ExploreThinkingState messageIndex={messageIndex} /> : null}

            {!isLoading && error ? (
              <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
                <p className="text-sm font-medium text-gray-900">Could not load this part</p>
                <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-gray-500">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="mt-5 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
                >
                  Try again
                </button>
              </div>
            ) : null}

            {!isLoading && result ? <ExploreResults result={result} /> : null}
          </div>

          {!isLoading && result ? (
            <footer className="border-t border-gray-100 px-6 py-3">
              <p className="text-xs text-gray-400">
                Sourced from official manufacturer websites.
              </p>
            </footer>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
