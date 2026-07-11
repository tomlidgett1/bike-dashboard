"use client";

import * as React from "react";
import Image from "next/image";
import {
  Bike,
  ChatRound,
  ChevronLeft,
  Loader2,
  Package,
  Search,
  Send,
  X,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { NestLogo } from "@/components/genie/nest-logo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { searchNestCustomers, startNestMessage } from "@/lib/nest/messages-client";
import type { NestComposeInitialRecipient } from "@/lib/customer-inquiries/enquiries-deep-link";
import type { NestPickupSuggestion } from "@/lib/nest/pickup-suggestions";
import {
  parseWorkorderSuggestionsResponse,
  readCachedWorkorderSuggestions,
  suggestionKey,
} from "@/lib/nest/workorder-suggestions-cache";
import type { NestConversationMessage, NestLightspeedCustomer } from "@/lib/nest/types";

type MessageTemplate = {
  id: string;
  label: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
};

const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: "bike-ready",
    label: "Bike ready",
    icon: Bike,
    body: "Hey [firstname], just a friendly message to let you know that your bike is ready for collection. Cheers,\nAshy Cycles",
  },
  {
    id: "parts-arrived",
    label: "Parts arrived",
    icon: Package,
    body: "Hey [firstname], just letting you know the parts for your bike have arrived and we can get started. Cheers,\nAshy Cycles",
  },
  {
    id: "follow-up",
    label: "Follow up",
    icon: ChatRound,
    body: "Hey [firstname], just checking in - is there anything else we can help with? Cheers,\nAshy Cycles",
  },
];

function firstNameFromCustomer(name: string): string {
  const cleaned = name.trim().split(/\s+/).filter(Boolean)[0] ?? "";
  return cleaned || "there";
}

function applyTemplate(template: string, firstName: string): string {
  return template.replace(/\[firstname\]/gi, firstName);
}

/** Digits-only length after stripping common phone punctuation. */
function phoneDigitCount(value: string): number {
  return value.replace(/\D/g, "").length;
}

function looksLikePhone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Mostly digits / phone punctuation, with enough digits for AU mobiles.
  const digits = phoneDigitCount(trimmed);
  if (digits < 8) return false;
  return /^[\d\s+().-]+$/.test(trimmed);
}

function uniqueRecentWorkorderCustomers(
  suggestions: NestPickupSuggestion[],
  limit = 5,
): NestPickupSuggestion[] {
  const seen = new Set<string>();
  const unique: NestPickupSuggestion[] = [];

  for (const suggestion of suggestions) {
    const customerKey =
      suggestion.customerId.trim() ||
      suggestion.mobile?.trim() ||
      suggestion.customerName.trim().toLowerCase();
    if (!customerKey || seen.has(customerKey)) continue;
    seen.add(customerKey);
    unique.push(suggestion);
    if (unique.length >= limit) break;
  }

  return unique;
}

async function fetchRecentFinishedWorkorderCustomers(): Promise<NestPickupSuggestion[]> {
  const res = await fetch("/api/store/homev2-suggestions", { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      typeof json?.error === "string" ? json.error : "Could not load recent workorders.",
    );
  }
  const parsed = parseWorkorderSuggestionsResponse(json);
  return uniqueRecentWorkorderCustomers(parsed?.suggestions ?? [], 5);
}

export function NestNewMessagePanel({
  onClose,
  onStarted,
  initialRecipient,
}: {
  onClose: () => void;
  onStarted?: (chatId: string, message: NestConversationMessage) => void;
  initialRecipient?: NestComposeInitialRecipient | null;
}) {
  const [text, setText] = React.useState("");
  const [recipientQuery, setRecipientQuery] = React.useState("");
  const [selectedCustomerName, setSelectedCustomerName] = React.useState("");
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<string | null>(null);
  const [selectedMobile, setSelectedMobile] = React.useState("");
  const [customers, setCustomers] = React.useState<NestLightspeedCustomer[]>([]);
  const [customerLoading, setCustomerLoading] = React.useState(false);
  const [customerSearchError, setCustomerSearchError] = React.useState<string | null>(null);
  const [recentWorkorders, setRecentWorkorders] = React.useState<NestPickupSuggestion[]>(() =>
    uniqueRecentWorkorderCustomers(readCachedWorkorderSuggestions() ?? [], 5),
  );
  const [recentLoading, setRecentLoading] = React.useState(
    () => !(readCachedWorkorderSuggestions()?.length),
  );
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resolvingMobile, setResolvingMobile] = React.useState(false);
  const [activeTemplateId, setActiveTemplateId] = React.useState<string | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const hasSelectedCustomer = Boolean(selectedCustomerId && selectedCustomerName);
  const firstName = firstNameFromCustomer(selectedCustomerName);
  const resolvedMobile = hasSelectedCustomer
    ? selectedMobile.trim()
    : looksLikePhone(recipientQuery)
      ? recipientQuery.trim()
      : "";
  const showSearchResults =
    !hasSelectedCustomer && recipientQuery.trim().length >= 2 && !looksLikePhone(recipientQuery);
  const showRecentWorkorders =
    !hasSelectedCustomer && recipientQuery.trim().length === 0 && recentWorkorders.length > 0;

  React.useEffect(() => {
    if (initialRecipient) return;
    searchInputRef.current?.focus();
  }, [initialRecipient]);

  React.useEffect(() => {
    if (!initialRecipient) return;
    const mobile = initialRecipient.mobile?.trim() || "";
    const customerId = initialRecipient.customerId?.trim() || "";
    setSelectedMobile(mobile);
    setSelectedCustomerName(initialRecipient.customerName);
    setSelectedCustomerId(customerId || initialRecipient.customerName);
    setRecipientQuery("");
    setCustomers([]);
    setCustomerSearchError(null);
    setError(null);
    window.setTimeout(() => textareaRef.current?.focus(), 0);

    // Workorder deep-links sometimes only carry customerId — look up the mobile.
    if (mobile || !customerId || !/^\d+$/.test(customerId)) {
      setResolvingMobile(false);
      return;
    }

    let cancelled = false;
    setResolvingMobile(true);
    void searchNestCustomers(customerId)
      .then((matches) => {
        if (cancelled) return;
        const match =
          matches.find((customer) => customer.customerId === customerId) ?? matches[0];
        if (match?.phone?.trim()) {
          setSelectedMobile(match.phone.trim());
          if (match.name?.trim()) setSelectedCustomerName(match.name.trim());
          setError(null);
        } else {
          setError("No mobile number on file for this customer in Lightspeed.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Could not look up this customer’s mobile number.",
        );
      })
      .finally(() => {
        if (!cancelled) setResolvingMobile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialRecipient]);

  React.useEffect(() => {
    let cancelled = false;
    setRecentLoading((current) => current || recentWorkorders.length === 0);
    void fetchRecentFinishedWorkorderCustomers()
      .then((next) => {
        if (!cancelled) setRecentWorkorders(next);
      })
      .catch(() => {
        // Keep any cached list; empty state is fine if none.
      })
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once when the compose panel opens
  }, []);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  React.useEffect(() => {
    if (hasSelectedCustomer) return;
    const q = recipientQuery.trim();
    if (q.length < 2 || looksLikePhone(q)) {
      setCustomers([]);
      setCustomerLoading(false);
      setCustomerSearchError(null);
      return;
    }
    let cancelled = false;
    setCustomerLoading(true);
    setCustomerSearchError(null);
    const id = window.setTimeout(() => {
      searchNestCustomers(q)
        .then((next) => {
          if (!cancelled) setCustomers(next);
        })
        .catch((err) => {
          if (!cancelled) {
            setCustomers([]);
            setCustomerSearchError(
              err instanceof Error ? err.message : "Could not search Lightspeed customers.",
            );
          }
        })
        .finally(() => {
          if (!cancelled) setCustomerLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [recipientQuery, hasSelectedCustomer]);

  function clearSelectedCustomer() {
    setSelectedCustomerId(null);
    setSelectedCustomerName("");
    setSelectedMobile("");
    setRecipientQuery("");
    setCustomers([]);
    setCustomerSearchError(null);
    setActiveTemplateId(null);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function selectCustomer(customer: NestLightspeedCustomer) {
    setSelectedMobile(customer.phone);
    setSelectedCustomerName(customer.name);
    setSelectedCustomerId(customer.customerId);
    setRecipientQuery("");
    setCustomers([]);
    if (activeTemplateId) {
      const template = MESSAGE_TEMPLATES.find((item) => item.id === activeTemplateId);
      if (template) {
        setText(applyTemplate(template.body, firstNameFromCustomer(customer.name)));
      }
    }
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function selectFromWorkorder(suggestion: NestPickupSuggestion) {
    setSelectedMobile(suggestion.mobile?.trim() || "");
    setSelectedCustomerName(suggestion.customerName);
    setSelectedCustomerId(suggestion.customerId || suggestionKey(suggestion));
    setRecipientQuery("");
    setCustomers([]);
    const draft = suggestion.messageDraft.trim();
    if (draft) {
      setText(draft);
      setActiveTemplateId(null);
    } else if (activeTemplateId) {
      const template = MESSAGE_TEMPLATES.find((item) => item.id === activeTemplateId);
      if (template) {
        setText(applyTemplate(template.body, firstNameFromCustomer(suggestion.customerName)));
      }
    }
    window.setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }, 0);
  }

  function applyPreset(template: MessageTemplate) {
    setActiveTemplateId(template.id);
    setText(applyTemplate(template.body, firstName));
    window.setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }, 0);
  }

  function onComposeInput(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(event.target.value);
    setActiveTemplateId(null);
    const el = event.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  async function send() {
    const mobileValue = resolvedMobile;
    const content = text.trim();
    if (!mobileValue || !content || sending) return;
    setSending(true);
    setError(null);
    try {
      const result = await startNestMessage(
        mobileValue,
        content,
        selectedCustomerName || undefined,
      );
      onStarted?.(result.chatId, result.message);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  const canSend = Boolean(resolvedMobile && text.trim() && !sending && !resolvingMobile);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f6f6f7]">
      <div className="relative z-10 flex shrink-0 flex-col border-b border-gray-100 bg-white">
        <div className="flex items-start gap-2 px-4 pb-3 pt-4 md:px-5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-0.5 h-7 w-7 shrink-0 rounded-md md:hidden"
            onClick={onClose}
            aria-label="Back to enquiries"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <NestLogo className="h-4 w-4 shrink-0" />
              <h2 className="text-base font-semibold leading-snug text-gray-900">New message</h2>
            </div>

            {hasSelectedCustomer ? (
              <div className="mt-2 flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{selectedCustomerName}</p>
                  {selectedMobile.trim() ? (
                    <p className="truncate text-xs text-gray-500">{selectedMobile}</p>
                  ) : resolvingMobile ? (
                    <p className="truncate text-xs text-gray-500">Looking up mobile…</p>
                  ) : (
                    <p className="truncate text-xs text-gray-500">No mobile on file</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={clearSelectedCustomer}
                  disabled={sending}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white hover:text-gray-700 disabled:opacity-50"
                  aria-label="Change customer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={recipientQuery}
                  onChange={(event) => setRecipientQuery(event.target.value)}
                  placeholder="Customer name or mobile number…"
                  disabled={sending}
                  className="h-9 w-full rounded-full border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-300 focus:bg-white disabled:opacity-60"
                />
              </div>
            )}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-0.5 hidden h-7 w-7 shrink-0 rounded-md md:inline-flex"
            onClick={onClose}
            disabled={sending}
            aria-label="Close new message"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {showSearchResults ? (
          <div className="max-h-56 overflow-y-auto border-t border-gray-100 bg-white px-2 py-2 md:px-3">
            {customerLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching Lightspeed…
              </div>
            ) : customerSearchError ? (
              <p className="px-3 py-4 text-center text-sm text-red-600">{customerSearchError}</p>
            ) : customers.length > 0 ? (
              <div className="space-y-0.5">
                {customers.map((customer) => (
                  <button
                    key={customer.customerId}
                    type="button"
                    onClick={() => selectCustomer(customer)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">
                        {customer.name}
                      </span>
                      <span className="block truncate text-xs text-gray-500">{customer.phone}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-3 py-4 text-center text-sm text-gray-400">No customers found.</p>
            )}
          </div>
        ) : null}

        {showRecentWorkorders || (!hasSelectedCustomer && recipientQuery.trim().length === 0 && recentLoading) ? (
          <div className="border-t border-gray-100 bg-white px-4 py-3 md:px-5">
            {recentLoading && recentWorkorders.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading recent workorders…
              </div>
            ) : (
              <div className="flex items-center gap-2.5 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
                <span className="flex h-5 w-5 shrink-0 overflow-hidden rounded-full">
                  <Image
                    src="/ls.png"
                    alt="Lightspeed"
                    width={20}
                    height={20}
                    className="h-full w-full object-cover"
                    unoptimized
                  />
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1">
                  {recentWorkorders.map((suggestion, index) => {
                    const canSelect = Boolean(suggestion.mobile?.trim()) && !sending;
                    return (
                      <React.Fragment key={suggestionKey(suggestion)}>
                        {index > 0 ? (
                          <span className="text-sm text-gray-300" aria-hidden>
                            ·
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => selectFromWorkorder(suggestion)}
                          disabled={!canSelect}
                          title={
                            suggestion.mobile?.trim()
                              ? suggestion.workSummary || suggestion.label
                              : "No mobile on file"
                          }
                          className={cn(
                            "truncate text-sm font-medium transition-colors",
                            canSelect
                              ? "text-gray-900 hover:text-gray-600"
                              : "cursor-not-allowed text-gray-400",
                          )}
                        >
                          {suggestion.customerName}
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-5">
        <div className="flex h-full min-h-[12rem] flex-col items-center justify-center text-center">
          <NestLogo className="h-10 w-10" />
          <p className="mt-4 text-sm font-medium text-gray-900">Write a Nest message</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">
            Tap a recent finished workorder customer, or search by name or mobile.
          </p>
        </div>
      </div>

      <div className="shrink-0 bg-transparent">
        {error ? (
          <div className="mx-4 mb-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 md:mx-5">
            {error}
          </div>
        ) : null}

        <div className="space-y-2.5 px-4 pb-4 pt-2 md:px-5">
          <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {MESSAGE_TEMPLATES.map((template) => {
              const isActive = activeTemplateId === template.id;
              const Icon = template.icon;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyPreset(template)}
                  disabled={sending}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "border-gray-300 bg-gray-100 text-gray-900"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                    sending && "cursor-not-allowed opacity-50",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                  {template.label}
                </button>
              );
            })}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            className="w-full"
          >
            <div className="flex w-full items-end gap-2 rounded-full border border-gray-300 bg-white px-3 py-2 shadow-sm">
              <Textarea
                ref={textareaRef}
                rows={1}
                value={text}
                onChange={onComposeInput}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void send();
                  }
                }}
                disabled={sending}
                placeholder="Write a reply…"
                className="max-h-[132px] min-h-[28px] flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-[15px] leading-snug shadow-none focus-visible:ring-0 disabled:opacity-60"
                style={{ height: "auto" }}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!canSend}
                className={cn(
                  "mb-0.5 h-8 w-8 shrink-0 rounded-full",
                  canSend
                    ? "bg-[#007AFF] text-white hover:bg-[#007AFF]/90"
                    : "bg-transparent text-gray-400",
                )}
                aria-label="Send message"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
