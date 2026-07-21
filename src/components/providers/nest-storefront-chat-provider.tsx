"use client";

import * as React from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  Loader2,
  MessageCircle,
  Send,
  X,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import { useStorefrontProactiveNudge } from "@/lib/hooks/use-storefront-proactive-nudge";
import {
  markProactiveNudgeDismissed,
  readBrowseContext,
  summariseBrowseContext,
} from "@/lib/nest/storefront-browse-context";
import { trackStoreBehaviourEvent } from "@/lib/tracking/store-analytics";

export type NestStorefrontChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type NestStorefrontChatSession = {
  storeId: string;
  storeName: string;
  storeLogoUrl: string | null;
  chatId: string | null;
  messages: NestStorefrontChatMessage[];
  open: boolean;
  minimised: boolean;
};

type NestStorefrontChatContextValue = {
  session: NestStorefrontChatSession | null;
  /** Open the full chat panel (e.g. from "Message store → Chat via chatbot"). */
  openChatbot: (args: {
    storeId: string;
    storeName: string;
    storeLogoUrl?: string | null;
  }) => void;
  /**
   * Ensure the corner bubble is visible for this store (minimised), without
   * expanding the panel. Safe to call on every store-page mount.
   */
  ensureBubble: (args: {
    storeId: string;
    storeName: string;
    storeLogoUrl?: string | null;
  }) => void;
  /**
   * Open chat from a proactive Nest shopping nudge, seeding the assistant
   * question as the first turn when the thread is still empty/welcome-only.
   */
  openFromProactiveNudge: (question: string) => void;
  /** Hide the bubble when leaving store pages. */
  releaseBubble: (storeId?: string) => void;
  minimise: () => void;
  expand: () => void;
  close: () => void;
  sendMessage: (text: string) => Promise<void>;
  sending: boolean;
  /** True while the minimised corner bubble should be hidden (e.g. a modal is open). */
  bubbleHidden: boolean;
  /** Temporarily hide/show the minimised corner bubble without dropping the session. */
  setBubbleHidden: (hidden: boolean) => void;
};

const STORAGE_KEY = "yj-nest-storefront-chat-v1";

const NestStorefrontChatContext =
  React.createContext<NestStorefrontChatContextValue | null>(null);

function readSession(): NestStorefrontChatSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NestStorefrontChatSession;
    if (!parsed?.storeId || !parsed?.storeName) return null;
    return {
      storeId: parsed.storeId,
      storeName: parsed.storeName,
      storeLogoUrl: parsed.storeLogoUrl ?? null,
      chatId: parsed.chatId ?? null,
      messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-40) : [],
      // Never flash the bubble on non-store pages after refresh; store pages call ensureBubble.
      open: false,
      minimised: true,
    };
  } catch {
    return null;
  }
}

function writeSession(session: NestStorefrontChatSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (!session) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore quota / private mode failures.
  }
}

export function NestStorefrontChatProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<NestStorefrontChatSession | null>(null);
  const [hydrated, setHydrated] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [bubbleHidden, setBubbleHidden] = React.useState(false);

  React.useEffect(() => {
    setSession(readSession());
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    writeSession(session);
  }, [session, hydrated]);

  const openChatbot = React.useCallback(
    (args: { storeId: string; storeName: string; storeLogoUrl?: string | null }) => {
      setSession((prev) => {
        if (prev && prev.storeId === args.storeId) {
          return {
            ...prev,
            open: true,
            minimised: false,
            storeName: args.storeName,
            storeLogoUrl: args.storeLogoUrl ?? prev.storeLogoUrl,
          };
        }
        return {
          storeId: args.storeId,
          storeName: args.storeName,
          storeLogoUrl: args.storeLogoUrl ?? null,
          chatId: null,
          messages: [
            {
              id: `welcome-${Date.now()}`,
              role: "assistant",
              text: `Hi — ask us anything about ${args.storeName}.`,
            },
          ],
          open: true,
          minimised: false,
        };
      });
    },
    [],
  );

  const ensureBubble = React.useCallback(
    (args: { storeId: string; storeName: string; storeLogoUrl?: string | null }) => {
      setSession((prev) => {
        if (prev && prev.storeId === args.storeId) {
          // Keep an expanded panel open; otherwise ensure the corner bubble shows.
          return {
            ...prev,
            open: true,
            minimised: prev.open && !prev.minimised ? false : true,
            storeName: args.storeName,
            storeLogoUrl: args.storeLogoUrl ?? prev.storeLogoUrl,
          };
        }
        return {
          storeId: args.storeId,
          storeName: args.storeName,
          storeLogoUrl: args.storeLogoUrl ?? null,
          chatId: null,
          messages: [
            {
              id: `welcome-${Date.now()}`,
              role: "assistant",
              text: `Hi — ask us anything about ${args.storeName}.`,
            },
          ],
          open: true,
          minimised: true,
        };
      });
    },
    [],
  );

  const releaseBubble = React.useCallback((storeId?: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      if (storeId && prev.storeId !== storeId) return prev;
      // Keep conversation in sessionStorage, but hide the bubble off store pages.
      return { ...prev, open: false, minimised: true };
    });
  }, []);

  const openFromProactiveNudge = React.useCallback((question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;
    setSession((prev) => {
      if (!prev) return prev;
      const coreMessages = prev.messages.filter(
        (message) =>
          !message.id.startsWith("welcome-") &&
          !message.id.startsWith("waiting-") &&
          !message.id.startsWith("error-") &&
          !message.id.startsWith("nudge-"),
      );
      const seeded =
        coreMessages.length === 0
          ? [
              {
                id: `nudge-${Date.now()}`,
                role: "assistant" as const,
                text: trimmed,
              },
            ]
          : prev.messages;
      markProactiveNudgeDismissed(prev.storeId);
      trackStoreBehaviourEvent(prev.storeId, "message_open", {
        source: "proactive_nudge",
      });
      return {
        ...prev,
        open: true,
        minimised: false,
        messages: seeded,
      };
    });
  }, []);

  const minimise = React.useCallback(() => {
    setSession((prev) => (prev ? { ...prev, minimised: true, open: true } : prev));
  }, []);

  const expand = React.useCallback(() => {
    setSession((prev) => (prev ? { ...prev, minimised: false, open: true } : prev));
  }, []);

  // Close collapses to the corner bubble (always visible on store pages).
  const close = React.useCallback(() => {
    setSession((prev) => (prev ? { ...prev, open: true, minimised: true } : prev));
  }, []);

  const sendMessage = React.useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !session || sending) return;

      const userMessage: NestStorefrontChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        text: trimmed,
      };

      const history = session.messages
        .filter((m) => m.id.startsWith("welcome-") === false)
        .filter((m) => m.id.startsWith("waiting-") === false)
        .filter((m) => m.id.startsWith("error-") === false)
        .map((m) => ({ role: m.role, text: m.text }));

      setSession((prev) =>
        prev
          ? {
              ...prev,
              open: true,
              minimised: false,
              messages: [...prev.messages, userMessage],
            }
          : prev,
      );
      setSending(true);

      try {
        const browseContext = summariseBrowseContext(readBrowseContext(session.storeId));
        const res = await fetch(`/api/marketplace/store/${session.storeId}/nest-chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            chatId: session.chatId,
            history,
            browseContext,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          reply?: string | null;
          chatId?: string;
          staffActive?: boolean;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || "Could not send your message.");
        }

        const reply =
          typeof data.reply === "string" && data.reply.trim() ? data.reply.trim() : null;

        setSession((prev) => {
          if (!prev) return prev;
          const nextChatId =
            typeof data.chatId === "string" && data.chatId ? data.chatId : prev.chatId;
          if (reply) {
            return {
              ...prev,
              chatId: nextChatId,
              messages: [
                ...prev.messages,
                {
                  id: `assistant-${Date.now()}`,
                  role: "assistant",
                  text: reply,
                },
              ],
            };
          }
          // Staff has taken over — keep the customer message and wait for poll sync.
          if (data.staffActive) {
            const alreadyWaiting = prev.messages.some((m) => m.id.startsWith("waiting-"));
            return {
              ...prev,
              chatId: nextChatId,
              messages: alreadyWaiting
                ? prev.messages
                : [
                    ...prev.messages,
                    {
                      id: `waiting-${Date.now()}`,
                      role: "assistant",
                      text: "Thanks — a team member will reply shortly.",
                    },
                  ],
            };
          }
          return {
            ...prev,
            chatId: nextChatId,
            messages: [
              ...prev.messages,
              {
                id: `error-${Date.now()}`,
                role: "assistant",
                text: "Sorry — I could not reply just now. Try again in a moment.",
              },
            ],
          };
        });
      } catch (error) {
        setSession((prev) =>
          prev
            ? {
                ...prev,
                messages: [
                  ...prev.messages,
                  {
                    id: `error-${Date.now()}`,
                    role: "assistant",
                    text:
                      error instanceof Error
                        ? error.message
                        : "Could not send your message. Please try again.",
                  },
                ],
              }
            : prev,
        );
      } finally {
        setSending(false);
      }
    },
    [session, sending],
  );

  // Pull store replies (and any missed AI turns) into the website chatbot UI.
  React.useEffect(() => {
    if (!hydrated || !session?.open || !session.storeId || !session.chatId || sending) {
      return;
    }

    const storeId = session.storeId;
    const chatId = session.chatId;
    let cancelled = false;

    const syncFromServer = async () => {
      try {
        const res = await fetch(
          `/api/marketplace/store/${storeId}/nest-chat?chatId=${encodeURIComponent(chatId)}`,
          { cache: "no-store" },
        );
        const data = (await res.json().catch(() => ({}))) as {
          messages?: Array<{ id?: string; role?: string; text?: string }>;
        };
        if (!res.ok || cancelled || !Array.isArray(data.messages)) return;

        const mapped: NestStorefrontChatMessage[] = data.messages
          .filter(
            (message) =>
              (message.role === "user" || message.role === "assistant") &&
              typeof message.text === "string" &&
              message.text.trim().length > 0,
          )
          .map((message) => ({
            id: `srv-${String(message.id)}`,
            role: message.role === "user" ? "user" : "assistant",
            text: message.text!.trim(),
          }));

        if (mapped.length === 0) return;

        setSession((prev) => {
          if (!prev || prev.chatId !== chatId) return prev;
          const prevCore = prev.messages.filter(
            (m) =>
              !m.id.startsWith("welcome-") &&
              !m.id.startsWith("waiting-") &&
              !m.id.startsWith("error-"),
          );
          const unchanged =
            prevCore.length === mapped.length &&
            prevCore.every(
              (message, index) =>
                message.role === mapped[index]?.role && message.text === mapped[index]?.text,
            );
          if (unchanged) return prev;
          return { ...prev, messages: mapped };
        });
      } catch {
        // Ignore transient poll failures.
      }
    };

    void syncFromServer();
    const interval = window.setInterval(() => {
      void syncFromServer();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hydrated, session?.open, session?.storeId, session?.chatId, sending]);

  const value = React.useMemo(
    () => ({
      session: hydrated ? session : null,
      openChatbot,
      ensureBubble,
      openFromProactiveNudge,
      releaseBubble,
      minimise,
      expand,
      close,
      sendMessage,
      sending,
      bubbleHidden,
      setBubbleHidden,
    }),
    [
      hydrated,
      session,
      openChatbot,
      ensureBubble,
      openFromProactiveNudge,
      releaseBubble,
      minimise,
      expand,
      close,
      sendMessage,
      sending,
      bubbleHidden,
    ],
  );

  return (
    <NestStorefrontChatContext.Provider value={value}>
      {children}
      <NestStorefrontChatWidget />
      {/* Proactive agent nudge temporarily disabled */}
    </NestStorefrontChatContext.Provider>
  );
}

export function useNestStorefrontChat() {
  const ctx = React.useContext(NestStorefrontChatContext);
  if (!ctx) {
    throw new Error("useNestStorefrontChat must be used within NestStorefrontChatProvider");
  }
  return ctx;
}

function NestStorefrontChatWidget() {
  const { session, minimise, expand, close, sendMessage, sending, bubbleHidden } =
    useNestStorefrontChat();
  const [draft, setDraft] = React.useState("");
  const [introExpanded, setIntroExpanded] = React.useState(true);
  const [mobileViewport, setMobileViewport] = React.useState<{
    height: number;
    top: number;
  } | null>(null);
  const [keyboardOpen, setKeyboardOpen] = React.useState(false);
  const introPlayedRef = React.useRef(false);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!session?.open || session.minimised) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [session?.messages, session?.open, session?.minimised, sending]);

  React.useEffect(() => {
    if (!session?.open || session.minimised) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 180);
    return () => window.clearTimeout(timer);
  }, [session?.open, session?.minimised]);

  // Follow the visual viewport so the composer sits above the software keyboard.
  // A separate full-bleed white shell covers the layout viewport so the store
  // page never shows through the keyboard gap on mobile Safari/Chrome.
  React.useEffect(() => {
    if (!session?.open || session.minimised) {
      setMobileViewport(null);
      setKeyboardOpen(false);
      return;
    }
    if (!window.matchMedia("(max-width: 639px)").matches) {
      setMobileViewport(null);
      setKeyboardOpen(false);
      return;
    }

    const viewport = window.visualViewport;
    const updateViewport = () => {
      const height = Math.round(viewport?.height ?? window.innerHeight);
      const top = Math.round(viewport?.offsetTop ?? 0);
      setMobileViewport({ height, top });
      setKeyboardOpen(height < window.innerHeight - 80);
    };

    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("orientationchange", updateViewport);

    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, [session?.open, session?.minimised]);

  // Lock background scroll on the full-page mobile chat.
  React.useEffect(() => {
    if (!session?.open || session.minimised) return;
    if (!window.matchMedia("(max-width: 639px)").matches) return;

    const previousOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    const scrollY = window.scrollY;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      window.scrollTo(0, scrollY);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [session?.open, session?.minimised, close]);

  // Reset intro when leaving a store page so the next visit plays again.
  React.useEffect(() => {
    if (!session?.open) {
      introPlayedRef.current = false;
      setIntroExpanded(true);
    }
  }, [session?.open, session?.storeId]);

  // Wide "Tap here to chat" on load, then spring-collapse to the icon bubble.
  React.useEffect(() => {
    if (!session?.open || !session.minimised) return;
    if (introPlayedRef.current) {
      setIntroExpanded(false);
      return;
    }
    setIntroExpanded(true);
    const timer = window.setTimeout(() => {
      setIntroExpanded(false);
      introPlayedRef.current = true;
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [session?.open, session?.minimised, session?.storeId]);

  if (!session?.open) return null;

  if (session.minimised) {
    if (bubbleHidden) return null;
    return (
      <div
        className="fixed right-4 z-[90] pointer-events-none"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <motion.button
          type="button"
          onClick={expand}
          aria-label={`Chat with ${session.storeName}`}
          layout
          transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.8 }}
          className={cn(
            "pointer-events-auto inline-flex h-14 items-center overflow-hidden rounded-full bg-[#ffde59] text-gray-900 shadow-[0_8px_30px_rgba(0,0,0,0.16)]",
            introExpanded ? "gap-2.5 pl-4 pr-5" : "w-14 justify-center",
          )}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
            <MessageCircle className="h-6 w-6" />
          </span>
          <AnimatePresence initial={false}>
            {introExpanded ? (
              <motion.span
                key="tap-label"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.75 }}
                className="overflow-hidden whitespace-nowrap text-sm font-semibold tracking-tight"
              >
                Tap here to chat
              </motion.span>
            ) : null}
          </AnimatePresence>
        </motion.button>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {/* Opaque full-bleed shell so the store never shows behind the keyboard. */}
      <motion.div
        key="nest-storefront-chat-shell"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[119] bg-white sm:hidden"
        aria-hidden="true"
      />
      <motion.div
        key="nest-storefront-chat"
        initial={{ opacity: 0, y: 16, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.95 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        role="dialog"
        aria-modal="true"
        aria-label={`Chat with ${session.storeName}`}
        style={
          {
            "--chat-mobile-height": mobileViewport
              ? `${mobileViewport.height}px`
              : "100dvh",
            "--chat-mobile-top": mobileViewport ? `${mobileViewport.top}px` : "0px",
          } as React.CSSProperties
        }
        className="fixed left-0 right-0 top-[var(--chat-mobile-top)] z-[120] flex h-[var(--chat-mobile-height)] w-full flex-col overflow-hidden bg-white sm:bottom-[max(1rem,env(safe-area-inset-bottom))] sm:left-auto sm:right-4 sm:top-auto sm:h-[480px] sm:w-[360px] sm:rounded-md sm:border sm:border-gray-200 sm:shadow-[0_16px_48px_rgba(0,0,0,0.16)]"
      >
        <div
          className={cn(
            "flex shrink-0 items-center gap-2.5 border-b border-gray-100 bg-white px-3 pb-3 sm:gap-2.5 sm:bg-gray-50 sm:px-3 sm:py-2.5",
            keyboardOpen
              ? "pt-2"
              : "pt-[max(0.75rem,env(safe-area-inset-top))]",
          )}
        >
          <button
            type="button"
            onClick={close}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100 sm:hidden"
            aria-label="Back to store"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {session.storeLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.storeLogoUrl}
              alt={`${session.storeName} logo`}
              className="h-9 w-9 rounded-full object-cover ring-1 ring-gray-200 sm:h-8 sm:w-8 sm:rounded-md"
            />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-50 ring-1 ring-gray-200 sm:h-8 sm:w-8 sm:rounded-md">
              <Bot className="h-4 w-4 text-gray-500" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-gray-900 sm:text-sm">
              {session.storeName}
            </p>
            <p className="text-xs text-gray-500 sm:text-[11px]">AI store assistant</p>
          </div>
          <button
            type="button"
            onClick={minimise}
            className="hidden h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-200/70 hover:text-gray-800 sm:flex"
            aria-label="Minimise chat"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={close}
            className="hidden h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-200/70 hover:text-gray-800 sm:flex"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          ref={listRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-white px-4 py-4 sm:space-y-2.5 sm:px-3 sm:py-3"
        >
          {session.messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[88%] whitespace-pre-wrap px-3.5 py-2.5 text-[15px] leading-relaxed sm:max-w-[85%] sm:px-3 sm:py-2 sm:text-[13px]",
                  message.role === "user"
                    ? "rounded-[1.25rem] rounded-br-md bg-gray-900 text-white"
                    : "rounded-[1.25rem] rounded-bl-md border border-gray-200 bg-gray-50 text-gray-800",
                )}
              >
                {message.text}
              </div>
            </div>
          ))}
          {sending ? (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-[1.25rem] border border-gray-200 bg-gray-50 px-3.5 py-2 text-[13px] text-gray-500 sm:text-[12px]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Typing…
              </div>
            </div>
          ) : null}
        </div>

        <form
          className={cn(
            "flex shrink-0 items-center gap-2 bg-white px-3 pt-2 sm:border-t sm:border-gray-100 sm:px-3 sm:py-2.5",
            keyboardOpen
              ? "pb-2"
              : "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          )}
          onSubmit={(event) => {
            event.preventDefault();
            const next = draft;
            setDraft("");
            void sendMessage(next);
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask a question…"
            disabled={sending}
            enterKeyHint="send"
            className="h-11 min-w-0 flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 text-base text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 sm:h-10 sm:rounded-xl sm:bg-white sm:px-3 sm:text-sm"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white transition-colors hover:bg-gray-800 disabled:opacity-50 sm:h-10 sm:w-10 sm:rounded-xl"
            aria-label="Send message"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>

        <div className="hidden shrink-0 items-center justify-center gap-1.5 border-t border-gray-100 bg-gray-50/80 px-3 py-2 sm:flex">
          <span className="text-[11px] text-gray-400">Powered by</span>
          <Image
            src="/yjsmall.png"
            alt="Yellow Jersey"
            width={16}
            height={16}
            className="h-4 w-4 rounded-md"
          />
          <span className="text-[11px] font-medium text-gray-500">Yellow Jersey</span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function NestStorefrontProactiveNudge() {
  const { session, openFromProactiveNudge } = useNestStorefrontChat();
  const enabled = Boolean(session?.open && session.minimised && session.storeId);
  const { nudge, dismissNudge } = useStorefrontProactiveNudge({
    storeId: session?.storeId ?? null,
    enabled,
  });

  const visible = enabled && nudge.status === "ready" && Boolean(nudge.question);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="nest-proactive-nudge"
          initial={{ opacity: 0, y: 16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.95 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed right-4 z-[91] w-[min(20.5rem,calc(100vw-2rem))]"
          style={{ bottom: "max(5.25rem, calc(env(safe-area-inset-bottom) + 4.25rem))" }}
        >
          <div className="rounded-md border border-gray-200 bg-white p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.14)]">
            <div className="flex items-start gap-2.5">
              {session?.storeLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.storeLogoUrl}
                  alt=""
                  className="mt-0.5 h-8 w-8 shrink-0 rounded-md object-cover ring-1 ring-gray-200"
                />
              ) : (
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-50 ring-1 ring-gray-200">
                  <Bot className="h-4 w-4 text-gray-500" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-500">
                  {nudge.assistantLabel || session?.storeName || "Store"}
                </p>
                <p className="mt-1 text-sm font-medium leading-snug text-gray-900">
                  {nudge.question}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (nudge.question) openFromProactiveNudge(nudge.question);
                      dismissNudge();
                    }}
                    className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800"
                  >
                    Chat about this
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (session?.storeId) {
                        trackStoreBehaviourEvent(session.storeId, "message_open", {
                          source: "proactive_nudge_dismiss",
                        });
                      }
                      dismissNudge();
                    }}
                    className="rounded-md px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                  >
                    Not now
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (session?.storeId) {
                    trackStoreBehaviourEvent(session.storeId, "message_open", {
                      source: "proactive_nudge_dismiss",
                    });
                  }
                  dismissNudge();
                }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
