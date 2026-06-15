"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Inbox, LayoutGrid, Loader2, MessageSquare, Search, Send, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NestLogo } from "@/components/genie/nest-logo";
import { searchNestCustomers, startNestMessage } from "@/lib/nest/messages-client";
import type { NestConversationMessage, NestLightspeedCustomer } from "@/lib/nest/types";
import {
  bentoOuterWrapClassName,
  getBentoShellStyles,
} from "@/components/settings/bento-variant-styles";
import { cn } from "@/lib/utils";

/** Matches Actions page horizontal rhythm (PageContainer + header nudge). */
export const storeSettingsPageChromeClass = "px-2 sm:px-3 lg:px-4";
export const storeSettingsPageHeaderNudgeClass = "px-0.5";

const BENTO_RADIUS = "rounded-[32px]";
const POPUP_SPRING = { type: "spring" as const, stiffness: 420, damping: 30, mass: 0.85 };
const bentoShell = getBentoShellStyles("light-beige-floating");

export function storeSettingsHeaderActionClass(active?: boolean, disabled?: boolean) {
  return cn(
    "inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200/80 bg-white px-3 text-sm font-medium text-gray-950 shadow-sm transition-colors hover:bg-gray-50",
    active && "border-gray-300 bg-gray-50",
    disabled && "cursor-not-allowed opacity-50 hover:bg-white",
  );
}

function headerActionButtonClassName(active?: boolean, disabled?: boolean) {
  return storeSettingsHeaderActionClass(active, disabled);
}

export function StoreSettingsPageHeader({
  title,
  icon: Icon,
  className,
  composeDisabled = false,
  onMessageStarted,
  trailingActions,
}: {
  title: string;
  icon: LucideIcon;
  className?: string;
  composeDisabled?: boolean;
  onMessageStarted?: (chatId: string, message: NestConversationMessage) => void;
  trailingActions?: React.ReactNode;
}) {
  const [nestOpen, setNestOpen] = React.useState(false);
  const newMessageRef = React.useRef<HTMLButtonElement>(null);

  return (
    <div className={cn("sticky top-0 z-30 w-full bg-white pb-2", className)}>
      <div className="flex min-h-9 items-center justify-between gap-3">
        <h1 className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          <Icon className="h-[18px] w-[18px] shrink-0 text-foreground" aria-hidden />
          {title}
        </h1>

        <div className="flex shrink-0 items-center gap-2">
          {trailingActions}
          <div className="relative">
            <button
              ref={newMessageRef}
              type="button"
              onClick={() => {
                if (composeDisabled) return;
                setNestOpen((current) => !current);
              }}
              disabled={composeDisabled}
              className={headerActionButtonClassName(nestOpen, composeDisabled)}
              aria-expanded={nestOpen}
            >
              <NestLogo className="h-3.5 w-3.5" />
              New message
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-gray-400 transition-transform duration-200",
                  nestOpen && "rotate-180",
                )}
              />
            </button>
          </div>
        </div>
      </div>

      <NestComposePopup
        open={nestOpen}
        onClose={() => setNestOpen(false)}
        anchorRef={newMessageRef}
        onStarted={onMessageStarted}
      />
    </div>
  );
}

export function ActionsPageHeader({ className }: { className?: string }) {
  return <StoreSettingsPageHeader title="Actions" icon={LayoutGrid} className={className} />;
}

export function NestPageHeader({
  className,
  composeDisabled,
  onMessageStarted,
  trailingActions,
}: {
  className?: string;
  composeDisabled?: boolean;
  onMessageStarted?: (chatId: string, message: NestConversationMessage) => void;
  trailingActions?: React.ReactNode;
}) {
  return (
    <StoreSettingsPageHeader
      title="Nest"
      icon={MessageSquare}
      className={className}
      composeDisabled={composeDisabled}
      onMessageStarted={onMessageStarted}
      trailingActions={trailingActions}
    />
  );
}

export function CustomerEnquiriesPageHeader({
  className,
  composeDisabled,
  onMessageStarted,
  trailingActions,
}: {
  className?: string;
  composeDisabled?: boolean;
  onMessageStarted?: (chatId: string, message: NestConversationMessage) => void;
  trailingActions?: React.ReactNode;
}) {
  return (
    <StoreSettingsPageHeader
      title="Customer enquiries"
      icon={Inbox}
      className={className}
      composeDisabled={composeDisabled}
      onMessageStarted={onMessageStarted}
      trailingActions={trailingActions}
    />
  );
}

function useAnchoredPopupPosition(open: boolean, anchorRef: React.RefObject<HTMLElement | null>) {
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);

  React.useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPosition(null);
      return;
    }

    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(380, window.innerWidth - 24);
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
      setPosition({ top: rect.bottom + 10, left });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, anchorRef]);

  return position;
}

function NestComposePopup({
  open,
  onClose,
  anchorRef,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onStarted?: (chatId: string, message: NestConversationMessage) => void;
}) {
  const position = useAnchoredPopupPosition(open, anchorRef);
  const [mounted, setMounted] = React.useState(false);
  const [mobile, setMobile] = React.useState("");
  const [text, setText] = React.useState("");
  const [customerQuery, setCustomerQuery] = React.useState("");
  const [selectedCustomerName, setSelectedCustomerName] = React.useState("");
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<string | null>(null);
  const [customers, setCustomers] = React.useState<NestLightspeedCustomer[]>([]);
  const [customerLoading, setCustomerLoading] = React.useState(false);
  const [customerSearchError, setCustomerSearchError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setMobile("");
    setText("");
    setCustomerQuery("");
    setSelectedCustomerName("");
    setSelectedCustomerId(null);
    setCustomers([]);
    setCustomerSearchError(null);
    setError(null);
    setSent(false);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  React.useEffect(() => {
    const q = customerQuery.trim();
    if (q.length < 2) {
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
  }, [customerQuery]);

  async function send() {
    const mobileValue = mobile.trim();
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
      setSent(true);
      window.setTimeout(() => onClose(), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  function clearSelectedCustomer() {
    setSelectedCustomerId(null);
    setSelectedCustomerName("");
    setMobile("");
    setCustomerQuery("");
    setCustomers([]);
    setCustomerSearchError(null);
  }

  const hasSelectedCustomer = Boolean(selectedCustomerId && selectedCustomerName);

  if (!mounted) return null;

  const panelClassName = cn("flex min-h-0 flex-col", bentoShell.panelClassName);

  return createPortal(
    <AnimatePresence>
      {open && position ? (
        <>
          <motion.button
            key="nest-compose-backdrop"
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/15"
            onClick={onClose}
          />

          <motion.div
            key="nest-compose-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nest-compose-title"
        initial={{ opacity: 0, scale: 0.94, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: -10 }}
        transition={POPUP_SPRING}
        style={{
          top: position.top,
          left: position.left,
          transformOrigin: "top left",
        }}
        className={cn(
          "fixed z-50 w-[min(380px,calc(100vw-24px))] overflow-hidden border border-gray-200/80 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)]",
          BENTO_RADIUS,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div className="min-w-0">
            <h2 id="nest-compose-title" className="text-[15px] font-semibold tracking-tight text-gray-950">
              New message
            </h2>
            <p className="mt-0.5 text-[11px] text-gray-600">Send via Nest iMessage</p>
          </div>
          <div className="flex items-center gap-1.5">
            <NestLogo className="h-5 w-5 shrink-0" />
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className={bentoOuterWrapClassName("light-beige-floating")}>
          <div className={cn(panelClassName, "max-h-[min(28rem,calc(100vh-12rem))] overflow-y-auto")}>
            <div className="space-y-2 px-0 pb-3">
              {error ? (
                <div className="rounded-[18px] border border-red-200/80 bg-white px-3 py-2 text-[12px] text-red-600">
                  {error}
                </div>
              ) : null}

              {sent ? (
                <div
                  className={cn(
                    "rounded-[18px] border bg-white px-4 py-6 text-center shadow-sm",
                    bentoShell.listItemBorder,
                  )}
                >
                  <p className="text-sm font-medium text-gray-950">Message sent</p>
                  <p className="mt-1 text-[11px] text-gray-500">Your customer will receive it via Nest.</p>
                </div>
              ) : (
                <>
                  <div
                    className={cn(
                      "rounded-[18px] border bg-white p-3 shadow-sm",
                      bentoShell.listItemBorder,
                    )}
                  >
                    {hasSelectedCustomer ? (
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                            Customer
                          </p>
                          <p className="truncate text-[13px] font-semibold text-gray-950">
                            {selectedCustomerName}
                          </p>
                          {mobile.trim() ? (
                            <p className="truncate text-[11px] text-gray-700">{mobile}</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={clearSelectedCustomer}
                          disabled={sending}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                          aria-label="Change customer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <label
                          htmlFor="nest-customer-search"
                          className="text-[10px] font-medium uppercase tracking-wide text-gray-400"
                        >
                          Search Lightspeed customers
                        </label>
                        <div className="relative mt-1.5">
                          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                          <input
                            id="nest-customer-search"
                            type="search"
                            value={customerQuery}
                            onChange={(event) => setCustomerQuery(event.target.value)}
                            placeholder="Name, mobile, or customer ID"
                            disabled={sending}
                            className="w-full rounded-md border border-gray-200 bg-gray-50/80 py-2 pl-8 pr-3 text-[12px] text-gray-950 outline-none transition-colors focus:border-gray-300 focus:bg-white disabled:opacity-60"
                          />
                        </div>

                        <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">
                          {customerQuery.trim().length < 2 ? (
                            <p className="py-3 text-center text-[11px] text-gray-400">
                              Type at least 2 characters to search.
                            </p>
                          ) : customerLoading ? (
                            <div className="flex items-center justify-center gap-2 py-3 text-[11px] text-gray-500">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Searching Lightspeed…
                            </div>
                          ) : customerSearchError ? (
                            <p className="py-3 text-center text-[11px] text-red-600">{customerSearchError}</p>
                          ) : customers.length > 0 ? (
                            customers.map((customer) => (
                              <button
                                key={customer.customerId}
                                type="button"
                                onClick={() => {
                                  setMobile(customer.phone);
                                  setSelectedCustomerName(customer.name);
                                  setSelectedCustomerId(customer.customerId);
                                  setCustomerQuery("");
                                  setCustomers([]);
                                }}
                                className="flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors hover:border-gray-200 hover:bg-gray-50/80"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-[12px] font-medium text-gray-950">
                                    {customer.name}
                                  </span>
                                  <span className="block truncate text-[11px] text-gray-500">
                                    {customer.phone}
                                  </span>
                                </span>
                              </button>
                            ))
                          ) : (
                            <p className="py-3 text-center text-[11px] text-gray-400">No customers found.</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <div
                    className={cn(
                      "rounded-[18px] border bg-white p-3 shadow-sm",
                      bentoShell.listItemBorder,
                    )}
                  >
                    {!hasSelectedCustomer ? (
                      <>
                        <label
                          htmlFor="nest-mobile"
                          className="text-[10px] font-medium uppercase tracking-wide text-gray-400"
                        >
                          Mobile
                        </label>
                        <input
                          id="nest-mobile"
                          type="tel"
                          value={mobile}
                          onChange={(event) => setMobile(event.target.value)}
                          placeholder="04xx xxx xxx"
                          disabled={sending}
                          className="mt-1.5 w-full rounded-md border border-gray-200 bg-gray-50/80 px-2.5 py-2 text-[12px] text-gray-950 outline-none transition-colors focus:border-gray-300 focus:bg-white disabled:opacity-60"
                        />
                      </>
                    ) : null}

                    <label
                      htmlFor="nest-message"
                      className={cn(
                        "block text-[10px] font-medium uppercase tracking-wide text-gray-400",
                        !hasSelectedCustomer && "mt-3",
                      )}
                    >
                      Message
                    </label>
                    <textarea
                      id="nest-message"
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                      disabled={sending}
                      rows={3}
                      placeholder="Write your message…"
                      className="mt-1.5 w-full resize-none rounded-md border border-gray-200 bg-gray-50/80 px-2.5 py-2 text-[12px] leading-relaxed text-gray-950 outline-none transition-colors focus:border-gray-300 focus:bg-white disabled:opacity-60"
                    />

                    <div className="mt-3">
                      <motion.button
                        type="button"
                        onClick={() => void send()}
                        disabled={sending || !mobile.trim() || !text.trim()}
                        whileTap={{ scale: 0.98 }}
                        className="flex w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2.5 text-[13px] font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {sending ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Sending…
                          </>
                        ) : (
                          <>
                            <Send className="h-3.5 w-3.5" />
                            Send via Nest
                          </>
                        )}
                      </motion.button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
