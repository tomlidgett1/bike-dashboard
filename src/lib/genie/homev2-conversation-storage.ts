import type { GenieJob } from "@/lib/genie/genie-job-types";

export const HISTORY_STORAGE_KEY = "homev2-genie-conversations";

export type HomeV2StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  charts?: unknown[];
  tables?: unknown[];
  pivotTables?: unknown[];
  proposals?: unknown[];
  products?: unknown[];
  webImages?: unknown[];
  workorders?: unknown;
  customerProfile?: unknown;
  gmailEmails?: unknown;
  analysisPlan?: unknown;
  analysisQueries?: unknown[];
  isStreaming?: boolean;
  error?: string;
};

export type HomeV2SavedConversation = {
  id: string;
  title: string;
  updatedAt: string;
  messages: HomeV2StoredMessage[];
  composioSessionIds?: Record<string, string>;
};

export function readConversationHistory(): HomeV2SavedConversation[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(HISTORY_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function writeConversationHistory(conversations: HomeV2SavedConversation[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(conversations.slice(0, 20)));
}

export function upsertConversationHistory(conversation: HomeV2SavedConversation) {
  const next = [
    conversation,
    ...readConversationHistory().filter((entry) => entry.id !== conversation.id),
  ].slice(0, 20);
  writeConversationHistory(next);
  return next;
}

export function homeConversationTitle(messages: HomeV2StoredMessage[]) {
  const firstUser = messages.find((message) => message.role === "user")?.content.trim();
  if (!firstUser) return "New conversation";
  return firstUser.length > 58 ? `${firstUser.slice(0, 57)}…` : firstUser;
}

function messageId(index: number) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `msg-${index}-${Date.now()}`;
}

export function normalizeMessageContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeMessageContent(entry)).join("");
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.content === "string") return record.content;
  }
  if (value == null) return "";
  return String(value);
}

function assistantPayloadHasBody(payload: Record<string, unknown>) {
  if (normalizeMessageContent(payload.content).trim().length > 0) return true;
  return Boolean(
    (payload.charts as unknown[] | undefined)?.length ||
      (payload.tables as unknown[] | undefined)?.length ||
      (payload.pivotTables as unknown[] | undefined)?.length ||
      (payload.proposals as unknown[] | undefined)?.length ||
      (payload.products as unknown[] | undefined)?.length ||
      (payload.webImages as unknown[] | undefined)?.length ||
      payload.workorders ||
      payload.customerProfile ||
      payload.gmailEmails ||
      payload.analysisPlan ||
      (payload.analysisQueries as unknown[] | undefined)?.length,
  );
}

export function conversationHasAssistantBody(conversation: HomeV2SavedConversation) {
  return conversation.messages.some(
    (message) => message.role === "assistant" && assistantPayloadHasBody(message),
  );
}

function storedMessageFromJobAssistant(
  payload: Record<string, unknown>,
  index: number,
  existingId?: string,
): HomeV2StoredMessage {
  return {
    id: existingId ?? messageId(index),
    role: "assistant",
    content: normalizeMessageContent(payload.content),
    charts: payload.charts as HomeV2StoredMessage["charts"],
    tables: payload.tables as HomeV2StoredMessage["tables"],
    pivotTables: payload.pivotTables as HomeV2StoredMessage["pivotTables"],
    proposals: payload.proposals as HomeV2StoredMessage["proposals"],
    products: payload.products as HomeV2StoredMessage["products"],
    webImages: payload.webImages as HomeV2StoredMessage["webImages"],
    workorders: payload.workorders,
    customerProfile: payload.customerProfile,
    gmailEmails: payload.gmailEmails,
    analysisPlan: payload.analysisPlan,
    analysisQueries: payload.analysisQueries as HomeV2StoredMessage["analysisQueries"],
    isStreaming: false,
  };
}

export function buildMinimalHomeV2Conversation(job: GenieJob): HomeV2SavedConversation {
  const userMessage: HomeV2StoredMessage = {
    id: messageId(0),
    role: "user",
    content: job.prompt,
  };

  return {
    id: job.conversationId ?? messageId(1),
    title: homeConversationTitle([userMessage]),
    updatedAt: job.completedAt ?? job.updatedAt,
    messages: [userMessage],
    composioSessionIds: job.metadata.composio_session_ids,
  };
}

function lastUserMessageIndex(messages: HomeV2StoredMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}

function jobMatchesLastUserMessage(job: GenieJob, messages: HomeV2StoredMessage[]) {
  const lastUserIndex = lastUserMessageIndex(messages);
  if (lastUserIndex === -1) return true;

  const lastUserText = normalizeMessageContent(messages[lastUserIndex]?.content).trim();
  const prompt = job.prompt.trim();
  if (!prompt || !lastUserText) return true;
  return prompt === lastUserText || prompt.endsWith(lastUserText);
}

export function mergeCompletedJobIntoConversation(
  conversation: HomeV2SavedConversation,
  job: GenieJob,
): HomeV2SavedConversation {
  if (job.status !== "completed" || !job.result?.assistantMessage) {
    return conversation;
  }

  const payload = job.result.assistantMessage as Record<string, unknown>;
  const messages = [...conversation.messages];
  const lastUserIndex = lastUserMessageIndex(messages);

  if (lastUserIndex === -1) {
    const fallback = buildMinimalHomeV2Conversation(job);
    return {
      ...conversation,
      id: conversation.id || fallback.id,
      title: conversation.title || fallback.title,
      updatedAt: job.completedAt ?? job.updatedAt ?? conversation.updatedAt,
      composioSessionIds: job.metadata.composio_session_ids ?? conversation.composioSessionIds,
      messages: [
        ...fallback.messages,
        storedMessageFromJobAssistant(payload, fallback.messages.length),
      ],
    };
  }

  if (!jobMatchesLastUserMessage(job, messages)) {
    return conversation;
  }

  const existingAssistant = messages[lastUserIndex + 1];
  const assistantMessage = storedMessageFromJobAssistant(
    payload,
    lastUserIndex + 1,
    existingAssistant?.role === "assistant" ? existingAssistant.id : undefined,
  );

  if (existingAssistant?.role === "assistant") {
    messages[lastUserIndex + 1] = assistantMessage;
  } else {
    messages.splice(lastUserIndex + 1, 0, assistantMessage);
  }

  return {
    ...conversation,
    title: conversation.title || homeConversationTitle(messages),
    updatedAt: job.completedAt ?? job.updatedAt ?? conversation.updatedAt,
    composioSessionIds: job.metadata.composio_session_ids ?? conversation.composioSessionIds,
    messages,
  };
}

export function hydrateConversationFromCompletedJob(
  conversation: HomeV2SavedConversation,
  job: GenieJob,
): HomeV2SavedConversation {
  return mergeCompletedJobIntoConversation(conversation, job);
}

export function sanitizeStoredMessages(messages: HomeV2StoredMessage[]): HomeV2StoredMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role === "assistant" ? "assistant" : "user",
    content: normalizeMessageContent(message.content),
    charts: message.charts,
    tables: message.tables,
    pivotTables: message.pivotTables,
    proposals: message.proposals,
    products: message.products,
    webImages: message.webImages,
    workorders: message.workorders,
    customerProfile: message.customerProfile,
    gmailEmails: message.gmailEmails,
    analysisPlan: message.analysisPlan,
    analysisQueries: message.analysisQueries,
    isStreaming: false,
    error: message.error,
  }));
}

export function persistCompletedHomeV2Job(job: GenieJob) {
  if (
    job.metadata.source !== "homev2" ||
    !job.conversationId ||
    job.status !== "completed" ||
    !job.result?.assistantMessage
  ) {
    return;
  }

  const cached = readConversationHistory().find((entry) => entry.id === job.conversationId);
  const hydrated = hydrateConversationFromCompletedJob(
    cached ?? buildMinimalHomeV2Conversation(job),
    job,
  );
  upsertConversationHistory(hydrated);
}

export function mapApiConversationToSaved(
  data: {
    id: string;
    title?: string;
    messages?: unknown[];
    created_at?: string;
  },
  composioSessionIds?: Record<string, string>,
): HomeV2SavedConversation {
  const messages = Array.isArray(data.messages)
    ? data.messages.map((raw, index) => {
        const row = (raw ?? {}) as Record<string, unknown>;
        return {
          id: typeof row.id === "string" ? row.id : messageId(index),
          role: row.role === "assistant" ? "assistant" : "user",
          content: normalizeMessageContent(row.content),
          charts: row.charts as HomeV2StoredMessage["charts"],
          tables: row.tables as HomeV2StoredMessage["tables"],
          pivotTables: row.pivotTables as HomeV2StoredMessage["pivotTables"],
          proposals: row.proposals as HomeV2StoredMessage["proposals"],
          products: row.products as HomeV2StoredMessage["products"],
          webImages: row.webImages as HomeV2StoredMessage["webImages"],
          workorders: row.workorders,
          customerProfile: row.customerProfile,
          gmailEmails: row.gmailEmails,
          analysisPlan: row.analysisPlan,
          analysisQueries: row.analysisQueries as HomeV2StoredMessage["analysisQueries"],
          isStreaming: false,
        } satisfies HomeV2StoredMessage;
      })
    : [];

  return {
    id: data.id,
    title: data.title?.trim() || homeConversationTitle(messages),
    updatedAt: data.created_at ?? new Date().toISOString(),
    messages,
    composioSessionIds,
  };
}
