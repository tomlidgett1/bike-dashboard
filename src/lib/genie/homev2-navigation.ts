export const HOMEV2_PENDING_PROMPT_KEY = "homev2-pending-prompt";
export const HOMEV2_CONVERSATION_QUERY = "conversation";

export function homeConversationUrl(conversationId: string) {
  return `/settings/store/home?${HOMEV2_CONVERSATION_QUERY}=${encodeURIComponent(conversationId)}`;
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
