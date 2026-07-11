import { getOptionalEnv, requireAnyEnv } from "./env.ts";
import { internalJsonHeaders } from "./internal-auth.ts";
import type { ExtractedMedia, NormalisedIncomingMessage } from "./linq.ts";
import * as linqApi from "./linq.ts";
import { normaliseToE164 } from "./phone-normalise.ts";
import { getAdminClient } from "./supabase.ts";
import { addMessageStrict, logOutboundMessage } from "./state.ts";
import {
  decideUploadTurn,
  type UploadAction,
} from "./yellow-jersey-upload-agent.ts";

const UPLOAD_PHONE_ROUTES_TABLE = "yellow_jersey_upload_phone_routes";
const UPLOAD_SESSIONS_TABLE = "yellow_jersey_upload_sessions";
// Yellow Jersey caps a single listing at 10 photos server-side and splits
// multi-product uploads into separate listings automatically.
const MAX_UPLOAD_IMAGES = 30;

type UploadSessionStatus =
  | "open"
  | "processing"
  | "ready"
  | "failed"
  | "cancelled";

type UploadSessionRow = {
  id: string;
  phone_e164: string;
  chat_id: string;
  bot_number: string;
  images: unknown;
  status: UploadSessionStatus;
  handoff_url: string | null;
  error: string | null;
  expires_at: string;
};

type HandoffResponse = {
  ok?: boolean;
  handoffUrl?: string;
  error?: string;
};

type RecentMessage = {
  role: "user" | "assistant";
  content: string;
};

function messageContentForHistory(message: NormalisedIncomingMessage): string {
  const text = message.text.trim();
  const imageCount = message.images.length;
  if (text && imageCount > 0) {
    return `${text}\n[${imageCount} photo${imageCount === 1 ? "" : "s"}]`;
  }
  if (text) return text;
  if (imageCount > 0) {
    return `[${imageCount} photo${imageCount === 1 ? "" : "s"}]`;
  }
  return "[empty message]";
}

async function safeAddMessage(
  message: NormalisedIncomingMessage,
  role: "user" | "assistant",
  content: string,
  handle?: string,
): Promise<void> {
  try {
    await addMessageStrict(message.chatId, role, content, handle, {
      isGroupChat: false,
      service: message.service,
      metadata: {
        source: "yellow_jersey_text_upload",
        image_count: message.images.length,
      },
    });
  } catch (error) {
    console.warn("[yellow-jersey-upload] conversation log failed:", error);
  }
}

async function sendUploadMessage(
  message: NormalisedIncomingMessage,
  text: string,
): Promise<void> {
  const response = await linqApi.sendMessage(message.chatId, text);
  await logOutboundMessage(
    message.chatId,
    "text",
    {
      text,
      productRoute: "yellow-jersey-upload",
    },
    "sent",
    response.message?.id,
  );
  await safeAddMessage(message, "assistant", text);
}

function normaliseStoredImages(value: unknown): ExtractedMedia[] {
  if (!Array.isArray(value)) return [];

  const images: ExtractedMedia[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const url = typeof row.url === "string" ? row.url.trim() : "";
    if (!url) continue;

    images.push({
      url,
      mimeType: typeof row.mimeType === "string"
        ? row.mimeType
        : typeof row.mime_type === "string"
        ? row.mime_type
        : "image/jpeg",
      filename: typeof row.filename === "string" ? row.filename : undefined,
      attachmentId: typeof row.attachmentId === "string"
        ? row.attachmentId
        : typeof row.attachment_id === "string"
        ? row.attachment_id
        : undefined,
    });
  }

  return images;
}

function dedupeImages(images: ExtractedMedia[]): ExtractedMedia[] {
  const seen = new Set<string>();
  const result: ExtractedMedia[] = [];

  for (const image of images) {
    const key = image.attachmentId || image.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(image);
    if (result.length >= MAX_UPLOAD_IMAGES) break;
  }

  return result;
}

function textUploadEndpoint(): string {
  const explicit = getOptionalEnv("YELLOW_JERSEY_TEXT_UPLOAD_SESSION_URL");
  if (explicit) return explicit;

  const base = getOptionalEnv("YELLOW_JERSEY_PUBLIC_URL") ??
    getOptionalEnv("YELLOW_JERSEY_APP_URL") ??
    getOptionalEnv("NEXT_PUBLIC_YELLOW_JERSEY_URL");

  if (!base) {
    throw new Error(
      "YELLOW_JERSEY_TEXT_UPLOAD_SESSION_URL or YELLOW_JERSEY_PUBLIC_URL is not configured",
    );
  }

  return `${base.replace(/\/+$/, "")}/api/marketplace/text-upload/sessions`;
}

function yellowJerseyHandoffSecret(): string {
  return requireAnyEnv(
    "YELLOW_JERSEY_INTERNAL_SECRET",
    "NEST_SUPABASE_SECRET_KEY",
    "NEW_SUPABASE_SECRET_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SECRET_KEYS",
    "INTERNAL_EDGE_SHARED_SECRET",
    "NEST_INTERNAL_EDGE_SHARED_SECRET",
  );
}

async function loadRecentMessages(chatId: string): Promise<RecentMessage[]> {
  const { data, error } = await getAdminClient()
    .from("conversation_messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.warn("[yellow-jersey-upload] recent message load failed:", error.message);
    return [];
  }

  return ((data ?? []) as Array<{ role: string; content: string }>)
    .reverse()
    .filter((row) =>
      row.role === "user" || row.role === "assistant"
    )
    .map((row) => ({
      role: row.role as "user" | "assistant",
      content: row.content,
    }));
}

async function loadActiveSession(
  chatId: string,
  phoneE164: string,
): Promise<UploadSessionRow | null> {
  const { data, error } = await getAdminClient()
    .from(UPLOAD_SESSIONS_TABLE)
    .select(
      "id, phone_e164, chat_id, bot_number, images, status, handoff_url, error, expires_at",
    )
    .eq("chat_id", chatId)
    .eq("phone_e164", phoneE164)
    .in("status", ["open", "processing", "ready", "failed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<UploadSessionRow>();

  if (error) {
    throw new Error(`upload session read failed: ${error.message}`);
  }

  if (!data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  return data;
}

async function createSession(
  message: NormalisedIncomingMessage,
  phoneE164: string,
): Promise<UploadSessionRow> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await getAdminClient()
    .from(UPLOAD_SESSIONS_TABLE)
    .insert({
      phone_e164: phoneE164,
      chat_id: message.chatId,
      bot_number: message.conversation.fromNumber,
      images: [],
      status: "open",
      expires_at: expiresAt,
    })
    .select(
      "id, phone_e164, chat_id, bot_number, images, status, handoff_url, error, expires_at",
    )
    .single<UploadSessionRow>();

  if (error || !data) {
    throw new Error(
      `upload session create failed: ${error?.message ?? "no row returned"}`,
    );
  }

  return data;
}

async function setSessionImages(
  sessionId: string,
  images: ExtractedMedia[],
): Promise<void> {
  const { error } = await getAdminClient()
    .from(UPLOAD_SESSIONS_TABLE)
    .update({
      images,
      status: "open",
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (error) {
    throw new Error(`upload session image update failed: ${error.message}`);
  }
}

async function setSessionStatus(
  sessionId: string,
  status: UploadSessionStatus,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await getAdminClient()
    .from(UPLOAD_SESSIONS_TABLE)
    .update({
      status,
      updated_at: new Date().toISOString(),
      ...extra,
    })
    .eq("id", sessionId);

  if (error) {
    throw new Error(`upload session status update failed: ${error.message}`);
  }
}

async function restartUploadSession(
  message: NormalisedIncomingMessage,
  phoneE164: string,
  previousSessionId?: string,
): Promise<UploadSessionRow> {
  if (previousSessionId) {
    await setSessionStatus(previousSessionId, "cancelled");
  }
  return await createSession(message, phoneE164);
}

async function setUploadRouteStatus(
  phoneE164: string,
  status: "completed" | "disabled",
): Promise<void> {
  const { error } = await getAdminClient()
    .from(UPLOAD_PHONE_ROUTES_TABLE)
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("phone_e164", phoneE164);

  if (error) {
    console.warn(
      "[yellow-jersey-upload] route status update failed:",
      error.message,
    );
  }
}

async function reactivateUploadRoute(phoneE164: string): Promise<void> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await getAdminClient()
    .from(UPLOAD_PHONE_ROUTES_TABLE)
    .update({
      status: "active",
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("phone_e164", phoneE164);

  if (error) {
    console.warn(
      "[yellow-jersey-upload] route reactivation failed:",
      error.message,
    );
  }
}

async function createHandoffUrl(params: {
  phoneE164: string;
  images: ExtractedMedia[];
  userText: string;
  chatId: string;
  mode?: "single" | "bulk";
}): Promise<string> {
  const secret = yellowJerseyHandoffSecret();
  const response = await fetch(textUploadEndpoint(), {
    method: "POST",
    headers: internalJsonHeaders(secret),
    body: JSON.stringify({
      phoneE164: params.phoneE164,
      chatId: params.chatId,
      images: params.images,
      mode: params.mode ?? "single",
      userHints: {
        text: params.userText,
        source: "nest_imessage",
      },
    }),
  });

  const data = await response.json().catch(() => ({})) as HandoffResponse;
  if (!response.ok || !data.handoffUrl) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : `Yellow Jersey handoff failed with status ${response.status}`,
    );
  }

  return data.handoffUrl;
}

async function buildHandoffReply(
  message: NormalisedIncomingMessage,
  userText: string,
  handoffUrl: string,
): Promise<string> {
  const decision = await decideUploadTurn({
    userMessage: userText,
    recentMessages: await loadRecentMessages(message.chatId),
    sessionStatus: "ready",
    photosBeforeMessage: 0,
    photosAfterMessage: 0,
    incomingPhotoCount: 0,
    maxImages: MAX_UPLOAD_IMAGES,
    hasHandoffLink: true,
    isProcessing: false,
    previousListingReady: true,
  });

  return `${decision.reply}\n${handoffUrl}`;
}

async function executeUploadAction(params: {
  action: UploadAction;
  reply: string;
  message: NormalisedIncomingMessage;
  phoneE164: string;
  session: UploadSessionRow;
  mergedImages: ExtractedMedia[];
  userText: string;
}): Promise<UploadSessionRow> {
  const {
    action,
    reply,
    message,
    phoneE164,
    session,
    mergedImages,
    userText,
  } = params;

  switch (action) {
    case "start_new": {
      const freshSession = await restartUploadSession(
        message,
        phoneE164,
        session.id,
      );
      await reactivateUploadRoute(phoneE164);

      if (message.images.length > 0) {
        const images = dedupeImages(message.images);
        await setSessionImages(freshSession.id, images);
        const ack = await decideUploadTurn({
          userMessage: userText,
          recentMessages: await loadRecentMessages(message.chatId),
          sessionStatus: "open",
          photosBeforeMessage: 0,
          photosAfterMessage: images.length,
          incomingPhotoCount: message.images.length,
          maxImages: MAX_UPLOAD_IMAGES,
          hasHandoffLink: false,
          isProcessing: false,
          previousListingReady: false,
        });
        await sendUploadMessage(message, ack.reply);
        return { ...freshSession, images };
      }

      await sendUploadMessage(message, reply);
      return freshSession;
    }

    case "cancel": {
      await setSessionStatus(session.id, "cancelled");
      await setUploadRouteStatus(phoneE164, "disabled");
      await sendUploadMessage(message, reply);
      return session;
    }

    case "resend_link": {
      const text = session.handoff_url
        ? `${reply}\n${session.handoff_url}`
        : reply;
      await sendUploadMessage(message, text);
      return session;
    }

    case "finish":
    case "finish_bulk": {
      if (mergedImages.length === 0) {
        await sendUploadMessage(message, reply);
        return session;
      }

      // Send every photo either way — Yellow Jersey groups multi-product
      // uploads into separate listings automatically, even on a plain finish.
      const isBulk = action === "finish_bulk" && mergedImages.length > 1;
      const listingImages = mergedImages;

      await setSessionImages(session.id, listingImages);
      await setSessionStatus(session.id, "processing", {
        images: listingImages,
        error: null,
      });
      await sendUploadMessage(message, reply);

      try {
        // Hand the seller's whole side of the conversation to the listing
        // builder so anything they wanted highlighted makes it in.
        // The current message is already in conversation history.
        const recent = await loadRecentMessages(message.chatId);
        const listingNotes = recent
          .filter((row) => row.role === "user")
          .map((row) => row.content.replace(/\[\d+ photos?\]/g, "").trim())
          .filter(Boolean)
          .join("\n")
          .slice(-2000) || userText;

        const handoffUrl = await createHandoffUrl({
          phoneE164,
          images: listingImages,
          userText: listingNotes,
          chatId: message.chatId,
          mode: isBulk ? "bulk" : "single",
        });

        await setSessionStatus(session.id, "ready", {
          handoff_url: handoffUrl,
          error: null,
        });
        await reactivateUploadRoute(phoneE164);
        await sendUploadMessage(
          message,
          await buildHandoffReply(message, userText, handoffUrl),
        );
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : "unknown error";
        console.error("[yellow-jersey-upload] handoff failed:", error);
        await setSessionStatus(session.id, "failed", {
          error: errorMessage.slice(0, 1000),
        });
        const retry = await decideUploadTurn({
          userMessage: "the listing build failed",
          recentMessages: await loadRecentMessages(message.chatId),
          sessionStatus: "failed",
          photosBeforeMessage: mergedImages.length,
          photosAfterMessage: mergedImages.length,
          incomingPhotoCount: 0,
          maxImages: MAX_UPLOAD_IMAGES,
          hasHandoffLink: false,
          isProcessing: false,
          previousListingReady: false,
        });
        await sendUploadMessage(message, retry.reply);
      }

      return session;
    }

    case "chat":
    default: {
      if (message.images.length > 0) {
        await setSessionImages(session.id, mergedImages);
      }
      await sendUploadMessage(message, reply);
      return session;
    }
  }
}

export async function handleYellowJerseyUploadTurn(
  message: NormalisedIncomingMessage,
): Promise<void> {
  const phoneE164 = normaliseToE164(message.from);
  if (!phoneE164) {
    await sendUploadMessage(
      message,
      "Hmm, I couldn't read your number properly — try again from Text Upload on Yellow Jersey.",
    );
    return;
  }

  await safeAddMessage(
    message,
    "user",
    messageContentForHistory(message),
    message.from,
  );

  let session = await loadActiveSession(message.chatId, phoneE164);
  if (!session) {
    session = await createSession(message, phoneE164);
  }

  // The previous listing is already built — any new photos belong to a fresh
  // listing, never the finished one. Roll the session over automatically so
  // old photos don't leak into the next item.
  if (session.status === "ready" && message.images.length > 0) {
    session = await restartUploadSession(message, phoneE164, session.id);
    await reactivateUploadRoute(phoneE164);
  }

  const userText = message.text.trim();
  const existingImages = normaliseStoredImages(session.images);
  const mergedImages = dedupeImages([...existingImages, ...message.images]);
  const recentMessages = await loadRecentMessages(message.chatId);

  const decision = await decideUploadTurn({
    userMessage: userText,
    recentMessages,
    sessionStatus: session.status,
    photosBeforeMessage: existingImages.length,
    photosAfterMessage: mergedImages.length,
    incomingPhotoCount: message.images.length,
    maxImages: MAX_UPLOAD_IMAGES,
    hasHandoffLink: Boolean(session.handoff_url),
    isProcessing: session.status === "processing",
    previousListingReady: session.status === "ready",
  });

  await executeUploadAction({
    action: decision.action,
    reply: decision.reply,
    message,
    phoneE164,
    session,
    mergedImages,
    userText,
  });
}
