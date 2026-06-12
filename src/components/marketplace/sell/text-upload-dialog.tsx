"use client";

import * as React from "react";
import Image from "next/image";
import {
  ArrowRight,
  Loader2,
  MessageCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CLOSE_MS = 220;

type DialogStep = "how-it-works" | "phone" | "success";

interface TextUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BentoCellProps {
  step: string;
  title: string;
  description: string;
  className?: string;
  children?: React.ReactNode;
}

function BentoCell({ step, title, description, className, children }: BentoCellProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col justify-end overflow-hidden rounded-2xl border border-gray-100 bg-gray-50/80 p-4",
        className,
      )}
    >
      {children}
      <div className="relative">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {step}
        </span>
        <p className="mt-0.5 text-sm font-semibold text-gray-900">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{description}</p>
      </div>
    </div>
  );
}

function ChatPreview() {
  return (
    <div className="pointer-events-none mb-3 flex flex-col gap-1.5 text-[11px] leading-snug">
      <div className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-[#1982FC] px-3 py-1.5 text-white">
        Selling my Giant TCR — here are some pics 📸
      </div>
      <div className="max-w-[85%] self-start rounded-2xl rounded-bl-md bg-gray-200/90 px-3 py-1.5 text-gray-900">
        Nice bike! Got them. Want me to build the listing?
      </div>
      <div className="max-w-[60%] self-end rounded-2xl rounded-br-md bg-[#1982FC] px-3 py-1.5 text-white">
        Yes please 🙌
      </div>
      <div className="max-w-[85%] self-start rounded-2xl rounded-bl-md bg-gray-200/90 px-3 py-1.5 text-gray-900">
        Done — tap to review &amp; it&apos;s live ✨
      </div>
    </div>
  );
}

export function TextUploadDialog({ isOpen, onClose }: TextUploadDialogProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [step, setStep] = React.useState<DialogStep>("how-it-works");
  const [phone, setPhone] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [messageHref, setMessageHref] = React.useState<string | null>(null);
  const [shouldRender, setShouldRender] = React.useState(isOpen);
  const [isLeaving, setIsLeaving] = React.useState(false);

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
    }, CLOSE_MS);

    return () => window.clearTimeout(timer);
  }, [isOpen, shouldRender]);

  React.useEffect(() => {
    if (!isOpen) return;
    setStep("how-it-works");
    setPhone("");
    setError(null);
    setMessageHref(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  React.useEffect(() => {
    if (step !== "phone") return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(focusTimer);
  }, [step]);

  React.useEffect(() => {
    if (!shouldRender) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [shouldRender]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setError("Enter your mobile number to continue.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const response = await fetch("/api/marketplace/text-upload-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: trimmedPhone }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "We could not set up text upload. Try again shortly.",
        );
      }

      const nextMessageHref =
        typeof data.messageHref === "string" && data.messageHref.startsWith("sms:")
          ? data.messageHref
          : typeof data.messageNumber === "string"
            ? `sms:${data.messageNumber.replace(/[^\d+]/g, "")}?&body=nest`
            : null;

      if (!nextMessageHref) {
        throw new Error("Messages is not configured yet.");
      }

      setPhone("");
      setStep("success");
      setMessageHref(nextMessageHref);
      window.setTimeout(() => {
        window.location.href = nextMessageHref;
      }, 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not set up text upload. Try again shortly.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!shouldRender) return null;

  return (
    <div
      data-state={isLeaving ? "closed" : "open"}
      className="store-message-overlay fixed inset-0 z-[120] flex items-end justify-center bg-black/45 px-0 backdrop-blur-sm sm:items-center sm:px-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        data-state={isLeaving ? "closed" : "open"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="text-upload-title"
        className="store-message-sheet max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl ring-1 ring-black/10 sm:max-w-md sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md">
              <Image src="/imessage.png" alt="iMessage" width={40} height={40} className="h-10 w-10 rounded-md object-contain" />
            </span>
            <div>
              <h2 id="text-upload-title" className="text-base font-semibold text-gray-900">
                Sell over iMessage
              </h2>
              <p className="text-sm text-gray-500">List your item from Messages.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "how-it-works" && (
          <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:pb-6">
            <BentoCell
              step="How it works"
              title="Text us"
              description="Send photos, chat like you would with a mate, then just approve the listing we build for you."
            >
              <ChatPreview />
            </BentoCell>

            <button
              type="button"
              onClick={() => setStep("phone")}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#ffde59] px-5 text-sm font-semibold text-gray-900 transition-transform hover:-translate-y-0.5"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {step === "phone" && (
          <form onSubmit={handleSubmit} className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:pb-6">
            <p className="text-sm leading-relaxed text-gray-600">
              Enter your mobile number and Messages will open ready to go — just say
              &quot;nest&quot; and start sending photos.
            </p>

            <div className="mt-5">
              <label htmlFor="text-upload-phone" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Mobile number
              </label>
              <input
                ref={inputRef}
                id="text-upload-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  if (error) setError(null);
                }}
                placeholder="0400 000 000"
                className="mt-2 h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-base text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-900 focus:bg-white"
              />
              {error && (
                <p className="mt-2 text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#ffde59] px-5 text-sm font-semibold text-gray-900 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  Open Messages
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setStep("how-it-works")}
              className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-full text-sm font-medium text-gray-500 transition-colors hover:text-gray-800"
            >
              Back
            </button>
          </form>
        )}

        {step === "success" && (
          <div className="px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-10 text-center sm:pb-8">
            <div className="relative mx-auto h-20 w-20">
              <div className="absolute inset-0 animate-ping rounded-[1.4rem] bg-green-400/20" />
              <Image
                src="/imessage.png"
                alt="iMessage"
                width={80}
                height={80}
                className="relative h-20 w-20 rounded-[1.4rem] object-contain shadow-lg shadow-green-500/20"
              />
            </div>
            <h3 className="mt-6 text-xl font-semibold tracking-tight text-gray-900">
              You&apos;re all set
            </h3>
            <p className="mx-auto mt-2 max-w-[260px] text-sm leading-relaxed text-gray-500">
              Jump into Messages and say hi — we&apos;ll take it from there.
            </p>
            {messageHref && (
              <a
                href={messageHref}
                className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#ffde59] px-5 text-sm font-semibold text-gray-900 shadow-sm transition-transform hover:-translate-y-0.5"
              >
                <MessageCircle className="h-4 w-4" />
                Open Messages
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
