export const HOMEV2_PENDING_PROMPT_KEY = "homev2-pending-prompt";
export const HOMEV2_CONVERSATION_QUERY = "conversation";
export const HOMEV2_HOME_PATH = "/settings/store/home";

/**
 * Fired after a header prompt is queued so an already-mounted home page can
 * pick it up and open a fresh chat (the on-mount consumer only runs once).
 */
export const HOMEV2_PROMPT_EVENT = "genie:homev2-prompt";

export function homeConversationUrl(conversationId: string) {
  return `/settings/store/home?${HOMEV2_CONVERSATION_QUERY}=${encodeURIComponent(conversationId)}`;
}

export function emitHomeV2PromptSignal() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(HOMEV2_PROMPT_EVENT));
}

export function queueHomeV2Prompt(prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed || typeof window === "undefined") return false;
  sessionStorage.setItem(HOMEV2_PENDING_PROMPT_KEY, trimmed);
  return true;
}

export function consumeHomeV2PendingPrompt(): string | null {
  if (typeof window === "undefined") return null;
  const pending = sessionStorage.getItem(HOMEV2_PENDING_PROMPT_KEY)?.trim();
  if (!pending) return null;
  sessionStorage.removeItem(HOMEV2_PENDING_PROMPT_KEY);
  return pending;
}
