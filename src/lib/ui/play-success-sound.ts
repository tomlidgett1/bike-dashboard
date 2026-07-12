let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) audioContext = new Ctx();
  return audioContext;
}

async function withContext(
  play: (ctx: AudioContext, now: number) => void,
): Promise<void> {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    play(ctx, ctx.currentTime);
  } catch {
    // Ignore audio failures (permissions, unsupported browsers, etc.)
  }
}

/** Soft two-tone success ping after approving a brand/category. */
export async function playSuccessSound() {
  await withContext((ctx, now) => {
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    const playTone = (frequency: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, start);
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + duration);
    };

    playTone(880, now, 0.08);
    playTone(1318.5, now + 0.07, 0.12);
  });
}

/** Attention chime when the Action Required popup appears. */
export async function playActionRequiredAppearSound() {
  await withContext((ctx, now) => {
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.11, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

    const playTone = (frequency: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, start);
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + duration);
    };

    playTone(660, now, 0.12);
    playTone(880, now + 0.11, 0.16);
    playTone(1174.66, now + 0.22, 0.18);
  });
}
