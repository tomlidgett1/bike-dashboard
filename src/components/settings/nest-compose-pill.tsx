"use client";

import * as React from "react";
import {
  Banknote,
  Bike,
  Loader2,
  Phone,
  Plus,
  Send,
  Settings,
  Star,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NestRequestMoneyDialog } from "@/components/settings/customer-inquiries/nest-request-money-dialog";
import { NestSendReceiptPopover } from "@/components/settings/customer-inquiries/nest-send-receipt-popover";
import { NestComposeQuickActionsEditor } from "@/components/settings/customer-inquiries/nest-compose-quick-actions-editor";
import {
  NestComposeDictateButton,
  NestComposeDictation,
  canUseNestComposeDictation,
  useNestComposeDictationPlaceholder,
  type NestComposeDictationStep,
} from "@/components/settings/customer-inquiries/nest-compose-dictation";
import { LightspeedMark } from "@/components/settings/customer-inquiries/parts";
import { storeSettingsHeaderActionClass } from "@/components/settings/actions-page-header";
import {
  DEFAULT_NEST_COMPOSE_QUICK_ACTIONS,
  NEST_COMPOSE_BUILTIN_META,
  buildSignedComposeDraft,
  builtinDraftBody,
  parseNestComposeQuickActions,
  type NestComposeBuiltinId,
  type NestComposeQuickAction,
} from "@/lib/nest/compose-quick-actions";
import { ensureSmsUrlsAreClickable } from "@/lib/nest/sms-link-format";
import { cn } from "@/lib/utils";
import type { NestConversationMessage } from "@/lib/nest/types";

export type NestComposeSendHandlers = {
  onOptimistic: (message: NestConversationMessage) => void;
  onConfirmed: (tempId: number, message: NestConversationMessage) => void;
  onFailed: (tempId: number, error: string) => void;
};

type PendingAttachment = {
  id: string;
  attachmentId: string;
  filename: string;
  kind: "receipt" | "file";
  previewUrl?: string;
};

type NestComposeStoreContext = {
  storeName: string | null;
  storePhone: string | null;
  signoffTemplate: string;
  quickActions: NestComposeQuickAction[];
  googleReviewUrl: string | null;
};

const MAX_ATTACHMENTS = 5;
const FILE_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,application/pdf,video/mp4,video/quicktime";

let storeContextCache: { expiresAt: number; value: NestComposeStoreContext } | null = null;
let storeContextInflight: Promise<NestComposeStoreContext> | null = null;

async function loadNestComposeStoreContext(): Promise<NestComposeStoreContext> {
  if (storeContextCache && storeContextCache.expiresAt > Date.now()) {
    return storeContextCache.value;
  }
  if (storeContextInflight) return storeContextInflight;

  storeContextInflight = (async () => {
    const res = await fetch("/api/store/nest-settings", { cache: "no-store" });
    const data = (await res.json()) as {
      templates?: { signoff?: string };
      storeName?: string | null;
      storePhone?: string | null;
      quickActions?: unknown;
      googleReviewUrl?: string | null;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || "Could not load store details.");
    }
    const value: NestComposeStoreContext = {
      storeName: data.storeName ?? null,
      storePhone: data.storePhone?.trim() || null,
      signoffTemplate: data.templates?.signoff?.trim() || "Cheers,\n{store}",
      quickActions: parseNestComposeQuickActions(data.quickActions),
      googleReviewUrl: data.googleReviewUrl?.trim() || null,
    };
    storeContextCache = { expiresAt: Date.now() + 5 * 60_000, value };
    return value;
  })().finally(() => {
    storeContextInflight = null;
  });

  return storeContextInflight;
}

function builtinActionIcon(builtin: NestComposeBuiltinId) {
  if (builtin === "request_money") return Banknote;
  if (builtin === "ask_to_call") return Phone;
  if (builtin === "bike_ready") return Bike;
  if (builtin === "request_review") return Star;
  return null;
}

function builtinActionIconClass(builtin: NestComposeBuiltinId): string {
  if (builtin === "request_money") return "text-emerald-600";
  if (builtin === "send_receipt") return "text-amber-600";
  if (builtin === "ask_to_call") return "text-sky-600";
  if (builtin === "bike_ready") return "text-violet-600";
  if (builtin === "request_review") return "text-rose-600";
  return "text-gray-500";
}

export function buildOptimisticStaffMessage(content: string): NestConversationMessage {
  return {
    id: -Date.now(),
    role: "assistant",
    content,
    handle: "staff@store",
    createdAt: new Date().toISOString(),
    metadata: {
      sender_kind: "staff",
      optimistic: true,
      send_state: "pending",
    },
  };
}

async function sendNestMessage(
  chatId: string,
  content: string,
  mediaAttachmentIds: string[] = [],
): Promise<NestConversationMessage> {
  const res = await fetch("/api/store/nest-messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "send_message",
      chatId,
      content,
      ...(mediaAttachmentIds.length > 0 ? { mediaAttachmentIds } : {}),
    }),
  });
  const data = (await res.json()) as { message?: NestConversationMessage; error?: string };
  if (!res.ok || !data.message) {
    throw new Error(data.error || "Could not send message.");
  }
  return data.message;
}

async function uploadNestAttachment(file: File): Promise<{
  attachmentId: string;
  filename: string;
}> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/store/nest-attachments", {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as {
    attachmentId?: string;
    filename?: string;
    error?: string;
  };
  if (!res.ok || !data.attachmentId) {
    throw new Error(data.error || "Could not upload attachment.");
  }
  return {
    attachmentId: data.attachmentId,
    filename: data.filename || file.name || "attachment",
  };
}

function attachmentLabel(attachment: PendingAttachment): string {
  if (attachment.kind === "receipt") return "Receipt attached";
  const name = attachment.filename.trim();
  if (!name) return "File attached";
  return name.length > 28 ? `${name.slice(0, 25)}…` : name;
}

export function NestComposePill({
  chatId,
  sendHandlers,
  placeholder = "iMessage",
  className,
  showRequestMoney = false,
  lightspeedCustomerId = null,
  lightspeedCustomerName = null,
  customerName = null,
}: {
  chatId: string;
  sendHandlers: NestComposeSendHandlers;
  placeholder?: string;
  className?: string;
  showRequestMoney?: boolean;
  lightspeedCustomerId?: string | null;
  lightspeedCustomerName?: string | null;
  customerName?: string | null;
}) {
  const [text, setText] = React.useState("");
  const [inFlight, setInFlight] = React.useState(0);
  const [sendErr, setSendErr] = React.useState<string | null>(null);
  const [requestMoneyOpen, setRequestMoneyOpen] = React.useState(false);
  const [draftingActionId, setDraftingActionId] = React.useState<string | null>(null);
  const [quickActions, setQuickActions] = React.useState<NestComposeQuickAction[]>(
    DEFAULT_NEST_COMPOSE_QUICK_ACTIONS,
  );
  const [manageOpen, setManageOpen] = React.useState(false);
  const [dictationActive, setDictationActive] = React.useState(false);
  const [dictationStep, setDictationStep] = React.useState<NestComposeDictationStep | null>(null);
  const [dictationContext, setDictationContext] = React.useState<NestComposeStoreContext | null>(
    null,
  );
  const dictationStopRef = React.useRef<(() => void) | null>(null);
  const [pendingAttachments, setPendingAttachments] = React.useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const syncTextareaSize = React.useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, 140);
    el.style.height = `${nextHeight}px`;
    setIsExpanded(nextHeight > 40 || el.value.includes("\n"));
  }, []);

  React.useEffect(() => {
    return () => {
      for (const attachment of pendingAttachments) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      }
    };
  }, [pendingAttachments]);

  function onInput(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(event.target.value);
    syncTextareaSize(event.target);
  }

  function removeAttachment(id: string) {
    setPendingAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }

  async function sendContent(content: string) {
    const attachmentIds = pendingAttachments.map((item) => item.attachmentId);
    const normalizedContent = content ? ensureSmsUrlsAreClickable(content) : "";
    if (!normalizedContent && attachmentIds.length === 0) return;

    const fallbackLabel =
      pendingAttachments.find((item) => item.kind === "receipt")?.filename ||
      pendingAttachments[0]?.filename ||
      "Attachment";
    const optimistic = buildOptimisticStaffMessage(normalizedContent || fallbackLabel);
    setSendErr(null);
    sendHandlers.onOptimistic(optimistic);

    setInFlight((count) => count + 1);
    try {
      const message = await sendNestMessage(chatId, normalizedContent, attachmentIds);
      sendHandlers.onConfirmed(optimistic.id, message);
      for (const attachment of pendingAttachments) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      }
      setPendingAttachments([]);
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : "Could not send";
      sendHandlers.onFailed(optimistic.id, errMessage);
      setSendErr(errMessage);
      throw error;
    } finally {
      setInFlight((count) => Math.max(0, count - 1));
    }
  }

  async function send() {
    const content = text.trim();
    if (!content && pendingAttachments.length === 0) return;

    setText("");
    setIsExpanded(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    try {
      await sendContent(content);
    } catch {
      // Restore draft so staff can rewrite after a content block or send failure.
      if (content) {
        setText(content);
        window.requestAnimationFrame(() => {
          if (textareaRef.current) {
            syncTextareaSize(textareaRef.current);
            textareaRef.current.focus();
          }
        });
      }
    }
  }

  async function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    const remaining = MAX_ATTACHMENTS - pendingAttachments.length;
    if (remaining <= 0) {
      setSendErr(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }

    const selected = files.slice(0, remaining);
    setUploading(true);
    setSendErr(null);
    setIsExpanded(true);

    try {
      const uploaded: PendingAttachment[] = [];
      for (const file of selected) {
        const result = await uploadNestAttachment(file);
        uploaded.push({
          id: `${result.attachmentId}-${Date.now()}-${uploaded.length}`,
          attachmentId: result.attachmentId,
          filename: result.filename,
          kind: "file",
          previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        });
      }
      setPendingAttachments((prev) => [...prev, ...uploaded].slice(0, MAX_ATTACHMENTS));
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    } catch (error) {
      setSendErr(error instanceof Error ? error.message : "Could not upload attachment.");
    } finally {
      setUploading(false);
    }
  }

  function handleReceiptPrepared(payload: {
    attachmentId: string;
    filename: string;
    draftMessage: string;
  }) {
    setPendingAttachments((prev) => {
      const withoutReceipts = prev.filter((item) => item.kind !== "receipt");
      return [
        ...withoutReceipts,
        {
          id: `receipt-${payload.attachmentId}`,
          attachmentId: payload.attachmentId,
          filename: payload.filename,
          kind: "receipt" as const,
        },
      ].slice(0, MAX_ATTACHMENTS);
    });
    setText(payload.draftMessage);
    setIsExpanded(true);
    setSendErr(null);
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      syncTextareaSize(el);
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  function draftIntoInput(content: string) {
    setText(content);
    setIsExpanded(true);
    setSendErr(null);
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      syncTextareaSize(el);
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  React.useEffect(() => {
    void loadNestComposeStoreContext().catch(() => {
      /* warm cache for dictation + quick actions */
    });
  }, []);

  function handleDictateClick() {
    if (dictationActive && dictationStep === "recording") {
      dictationStopRef.current?.();
      return;
    }
    if (dictationActive || inFlight > 0 || uploading) return;
    if (!canUseNestComposeDictation()) {
      setSendErr("Dictation isn't supported in this browser.");
      return;
    }

    setSendErr(null);
    // Match workorders: activate immediately so getUserMedia runs in the session effect.
    const cached = storeContextCache?.value ?? {
      storeName: null,
      storePhone: null,
      signoffTemplate: "Cheers,\n{store}",
      quickActions: DEFAULT_NEST_COMPOSE_QUICK_ACTIONS,
      googleReviewUrl: null,
    };
    setDictationContext(cached);
    setDictationStep("recording");
    setDictationActive(true);
    void loadNestComposeStoreContext()
      .then((store) => {
        setDictationContext(store);
      })
      .catch(() => {
        /* keep cached / defaults — recording already started */
      });
  }

  function closeDictation() {
    setDictationActive(false);
    setDictationStep(null);
    setDictationContext(null);
  }

  React.useEffect(() => {
    if (!showRequestMoney) return;
    let cancelled = false;
    void loadNestComposeStoreContext()
      .then((store) => {
        if (!cancelled) setQuickActions(store.quickActions);
      })
      .catch(() => {
        /* keep defaults */
      });
    return () => {
      cancelled = true;
    };
  }, [showRequestMoney]);

  async function draftQuickMessage(action: NestComposeQuickAction) {
    if (draftingActionId || inFlight > 0) return;
    if (
      action.kind === "builtin" &&
      (action.builtin === "request_money" || action.builtin === "send_receipt")
    ) {
      return;
    }
    setDraftingActionId(action.id);
    setSendErr(null);
    try {
      const store = await loadNestComposeStoreContext();
      const draftBody =
        action.kind === "custom"
          ? action.body
          : builtinDraftBody(action.builtin, store.storePhone, store.googleReviewUrl);
      if (!draftBody) {
        throw new Error(
          action.kind === "builtin" && action.builtin === "request_review"
            ? "Set GOOGLE_REVIEW_URL (or nest_google_review_url in store preferences) before requesting a review."
            : "This quick action has no draft message.",
        );
      }
      draftIntoInput(
        buildSignedComposeDraft({
          customerName: lightspeedCustomerName || customerName,
          storeName: store.storeName,
          storePhone: store.storePhone,
          signoffTemplate: store.signoffTemplate,
          body: draftBody,
          reviewUrl: store.googleReviewUrl,
        }),
      );
    } catch (error) {
      setSendErr(
        error instanceof Error ? error.message : "Could not prepare the message.",
      );
    } finally {
      setDraftingActionId(null);
    }
  }

  async function saveQuickActions(next: NestComposeQuickAction[]) {
    const res = await fetch("/api/store/nest-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quickActions: next }),
    });
    const data = (await res.json()) as {
      quickActions?: unknown;
      storeName?: string | null;
      storePhone?: string | null;
      templates?: { signoff?: string };
      googleReviewUrl?: string | null;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || "Could not save quick actions.");
    }
    const parsed = parseNestComposeQuickActions(data.quickActions ?? next);
    const cached = storeContextCache?.value;
    storeContextCache = {
      expiresAt: Date.now() + 5 * 60_000,
      value: {
        storeName: data.storeName ?? cached?.storeName ?? null,
        storePhone: data.storePhone?.trim() || cached?.storePhone || null,
        signoffTemplate:
          data.templates?.signoff?.trim() ||
          cached?.signoffTemplate ||
          "Cheers,\n{store}",
        quickActions: parsed,
        googleReviewUrl:
          data.googleReviewUrl?.trim() || cached?.googleReviewUrl || null,
      },
    };
    setQuickActions(parsed);
  }

  const sending = inFlight > 0;
  const hasAttachments = pendingAttachments.length > 0;
  const canAttachMore = pendingAttachments.length < MAX_ATTACHMENTS && !uploading && !sending;
  const dictationPlaceholder = useNestComposeDictationPlaceholder(dictationStep);

  return (
    <div className={cn("shrink-0", className)}>
      {sendErr ? (
        <div className="mb-3 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">
          {sendErr}
        </div>
      ) : null}
      <div className="w-full">
        {showRequestMoney ? (
          <div className="relative z-10 mx-auto -mb-5 w-[92%] overflow-visible rounded-2xl border border-gray-200 bg-gray-100 shadow-sm">
            <div className="flex h-9 items-center gap-1.5 overflow-x-auto px-2 pl-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {quickActions.map((action) => {
                if (action.kind === "builtin" && action.builtin === "send_receipt") {
                  return (
                    <NestSendReceiptPopover
                      key={action.id}
                      chatId={chatId}
                      customerId={lightspeedCustomerId}
                      customerName={lightspeedCustomerName}
                      onPrepared={handleReceiptPrepared}
                    />
                  );
                }

                if (action.kind === "builtin" && action.builtin === "request_money") {
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => setRequestMoneyOpen(true)}
                      className={cn(
                        storeSettingsHeaderActionClass(),
                        "inline-flex h-7 shrink-0 items-center gap-1.5 px-2.5 text-xs",
                      )}
                    >
                      <Banknote className={cn("size-[14px]", builtinActionIconClass("request_money"))} />
                      {NEST_COMPOSE_BUILTIN_META.request_money.label}
                    </button>
                  );
                }

                const label =
                  action.kind === "custom"
                    ? action.label
                    : NEST_COMPOSE_BUILTIN_META[action.builtin].label;
                const Icon =
                  action.kind === "builtin" ? builtinActionIcon(action.builtin) : null;
                const loading = draftingActionId === action.id;

                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => void draftQuickMessage(action)}
                    disabled={Boolean(draftingActionId) || sending}
                    className={cn(
                      storeSettingsHeaderActionClass(),
                      "inline-flex h-7 shrink-0 items-center gap-1.5 px-2.5 text-xs",
                      (loading || sending) && "cursor-wait opacity-80",
                    )}
                  >
                    {loading ? (
                      <Loader2 className="size-[14px] animate-spin" />
                    ) : Icon ? (
                      <Icon
                        className={cn(
                          "size-[14px]",
                          action.kind === "builtin"
                            ? builtinActionIconClass(action.builtin)
                            : "text-gray-500",
                        )}
                      />
                    ) : null}
                    {label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setManageOpen(true)}
                className={cn(
                  storeSettingsHeaderActionClass(),
                  "ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center px-0",
                )}
                aria-label="Manage quick actions"
                title="Manage quick actions"
              >
                <Settings className="size-[14px]" />
              </button>
            </div>
            <div className="h-5 bg-gray-100" aria-hidden />
          </div>
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className="relative z-10 w-full"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={FILE_ACCEPT}
            multiple
            className="hidden"
            onChange={(event) => void handleFilesSelected(event)}
          />
          <div
            className={cn(
              "relative z-10 flex w-full gap-2 border border-gray-300 bg-white px-3 shadow-sm transition-[border-radius,padding]",
              isExpanded || hasAttachments
                ? "items-end rounded-2xl py-2.5"
                : "items-center rounded-full py-2",
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!canAttachMore || dictationActive}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "h-8 w-8 shrink-0 rounded-full text-gray-500 hover:text-gray-700",
                (isExpanded || hasAttachments) && "mb-0.5",
              )}
              aria-label="Add attachment"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Plus className="h-5 w-5" />
              )}
            </Button>
            <NestComposeDictateButton
              disabled={uploading || sending}
              active={dictationActive}
              step={dictationStep}
              onClick={handleDictateClick}
              className={cn((isExpanded || hasAttachments) && "mb-0.5")}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {hasAttachments ? (
                <div className="flex flex-wrap items-center gap-1 px-1">
                  {pendingAttachments.map((attachment) => (
                    <span
                      key={attachment.id}
                      className="inline-flex max-w-full items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700"
                    >
                      {attachment.kind === "receipt" ? (
                        <LightspeedMark className="h-3 w-3" />
                      ) : attachment.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={attachment.previewUrl}
                          alt=""
                          className="h-3.5 w-3.5 rounded-sm object-cover"
                        />
                      ) : null}
                      <span className="truncate">{attachmentLabel(attachment)}</span>
                      <button
                        type="button"
                        className="ml-0.5 shrink-0 text-gray-400 hover:text-gray-700"
                        aria-label={`Remove ${attachment.filename}`}
                        onClick={() => removeAttachment(attachment.id)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <Textarea
                ref={textareaRef}
                rows={1}
                value={text}
                onChange={onInput}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={dictationPlaceholder ?? placeholder}
                readOnly={dictationActive}
                className="max-h-[132px] min-h-[28px] flex-1 resize-none break-words border-0 bg-transparent px-1 py-1.5 text-[15px] leading-snug shadow-none focus-visible:ring-0"
                style={{ height: "auto" }}
              />
            </div>
            <Button
              type="submit"
              size="icon"
              disabled={(!text.trim() && !hasAttachments) || uploading || dictationActive}
              className={cn(
                "h-8 w-8 shrink-0 rounded-full",
                (isExpanded || hasAttachments) && "mb-0.5",
                text.trim() || hasAttachments
                  ? "bg-[#007AFF] text-white hover:bg-[#007AFF]/90"
                  : "bg-transparent text-gray-400",
              )}
              aria-label="Send message"
            >
              {sending && !text.trim() ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </div>

      {showRequestMoney ? (
        <>
          <NestRequestMoneyDialog
            open={requestMoneyOpen}
            onOpenChange={setRequestMoneyOpen}
            chatId={chatId}
            onDraftMessage={draftIntoInput}
          />
          <NestComposeQuickActionsEditor
            open={manageOpen}
            onOpenChange={setManageOpen}
            actions={quickActions}
            onSave={saveQuickActions}
          />
        </>
      ) : null}

      {dictationActive && dictationContext ? (
        <NestComposeDictation
          active={dictationActive}
          customerName={lightspeedCustomerName || customerName}
          storeName={dictationContext.storeName}
          storePhone={dictationContext.storePhone}
          signoffTemplate={dictationContext.signoffTemplate}
          stopRef={dictationStopRef}
          onStepChange={setDictationStep}
          onClose={closeDictation}
          onDraft={draftIntoInput}
          onError={setSendErr}
        />
      ) : null}
    </div>
  );
}

export function NestFloatingCompose({
  chatId,
  sendHandlers,
  placeholder,
  showRequestMoney,
}: {
  chatId: string;
  sendHandlers: NestComposeSendHandlers;
  placeholder?: string;
  showRequestMoney?: boolean;
}) {
  return (
    <div className={cn(
      "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4",
      showRequestMoney ? "pt-20" : "pt-16",
    )}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 top-0 bg-gradient-to-t from-white from-25% via-white/95 to-transparent"
      />
      <div className="pointer-events-auto relative w-full max-w-3xl">
        <NestComposePill
          chatId={chatId}
          sendHandlers={sendHandlers}
          placeholder={placeholder}
          showRequestMoney={showRequestMoney}
        />
      </div>
    </div>
  );
}
