import { VOICE_LIVE_SAMPLE_RATE } from "./config";

export function float32ToPcm16Base64(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToPcm16Float32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(bytes.length / 2);
  for (let i = 0; i < samples.length; i++) {
    const int16 = view.getInt16(i * 2, true);
    samples[i] = int16 / (int16 < 0 ? 0x8000 : 0x7fff);
  }
  return samples;
}

export function downsampleBuffer(
  buffer: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number = VOICE_LIVE_SAMPLE_RATE,
): Float32Array {
  if (inputSampleRate === outputSampleRate) return buffer;

  const ratio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const index = i * ratio;
    const lower = Math.floor(index);
    const upper = Math.min(lower + 1, buffer.length - 1);
    const weight = index - lower;
    result[i] = (buffer[lower] ?? 0) * (1 - weight) + (buffer[upper] ?? 0) * weight;
  }

  return result;
}

export class Pcm16AudioPlayer {
  private context: AudioContext | null = null;
  private nextStartTime = 0;

  async ensureContext(): Promise<AudioContext> {
    if (!this.context || this.context.state === "closed") {
      this.context = new AudioContext({ sampleRate: VOICE_LIVE_SAMPLE_RATE });
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    return this.context;
  }

  async playBase64Chunk(base64: string): Promise<void> {
    const context = await this.ensureContext();
    const samples = base64ToPcm16Float32(base64);
    const audioBuffer = context.createBuffer(1, samples.length, VOICE_LIVE_SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(samples);

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);

    const now = context.currentTime;
    const startAt = Math.max(now, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + audioBuffer.duration;
  }

  reset(): void {
    this.nextStartTime = 0;
  }

  stop(): void {
    if (this.context && this.context.state !== "closed") {
      void this.context.close();
    }
    this.context = null;
    this.nextStartTime = 0;
  }
}
