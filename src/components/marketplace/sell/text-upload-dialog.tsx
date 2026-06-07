"use client";

import * as React from "react";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Smartphone,
  X,
} from "lucide-react";

const CLOSE_MS = 220;

interface TextUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TextUploadDialog({ isOpen, onClose }: TextUploadDialogProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [phone, setPhone] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
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
    setPhone("");
    setError(null);
    setSuccess(false);
    setMessageHref(null);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 120);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

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
      setSuccess(true);
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
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#ffde59]/30">
              <Smartphone className="h-5 w-5 text-gray-900" />
            </span>
            <div>
              <h2 id="text-upload-title" className="text-base font-semibold text-gray-900">
                Text Upload
              </h2>
              <p className="text-sm text-gray-500">Create a listing from Messages.</p>
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

        {success ? (
          <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-7 text-center sm:pb-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#ffde59]/30">
              <CheckCircle2 className="h-7 w-7 text-gray-900" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">Opening Messages...</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              If Messages does not open automatically, use the button below.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              {messageHref && (
                <a
                  href={messageHref}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#ffde59] px-4 text-sm font-semibold text-gray-900 transition-transform hover:-translate-y-0.5"
                >
                  <MessageCircle className="h-4 w-4" />
                  Open Messages
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-gray-200 px-4 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:pb-6">
            <p className="text-sm leading-relaxed text-gray-600">
              Enter your mobile number. Messages will open ready to send — you can text &quot;nest&quot; or &quot;new product listing&quot;, then add photos.
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
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
