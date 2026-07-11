"use client";

import * as React from "react";
import { Loader2, Microphone } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { buildSignedComposeDraft } from "@/lib/nest/compose-quick-actions";
import { cn } from "@/lib/utils";

export type NestComposeDictationStep = "recording" | "transcribing";

const MAX_RECORDING_MS = 2 * 60 * 1000;

/** Quiet prompts shown as the textarea placeholder while recording. First line is brain-dump. */
export const NEST_COMPOSE_RECORDING_PLACEHOLDERS = [
  "Brain dump freely…",
  "Just talk…",
  "We'll tidy it up…",
  "Say whatever comes to mind…",
] as const;

const RECORDING_PLACEHOLDER_ROTATE_MS = 3000;

/** Cycles recording placeholder text every ~3s. Returns static "Writing…" when transcribing. */
export function useNestComposeDictationPlaceholder(
  step: NestComposeDictationStep | null,
): string | null {
  const [index, setIndex] = React.useState(0);
  const recording = step === "recording";

  React.useEffect(() => {
    if (!recording) {
      setIndex(0);
      return;
    }
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % NEST_COMPOSE_RECORDING_PLACEHOLDERS.length);
    }, RECORDING_PLACEHOLDER_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [recording]);

  if (step === "transcribing") return "Writing…";
  if (step === "recording") {
    return NEST_COMPOSE_RECORDING_PLACEHOLDERS[index] ?? NEST_COMPOSE_RECORDING_PLACEHOLDERS[0];
  }
  return null;
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

async function distilDictation(args: {
  audio: Blob;
  mimeType: string;
  customerName?: string | null;
}): Promise<{ body: string }> {
  const form = new FormData();
  form.append("audio", new File([args.audio], "dictation", { type: args.mimeType }));
  if (args.customerName?.trim()) form.append("customerName", args.customerName.trim());

  const res = await fetch("/api/store/nest-compose-dictate", {
    method: "POST",
    body: form,
    credentials: "same-origin",
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    if (res.status === 401 || res.status === 307 || res.status === 308) {
      throw new Error("Session expired — refresh the page and try again.");
    }
    throw new Error("Dictation failed — unexpected server response.");
  }

  const data = (await res.json()) as { body?: string; error?: string };
  if (!res.ok) throw new Error(data.error || "Dictation failed.");
  return { body: String(data.body ?? "") };
}

/**
 * Headless recorder — same pattern as workorders DictationSession:
 * mount when active → getUserMedia → MediaRecorder.start() (no timeslice).
 * UI lives on the mic button in NestComposePill.
 */
export function NestComposeDictation({
  active,
  customerName,
  storeName,
  storePhone,
  signoffTemplate,
  stopRef,
  onStepChange,
  onClose,
  onDraft,
  onError,
}: {
  active: boolean;
  customerName?: string | null;
  storeName: string | null;
  storePhone: string | null;
  signoffTemplate: string;
  stopRef: React.MutableRefObject<(() => void) | null>;
  onStepChange?: (step: NestComposeDictationStep) => void;
  onClose: () => void;
  onDraft: (message: string) => void;
  onError?: (message: string) => void;
}) {
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRef = React.useRef(false);
  const startedRef = React.useRef(false);

  const onCloseRef = React.useRef(onClose);
  const onDraftRef = React.useRef(onDraft);
  const onErrorRef = React.useRef(onError);
  const onStepChangeRef = React.useRef(onStepChange);
  const customerNameRef = React.useRef(customerName);
  const storeNameRef = React.useRef(storeName);
  const storePhoneRef = React.useRef(storePhone);
  const signoffTemplateRef = React.useRef(signoffTemplate);

  onCloseRef.current = onClose;
  onDraftRef.current = onDraft;
  onErrorRef.current = onError;
  onStepChangeRef.current = onStepChange;
  customerNameRef.current = customerName;
  storeNameRef.current = storeName;
  storePhoneRef.current = storePhone;
  signoffTemplateRef.current = signoffTemplate;

  const cleanupRecorder = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      discardRef.current = true;
      recorder.stop();
    }
    recorderRef.current = null;
  }, []);

  const finish = React.useCallback(
    (message?: string, errorMessage?: string) => {
      cleanupRecorder();
      if (message?.trim()) onDraftRef.current(message);
      if (errorMessage) onErrorRef.current?.(errorMessage);
      onCloseRef.current();
    },
    [cleanupRecorder],
  );

  const startRecording = React.useCallback(async () => {
    onStepChangeRef.current?.("recording");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      discardRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (discardRef.current) return;

        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size === 0) {
          finish(undefined, "Nothing recorded — try again.");
          return;
        }

        onStepChangeRef.current?.("transcribing");
        void distilDictation({
          audio: blob,
          mimeType: type,
          customerName: customerNameRef.current,
        })
          .then((result) => {
            const message = buildSignedComposeDraft({
              customerName: customerNameRef.current,
              storeName: storeNameRef.current,
              storePhone: storePhoneRef.current,
              signoffTemplate: signoffTemplateRef.current,
              body: result.body,
            });
            if (!message.trim()) {
              finish(undefined, "Couldn't write a message from that — try again.");
              return;
            }
            finish(message);
          })
          .catch((err) => {
            finish(undefined, err instanceof Error ? err.message : "Dictation failed.");
          });
      };

      recorderRef.current = recorder;
      // Match workorders: start() with no timeslice — blob is collected on stop.
      recorder.start();

      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        if (elapsed >= MAX_RECORDING_MS && recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
        }
      }, 200);
    } catch {
      finish(undefined, "Microphone access is needed — check browser permissions.");
    }
  }, [finish]);

  React.useEffect(() => {
    if (!active) {
      startedRef.current = false;
      cleanupRecorder();
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    void startRecording();
    return cleanupRecorder;
  }, [active, cleanupRecorder, startRecording]);

  const stopRecording = React.useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") recorder.stop();
  }, []);

  React.useEffect(() => {
    stopRef.current = stopRecording;
    return () => {
      stopRef.current = null;
    };
  }, [stopRecording, stopRef]);

  return null;
}

export function NestComposeDictateButton({
  disabled,
  active,
  busy,
  step,
  onClick,
  className,
}: {
  disabled?: boolean;
  active?: boolean;
  busy?: boolean;
  step?: NestComposeDictationStep | null;
  onClick: () => void;
  className?: string;
}) {
  const recording = active && step === "recording";
  const writing = active && step === "transcribing";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={disabled || busy || writing}
      onClick={onClick}
      className={cn(
        "h-8 w-8 shrink-0 rounded-full",
        recording
          ? "bg-gray-900 text-white hover:bg-gray-800 hover:text-white"
          : "text-gray-500 hover:text-gray-700",
        className,
      )}
      aria-label={
        writing ? "Writing message" : recording ? "Stop dictation" : "Dictate message"
      }
      title={writing ? "Writing…" : recording ? "Stop" : "Dictate message"}
    >
      {busy || writing ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : recording ? (
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
        </span>
      ) : (
        <Microphone className="h-5 w-5" />
      )}
    </Button>
  );
}

export function canUseNestComposeDictation(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}
