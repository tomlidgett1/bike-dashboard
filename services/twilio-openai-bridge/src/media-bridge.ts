import WebSocket from "ws";
import { getConfig } from "./config.js";
import {
  loadNumberConfig,
  markCallStarted,
  upsertCallSession,
  type TranscriptTurn,
} from "./supabase.js";

type TwilioMediaMessage = {
  event: string;
  streamSid?: string;
  start?: {
    callSid?: string;
    streamSid?: string;
    customParameters?: Record<string, string>;
    mediaFormat?: { encoding?: string; sampleRate?: number };
  };
  media?: { payload?: string; track?: string };
  stop?: { callSid?: string };
};

type OpenAiEvent = {
  type: string;
  delta?: string;
  transcript?: string;
  error?: { message?: string; code?: string };
};

export type CallBridgeMetrics = {
  callSid: string;
  streamSid: string;
  speechStoppedAt?: number;
  responseCreatedAt?: number;
  firstAudioOutAt?: number;
};

export class MediaStreamBridge {
  private twilioWs: WebSocket;
  private openaiWs: WebSocket | null = null;
  private streamSid = "";
  private callSid = "";
  private fromE164 = "";
  private toE164 = "";
  private phoneAiNumberId: string | undefined;
  private model: string;
  private voice: string;
  private instructions: string;
  private transcript: TranscriptTurn[] = [];
  private assistantDraft = "";
  private metrics: CallBridgeMetrics;
  private closed = false;
  private sessionConfigured = false;
  private responseActive = false;
  private assistantSpeaking = false;

  constructor(twilioWs: WebSocket) {
    this.twilioWs = twilioWs;
    const cfg = getConfig();
    this.model = cfg.defaultModel;
    this.voice = cfg.defaultVoice;
    this.instructions = cfg.defaultInstructions;
    this.metrics = { callSid: "", streamSid: "" };

    twilioWs.on("message", (data) => void this.onTwilioMessage(data.toString()));
    twilioWs.on("close", () => void this.close("twilio_closed"));
    twilioWs.on("error", (err) => {
      console.error("[bridge] twilio ws error", err);
      void this.close("twilio_error");
    });
  }

  private log(event: string, extra?: Record<string, unknown>) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event,
        callSid: this.callSid,
        streamSid: this.streamSid,
        ...extra,
      }),
    );
  }

  private sendTwilio(payload: Record<string, unknown>) {
    if (this.twilioWs.readyState === WebSocket.OPEN) {
      this.twilioWs.send(JSON.stringify(payload));
    }
  }

  private sendOpenAi(payload: Record<string, unknown>) {
    if (this.openaiWs?.readyState === WebSocket.OPEN) {
      this.openaiWs.send(JSON.stringify(payload));
    }
  }

  private async onTwilioMessage(raw: string) {
    let message: TwilioMediaMessage;
    try {
      message = JSON.parse(raw) as TwilioMediaMessage;
    } catch {
      return;
    }

    switch (message.event) {
      case "connected":
        break;
      case "start":
        await this.handleStart(message);
        break;
      case "media":
        if (message.media?.payload && message.media.track !== "outbound") {
          this.sendOpenAi({
            type: "input_audio_buffer.append",
            audio: message.media.payload,
          });
        }
        break;
      case "stop":
        await this.close("twilio_stop");
        break;
      case "mark":
        break;
      default:
        break;
    }
  }

  private async handleStart(message: TwilioMediaMessage) {
    const start = message.start;
    if (!start?.callSid || !start.streamSid) return;

    this.callSid = start.callSid;
    this.streamSid = start.streamSid;
    this.metrics = { callSid: this.callSid, streamSid: this.streamSid };

    const custom = start.customParameters ?? {};
    this.fromE164 = custom.From ?? custom.from ?? "";
    this.toE164 = custom.To ?? custom.to ?? "";

    const numberConfig = this.toE164 ? await loadNumberConfig(this.toE164) : null;
    const { supabaseUrl } = getConfig();
    if (supabaseUrl && this.toE164 && !numberConfig) {
      this.log("number_not_enabled", { to: this.toE164 });
      await this.close("number_not_enabled");
      return;
    }

    if (numberConfig) {
      this.phoneAiNumberId = numberConfig.id;
      this.model = numberConfig.openai_model;
      this.voice = numberConfig.voice;
      this.instructions = numberConfig.instructions;
    }

    await upsertCallSession({
      callSid: this.callSid,
      streamSid: this.streamSid,
      fromE164: this.fromE164,
      toE164: this.toE164,
      status: "ringing",
      phoneAiNumberId: this.phoneAiNumberId,
    });

    await this.connectOpenAi();
  }

  private async connectOpenAi() {
    const { openaiApiKey, transcribeInput, reasoningEffort } = getConfig();
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.model)}`;

    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
      },
    });

    this.openaiWs = ws;

    ws.on("open", () => {
      this.log("openai_connected");
      const inputAudio: Record<string, unknown> = {
        format: { type: "audio/pcmu" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.55,
          prefix_padding_ms: 250,
          silence_duration_ms: 450,
          create_response: true,
          interrupt_response: true,
        },
      };
      if (transcribeInput) {
        inputAudio.transcription = { model: "whisper-1" };
      }

      const session: Record<string, unknown> = {
        type: "realtime",
        model: this.model,
        output_modalities: ["audio"],
        instructions: `${this.instructions}\n\nWhen the call connects, greet the caller briefly in one natural sentence and ask how you can help.`,
        audio: {
          input: inputAudio,
          output: {
            format: { type: "audio/pcmu" },
            voice: this.voice,
          },
        },
        max_output_tokens: 250,
      };

      if (this.model.includes("realtime-2")) {
        session.reasoning = { effort: reasoningEffort };
      }

      this.sendOpenAi({ type: "session.update", session });
    });

    ws.on("message", (data) => void this.onOpenAiMessage(data.toString()));
    ws.on("close", () => {
      this.log("openai_disconnected");
      // Keep Twilio stream alive; VAD may still recover if OpenAI reconnects.
      this.responseActive = false;
      this.assistantSpeaking = false;
    });
    ws.on("error", (err) => {
      console.error("[bridge] openai ws error", err);
      this.log("openai_ws_error", { message: String(err) });
    });
  }

  private appendTranscript(role: "user" | "assistant", text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.transcript.push({ role, text: trimmed, at: new Date().toISOString() });
  }

  private handleBargeIn() {
    if (!this.responseActive && !this.assistantSpeaking) return;

    if (this.responseActive) {
      this.sendOpenAi({ type: "response.cancel" });
    }
    if (this.assistantSpeaking) {
      this.sendTwilio({ event: "clear", streamSid: this.streamSid });
    }
    this.assistantDraft = "";
    this.assistantSpeaking = false;
    this.log("barge_in");
  }

  private async onOpenAiMessage(raw: string) {
    let event: OpenAiEvent;
    try {
      event = JSON.parse(raw) as OpenAiEvent;
    } catch {
      return;
    }

    switch (event.type) {
      case "session.updated":
        if (!this.sessionConfigured) {
          this.sessionConfigured = true;
          await markCallStarted(this.callSid);
          this.log("session_ready");
        }
        break;

      case "input_audio_buffer.speech_started":
        this.handleBargeIn();
        break;

      case "input_audio_buffer.speech_stopped":
        this.metrics.speechStoppedAt = Date.now();
        this.metrics.firstAudioOutAt = undefined;
        this.log("speech_stopped");
        break;

      case "response.created":
        this.responseActive = true;
        this.metrics.responseCreatedAt = Date.now();
        this.assistantDraft = "";
        break;

      case "response.done":
      case "response.completed":
      case "response.output_audio.done":
      case "response.audio.done":
        this.responseActive = false;
        this.assistantSpeaking = false;
        break;

      case "response.audio.delta":
      case "response.output_audio.delta":
        if (event.delta) {
          this.assistantSpeaking = true;
          if (!this.metrics.firstAudioOutAt) {
            this.metrics.firstAudioOutAt = Date.now();
            const latencyMs =
              this.metrics.speechStoppedAt != null
                ? this.metrics.firstAudioOutAt - this.metrics.speechStoppedAt
                : null;
            this.log("first_audio_out", { latencyMs });
          }
          this.sendTwilio({
            event: "media",
            streamSid: this.streamSid,
            media: { payload: event.delta },
          });
        }
        break;

      case "response.audio_transcript.delta":
      case "response.output_audio_transcript.delta":
        if (event.delta) this.assistantDraft += event.delta;
        break;

      case "response.audio_transcript.done":
      case "response.output_audio_transcript.done":
        this.appendTranscript("assistant", event.transcript ?? this.assistantDraft);
        this.assistantDraft = "";
        break;

      case "conversation.item.input_audio_transcription.completed":
        if (event.transcript) this.appendTranscript("user", event.transcript);
        break;

      case "error": {
        const code = event.error?.code ?? "";
        // Benign race conditions during barge-in / duplicate session events.
        if (
          code === "response_cancel_not_active" ||
          code === "conversation_already_has_active_response"
        ) {
          break;
        }
        this.log("openai_error", {
          message: event.error?.message,
          code,
        });
        break;
      }

      default:
        break;
    }
  }

  private async close(reason: string) {
    if (this.closed) return;
    this.closed = true;

    const latencyMetrics: Record<string, unknown> = {
      reason,
      speechToFirstAudioMs:
        this.metrics.speechStoppedAt && this.metrics.firstAudioOutAt
          ? this.metrics.firstAudioOutAt - this.metrics.speechStoppedAt
          : null,
      responseCreatedMs:
        this.metrics.speechStoppedAt && this.metrics.responseCreatedAt
          ? this.metrics.responseCreatedAt - this.metrics.speechStoppedAt
          : null,
    };

    if (this.callSid) {
      await upsertCallSession({
        callSid: this.callSid,
        streamSid: this.streamSid,
        fromE164: this.fromE164,
        toE164: this.toE164,
        status: reason.includes("error") ? "failed" : "completed",
        phoneAiNumberId: this.phoneAiNumberId,
        transcript: this.transcript,
        latencyMetrics,
        errorMessage: reason.includes("error") ? reason : undefined,
      });
    }

    this.log("closed", latencyMetrics);

    if (this.openaiWs && this.openaiWs.readyState === WebSocket.OPEN) {
      this.openaiWs.close();
    }
    if (this.twilioWs.readyState === WebSocket.OPEN) {
      this.twilioWs.close();
    }
  }
}
