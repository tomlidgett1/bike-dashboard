"use client";

import * as React from "react";
import { Mic, MicOff } from "lucide-react";
import { Loader2, Soundwave } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  DEFAULT_MAI_VOICE,
  MAI_VOICE_OPTIONS,
  MAI_VOICE_STYLES,
} from "@/lib/voice-live/config";
import { useVoiceLiveSession, type VoiceLiveStatus } from "@/lib/voice-live/use-voice-live-session";

const STATUS_LABELS: Record<VoiceLiveStatus, string> = {
  idle: "Ready",
  connecting: "Connecting…",
  connected: "Connected",
  listening: "Listening",
  thinking: "Thinking…",
  speaking: "Speaking",
  error: "Error",
};

export function MaiVoiceLiveLab() {
  const [voiceName, setVoiceName] = React.useState(DEFAULT_MAI_VOICE);
  const [voiceStyle, setVoiceStyle] = React.useState<string>("");
  const [instructions, setInstructions] = React.useState(
    "You are a friendly bike shop assistant. Keep replies short and conversational — one or two sentences. Use Australian English.",
  );

  const { status, error, transcripts, connect, disconnect, isActive } = useVoiceLiveSession({
    voiceName,
    voiceStyle: voiceStyle as (typeof MAI_VOICE_STYLES)[number] | "",
    instructions,
  });

  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcripts]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="rounded-md border border-border/60 bg-white p-4">
        <p className="text-sm text-muted-foreground">
          Real-time speech-to-speech via Microsoft Voice Live API — MAI-Transcribe-1.5 for input
          and MAI-Voice-2 for output. Requires{" "}
          <code className="text-xs">AZURE_SPEECH_KEY</code> and{" "}
          <code className="text-xs">AZURE_SPEECH_ENDPOINT</code> (or region) in your environment.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="mai-voice">MAI-Voice-2 voice</Label>
          <Select value={voiceName} onValueChange={setVoiceName} disabled={isActive}>
            <SelectTrigger id="mai-voice" className="rounded-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAI_VOICE_OPTIONS.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>
                  {voice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="mai-style">Voice style (optional)</Label>
          <Select
            value={voiceStyle || "none"}
            onValueChange={(value) => setVoiceStyle(value === "none" ? "" : value)}
            disabled={isActive}
          >
            <SelectTrigger id="mai-style" className="rounded-md">
              <SelectValue placeholder="Default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Default</SelectItem>
              {MAI_VOICE_STYLES.map((style) => (
                <SelectItem key={style} value={style}>
                  {style}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="mai-instructions">Assistant instructions</Label>
        <Textarea
          id="mai-instructions"
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          disabled={isActive}
          rows={3}
          className="rounded-md resize-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!isActive ? (
          <Button
            type="button"
            onClick={() => void connect()}
            disabled={status === "connecting"}
            className="rounded-md"
          >
            {status === "connecting" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Mic className="mr-2 size-4" />
            )}
            Start conversation
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={disconnect}
            className="rounded-md"
          >
            <MicOff className="mr-2 size-4" />
            Stop
          </Button>
        )}

        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-white px-3 py-1.5">
          <span
            className={cn(
              "size-2 rounded-full",
              status === "listening" && "bg-emerald-500 animate-pulse",
              status === "speaking" && "bg-amber-500 animate-pulse",
              status === "thinking" || status === "connecting"
                ? "bg-gray-400 animate-pulse"
                : null,
              status === "idle" && "bg-gray-300",
              status === "error" && "bg-red-500",
              status === "connected" && "bg-emerald-400",
            )}
          />
          <span className="text-sm font-medium text-gray-800">{STATUS_LABELS[status]}</span>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-white p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="min-h-[280px] flex-1 rounded-md border border-border/60 bg-white">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <Soundwave className="size-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-800">Transcript</span>
        </div>
        <div ref={scrollRef} className="max-h-[420px] space-y-3 overflow-y-auto p-4">
          {transcripts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Start a session and speak — your words and the assistant reply will appear here.
            </p>
          ) : (
            transcripts.map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  "rounded-md px-3 py-2 text-sm",
                  entry.role === "user"
                    ? "ml-8 bg-gray-100 text-gray-800"
                    : "mr-8 border border-border/60 bg-white text-gray-800",
                  entry.partial && "opacity-70",
                )}
              >
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {entry.role === "user" ? "You" : "Assistant"}
                </span>
                {entry.text}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
