export const METRICS_PENDING_PROMPT_KEY = "metrics-pending-prompt";
export const METRICS_PROMPT_EVENT = "genie:metrics-prompt";
export const METRICS_PATH = "/settings/store/metrics";

export function emitMetricsPromptSignal() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(METRICS_PROMPT_EVENT));
}

export function queueMetricsPrompt(prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed || typeof window === "undefined") return false;
  sessionStorage.setItem(METRICS_PENDING_PROMPT_KEY, trimmed);
  return true;
}

export function consumeMetricsPendingPrompt(): string | null {
  if (typeof window === "undefined") return null;
  const pending = sessionStorage.getItem(METRICS_PENDING_PROMPT_KEY)?.trim();
  if (!pending) return null;
  sessionStorage.removeItem(METRICS_PENDING_PROMPT_KEY);
  return pending;
}
