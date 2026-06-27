"use client";

import * as React from "react";
import {
  DEFAULT_MAI_VOICE,
  VOICE_LIVE_SAMPLE_RATE,
  type MAI_VOICE_STYLES,
} from "@/lib/voice-live/config";
import {
  Pcm16AudioPlayer,
  downsampleBuffer,
  float32ToPcm16Base64,
} from "@/lib/voice-live/audio-utils";

export type VoiceLiveStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export type TranscriptEntry = {
  id: string;
  role: "user" | "assistant";
  text: string;
  partial?: boolean;
};

type UseVoiceLiveSessionOptions = {
  voiceName?: string;
  voiceStyle?: (typeof MAI_VOICE_STYLES)[number] | "";
  instructions?: string;
};

type ServerEvent = {
  type: string;
  error?: { message?: string };
  transcript?: string;
  delta?: string;
  session?: Record<string, unknown>;
};

export function useVoiceLiveSession(options: UseVoiceLiveSessionOptions = {}) {
  const voiceName = options.voiceName ?? DEFAULT_MAI_VOICE;
  const voiceStyle = options.voiceStyle ?? "";
  const instructions =
    options.instructions ??
    "You are a friendly bike shop assistant. Keep replies short and conversational — one or two sentences. Use Australian English.";

  const [status, setStatus] = React.useState<VoiceLiveStatus>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [transcripts, setTranscripts] = React.useState<TranscriptEntry[]>([]);
  const [sessionReady, setSessionReady] = React.useState(false);

  const wsRef = React.useRef<WebSocket | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const processorRef = React.useRef<ScriptProcessorNode | null>(null);
  const playerRef = React.useRef(new Pcm16AudioPlayer());
  const assistantDraftRef = React.useRef<string>("");
  const assistantEntryIdRef = React.useRef<string | null>(null);
  const sessionReadyRef = React.useRef(false);
  const intentionalCloseRef = React.useRef(false);

  const appendTranscript = React.useCallback(
    (role: "user" | "assistant", text: string, partial = false) => {
      const id = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setTranscripts((prev) => [...prev, { id, role, text, partial }]);
      return id;
    },
    [],
  );

  const updateAssistantDraft = React.useCallback((delta: string, done: boolean) => {
    assistantDraftRef.current += delta;

    setTranscripts((prev) => {
      const existingId = assistantEntryIdRef.current;
      if (!existingId) {
        const id = `assistant-${Date.now()}`;
        assistantEntryIdRef.current = id;
        return [...prev, { id, role: "assistant", text: assistantDraftRef.current, partial: !done }];
      }

      return prev.map((entry) =>
        entry.id === existingId
          ? { ...entry, text: assistantDraftRef.current, partial: !done }
          : entry,
      );
    });

    if (done) {
      assistantDraftRef.current = "";
      assistantEntryIdRef.current = null;
    }
  }, []);

  const sendEvent = React.useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const configureSession = React.useCallback(() => {
    const voice: Record<string, unknown> = {
      type: "azure-standard",
      name: voiceName,
      locale: voiceName.startsWith("en-AU") ? "en-AU" : "en-US",
    };
    if (voiceStyle) {
      voice.style = voiceStyle;
    }

    sendEvent({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions,
        voice,
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_sampling_rate: VOICE_LIVE_SAMPLE_RATE,
        input_audio_transcription: {
          model: "mai-transcribe",
        },
        turn_detection: {
          type: "azure_semantic_vad",
          silence_duration_ms: 500,
          remove_filler_words: true,
          create_response: true,
          interrupt_response: true,
        },
        input_audio_noise_reduction: { type: "azure_deep_noise_suppression" },
        input_audio_echo_cancellation: { type: "server_echo_cancellation" },
        temperature: 0.8,
        max_response_output_tokens: 300,
      },
    });
  }, [instructions, sendEvent, voiceName, voiceStyle]);

  const stopMicCapture = React.useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
    }
    audioContextRef.current = null;

    for (const track of mediaStreamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    mediaStreamRef.current = null;
  }, []);

  const startMicCapture = React.useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    mediaStreamRef.current = stream;

    const context = new AudioContext();
    audioContextRef.current = context;

    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (event) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN || !sessionReadyRef.current) return;

      const input = event.inputBuffer.getChannelData(0);
      const resampled = downsampleBuffer(input, context.sampleRate, VOICE_LIVE_SAMPLE_RATE);
      const audio = float32ToPcm16Base64(resampled);

      sendEvent({
        type: "input_audio_buffer.append",
        audio,
      });
    };

    source.connect(processor);
    processor.connect(context.destination);
  }, [sendEvent]);

  const disconnect = React.useCallback(() => {
    intentionalCloseRef.current = true;
    stopMicCapture();
    playerRef.current.stop();
    playerRef.current = new Pcm16AudioPlayer();
    sessionReadyRef.current = false;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setSessionReady(false);
    setStatus("idle");
    intentionalCloseRef.current = false;
  }, [stopMicCapture]);

  const connect = React.useCallback(async () => {
    if (status === "connecting" || status === "connected") return;

    setError(null);
    setStatus("connecting");

    try {
      const response = await fetch("/api/voice-live/session", { method: "POST" });
      const payload = (await response.json()) as {
        websocketUrl?: string;
        error?: string;
        message?: string;
      };

      if (!response.ok || !payload.websocketUrl) {
        throw new Error(payload.message ?? payload.error ?? "Failed to start voice session");
      }

      const ws = new WebSocket(payload.websocketUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        configureSession();
        void startMicCapture();
      };

      ws.onmessage = async (message) => {
        let event: ServerEvent;
        try {
          event = JSON.parse(message.data as string) as ServerEvent;
        } catch {
          return;
        }

        switch (event.type) {
          case "session.created":
          case "session.updated":
            sessionReadyRef.current = true;
            setSessionReady(true);
            setStatus("listening");
            break;
          case "input_audio_buffer.speech_started":
            setStatus("listening");
            playerRef.current.reset();
            break;
          case "input_audio_buffer.speech_stopped":
            setStatus("thinking");
            break;
          case "conversation.item.input_audio_transcription.completed":
            if (event.transcript?.trim()) {
              appendTranscript("user", event.transcript.trim());
            }
            break;
          case "response.created":
            setStatus("thinking");
            assistantDraftRef.current = "";
            assistantEntryIdRef.current = null;
            break;
          case "response.audio.delta":
            if (event.delta) {
              setStatus("speaking");
              await playerRef.current.playBase64Chunk(event.delta);
            }
            break;
          case "response.audio_transcript.delta":
            if (event.delta) updateAssistantDraft(event.delta, false);
            break;
          case "response.audio_transcript.done": {
            const finalText = event.transcript ?? assistantDraftRef.current;
            assistantDraftRef.current = "";
            const existingId = assistantEntryIdRef.current;
            if (existingId) {
              setTranscripts((prev) =>
                prev.map((entry) =>
                  entry.id === existingId
                    ? { ...entry, text: finalText, partial: false }
                    : entry,
                ),
              );
            } else if (finalText.trim()) {
              appendTranscript("assistant", finalText.trim());
            }
            assistantEntryIdRef.current = null;
            break;
          }
          case "response.done":
            setStatus("listening");
            break;
          case "error":
            setError(event.error?.message ?? "Voice Live API error");
            setStatus("error");
            break;
          default:
            break;
        }
      };

      ws.onerror = () => {
        setError("WebSocket connection error");
        setStatus("error");
      };

      ws.onclose = () => {
        stopMicCapture();
        sessionReadyRef.current = false;
        setSessionReady(false);
        if (!intentionalCloseRef.current) {
          setStatus("idle");
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      setStatus("error");
      disconnect();
    }
  }, [
    appendTranscript,
    configureSession,
    disconnect,
    startMicCapture,
    status,
    stopMicCapture,
    updateAssistantDraft,
  ]);

  React.useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    status,
    error,
    transcripts,
    sessionReady,
    connect,
    disconnect,
    isActive: status !== "idle" && status !== "error",
  };
}
