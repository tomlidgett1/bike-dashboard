import type { NestConversationDetail, NestConversationMessage } from "@/lib/nest/types";

function messageKey(message: NestConversationMessage): string {
  const createdAt = message.createdAt ?? "";
  return `${message.role}:${message.handle ?? ""}:${createdAt}:${message.content}`;
}

/** Union two thread copies, preferring the row with the higher Nest message id on clashes. */
export function mergeNestConversationThreads(
  primary: NestConversationDetail,
  secondary: NestConversationDetail | null | undefined,
): NestConversationDetail {
  if (!secondary || secondary.chatId !== primary.chatId) return primary;

  const merged = new Map<string, NestConversationMessage>();
  for (const message of [...secondary.messages, ...primary.messages]) {
    const key = messageKey(message);
    const existing = merged.get(key);
    if (
      !existing ||
      (message.id > 0 && existing.id < 0) ||
      (message.id > 0 && existing.id > 0 && message.id < existing.id)
    ) {
      merged.set(key, message);
    }
  }

  const messages = [...merged.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return {
    ...primary,
    displayName: primary.displayName || secondary.displayName,
    title: primary.title || secondary.title,
    participantHandle: primary.participantHandle || secondary.participantHandle,
    messages,
  };
}
