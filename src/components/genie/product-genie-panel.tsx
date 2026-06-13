"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { motion } from "framer-motion";
import { Loader2, Maximize2, Minimize2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useGenie } from "@/components/providers/genie-provider";
import { GenieMarketplaceProductCards } from "@/components/genie/genie-marketplace-product-cards";
import { GenieYoutubeVideos } from "@/components/genie/genie-youtube-videos";
import type { GenieMarketplaceProduct } from "@/lib/genie/marketplace-search";
import type { GenieYoutubeVideoPreview } from "@/lib/genie/youtube-video-search";
import { renderGenieMarkdown } from "@/lib/genie/render-markdown";
import {
  genieProgressShimmerClassName,
  genieProgressShimmerStyle,
} from "@/lib/genie/shimmer";
import { pickRandomProductGenieTitle } from "@/lib/genie/product-genie-titles";
import { FALLBACK_PRODUCT_GENIE_SUGGESTIONS } from "@/lib/genie/product-suggestions";
import { GenieSellerMessageCta } from "@/components/genie/genie-seller-message-cta";
import { resolveSellerCta, type SellerIntentReason } from "@/lib/genie/seller-intent";
import type { ProductGenieContext } from "@/lib/genie/product-context";
import { cn } from "@/lib/utils";

interface Citation {
  url: string;
  title: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  statusText?: string;
  sources?: Citation[];
  products?: GenieMarketplaceProduct[];
  videos?: GenieYoutubeVideoPreview[];
  error?: string;
  sellerCta?: {
    reason: SellerIntentReason;
    suggestedMessage: string;
  };
}

const SUGGESTION_SKELETON_WIDTHS = ["w-[7.5rem]", "w-[9rem]", "w-[8rem]"] as const;

const ASSISTANT_MARKDOWN_CLASS =
  "max-w-none text-left text-sm leading-relaxed text-gray-700 [&_a]:text-gray-700 [&_a]:underline [&_strong]:font-medium [&_strong]:text-gray-900 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:text-left [&_table]:w-full [&_th]:whitespace-nowrap [&_td]:whitespace-normal [&_td]:break-words";

const PANEL_CLOSE_MS = 320;
const DESKTOP_PANEL_WIDTH_PX = 400;
const DESKTOP_PANEL_EXPANDED_WIDTH = "clamp(400px, 40vw, calc(100vw - 3rem))";
const DESKTOP_PANEL_HEIGHT = "min(85vh, 680px)";
const DESKTOP_PANEL_EXPANDED_HEIGHT = "min(92vh, 920px)";
const DESKTOP_EXPAND_STORAGE_KEY = "yj-product-genie-expanded";
const DESKTOP_PANEL_SPRING = { type: "spring" as const, damping: 19, stiffness: 280, mass: 0.82 };
const SHEET_HEIGHT = "min(85dvh, calc(100dvh - env(safe-area-inset-bottom)))";
const MOBILE_KEYBOARD_THRESHOLD_PX = 80;

type MobileSheetViewport = {
  top: number;
  bottom: number;
  height: number;
  keyboardOpen: boolean;
};

function useMobileSheetViewport(active: boolean) {
  const [metrics, setMetrics] = React.useState<MobileSheetViewport>({
    top: 0,
    bottom: 0,
    height: 0,
    keyboardOpen: false,
  });
  const refreshRef = React.useRef<() => void>(() => {});

  React.useEffect(() => {
    if (!active || typeof window === "undefined") return;

    const update = () => {
      const layoutHeight = window.innerHeight;
      const vv = window.visualViewport;

      if (!vv) {
        setMetrics({
          top: 0,
          bottom: 0,
          height: layoutHeight,
          keyboardOpen: false,
        });
        return;
      }

      const bottomInset = Math.max(0, layoutHeight - vv.height - vv.offsetTop);
      setMetrics({
        top: vv.offsetTop,
        bottom: bottomInset,
        height: vv.height,
        keyboardOpen: bottomInset > MOBILE_KEYBOARD_THRESHOLD_PX,
      });
    };

    refreshRef.current = update;
    update();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);

    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [active]);

  const refresh = React.useCallback(() => {
    refreshRef.current();
  }, []);

  return { metrics, refresh };
}

function createMessageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatPrice(price: number | null | undefined): string {
  if (price == null || price <= 0) return "Price on request";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(price);
}

function SourcePill({ citation }: { citation: Citation }) {
  let displayName = citation.title;
  try {
    const hostname = new URL(citation.url).hostname.replace(/^www\./, "");
    if (!citation.title || citation.title === citation.url) displayName = hostname;
    else displayName = citation.title.length > 40 ? hostname : citation.title;
  } catch {
    // keep title
  }

  return (
    <a
      href={citation.url}
      target="_blank"
      rel="noopener noreferrer"
      className="truncate text-xs text-gray-500 underline-offset-2 transition-colors hover:text-gray-800 hover:underline"
    >
      {displayName}
    </a>
  );
}

function readDesktopExpandedPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(DESKTOP_EXPAND_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDesktopExpandedPreference(expanded: boolean) {
  try {
    window.sessionStorage.setItem(DESKTOP_EXPAND_STORAGE_KEY, expanded ? "1" : "0");
  } catch {
    // ignore storage failures
  }
}

function AssistantMessage({
  message,
  productContext,
  isExpanded,
}: {
  message: ChatMessage;
  productContext: ProductGenieContext;
  isExpanded?: boolean;
}) {
  const html = React.useMemo(
    () => renderGenieMarkdown(message.content, { compact: !isExpanded, linkMode: "text" }),
    [message.content, isExpanded],
  );

  const markdownClass = cn(
    ASSISTANT_MARKDOWN_CLASS,
    isExpanded && "text-base leading-relaxed [&_ul]:text-base",
  );

  return (
    <div className="space-y-2 text-left">
      {message.isStreaming && message.statusText && (
        <p
          className={cn(
            "text-left leading-relaxed text-gray-500",
            isExpanded ? "text-sm" : "text-xs",
            genieProgressShimmerClassName,
          )}
          style={genieProgressShimmerStyle}
        >
          {message.statusText}
        </p>
      )}
      {message.content ? (
        <div className={markdownClass} dangerouslySetInnerHTML={{ __html: html }} />
      ) : null}
      {message.isStreaming && !message.content && !message.statusText && (
        <p
          className={cn(
            "leading-relaxed text-gray-500",
            isExpanded ? "text-sm" : "text-xs",
            genieProgressShimmerClassName,
          )}
          style={genieProgressShimmerStyle}
        >
          Thinking…
        </p>
      )}
      {message.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {message.error}
        </p>
      )}
      {message.products && message.products.length > 0 && (
        <GenieMarketplaceProductCards
          products={message.products}
          label="Similar on Yellow Jersey"
          className="pt-1"
        />
      )}
      {message.videos && message.videos.length > 0 && (
        <GenieYoutubeVideos
          videos={message.videos}
          title={message.videos.length > 1 ? "Helpful videos" : "Helpful video"}
          className="pt-1"
        />
      )}
      {message.sources && message.sources.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
          {message.sources.map((source, index) => (
            <SourcePill key={`${source.url}-${index}`} citation={source} />
          ))}
        </div>
      )}
      {message.sellerCta && !message.isStreaming ? (
        <GenieSellerMessageCta
          product={productContext}
          reason={message.sellerCta.reason}
          suggestedMessage={message.sellerCta.suggestedMessage}
        />
      ) : null}
    </div>
  );
}

function ProductGeniePanelBody({
  productContext,
  headerTitle,
  suggestions,
  suggestionsLoading,
  close,
  messages,
  isEmpty,
  sendMessage,
  scrollRef,
  inputRef,
  input,
  setInput,
  isLoading,
  handleSubmit,
  handleKeyDown,
  onInputFocus,
  isExpanded,
  onToggleExpand,
  showExpandControl,
}: {
  productContext: NonNullable<ReturnType<typeof useGenie>["productContext"]>;
  headerTitle: string;
  suggestions: string[];
  suggestionsLoading: boolean;
  close: () => void;
  messages: ChatMessage[];
  isEmpty: boolean;
  sendMessage: (text: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  handleSubmit: (event: React.FormEvent) => void;
  handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onInputFocus?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  showExpandControl?: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden text-left">
      <header className="shrink-0 px-4 pt-3 sm:pt-4">
        <div className="mb-3 mx-auto h-1 w-10 rounded-full bg-gray-200 sm:hidden" aria-hidden />
        <div className="flex w-full items-start justify-between gap-3 pb-3">
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "font-semibold text-gray-900 tracking-tight",
                isExpanded ? "text-2xl" : "text-lg sm:text-xl",
              )}
            >
              {headerTitle}
            </p>
            <div className="mt-2 flex items-center gap-2.5">
              <div
                className={cn(
                  "relative shrink-0 overflow-hidden rounded-md bg-gray-100",
                  isExpanded ? "h-12 w-12" : "h-10 w-10",
                )}
              >
                {productContext.image ? (
                  <Image
                    src={productContext.image}
                    alt=""
                    fill
                    className="object-cover"
                    sizes={isExpanded ? "48px" : "40px"}
                  />
                ) : null}
              </div>
              <div className="min-w-0">
                <p className={cn("truncate text-gray-600", isExpanded ? "text-sm" : "text-xs")}>
                  {productContext.name}
                </p>
                <p className={cn("font-medium text-gray-900", isExpanded ? "text-sm" : "text-xs")}>
                  {formatPrice(productContext.price)}
                </p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {showExpandControl ? (
              <button
                type="button"
                onClick={onToggleExpand}
                className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label={isExpanded ? "Use compact panel size" : "Expand panel for easier reading"}
                title={isExpanded ? "Compact size" : "Expand for easier reading"}
              >
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            ) : null}
            <button
              type="button"
              onClick={close}
              className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {isEmpty ? (
        <div className="shrink-0 border-b border-gray-100 px-4 pb-3">
          <div className="flex flex-col items-stretch gap-2">
            {suggestionsLoading
              ? SUGGESTION_SKELETON_WIDTHS.map((width, index) => (
                  <div
                    key={index}
                    className={cn("h-7 animate-pulse rounded-md bg-gray-100", width)}
                    aria-hidden
                  />
                ))
              : suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => sendMessage(suggestion)}
                    className={cn(
                      "rounded-md bg-gray-100 px-3 py-1.5 text-left leading-snug text-gray-600 transition-colors hover:bg-gray-200/80 hover:text-gray-800",
                      isExpanded ? "text-sm" : "text-xs",
                    )}
                  >
                    {suggestion}
                  </button>
                ))}
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y px-4 [-webkit-overflow-scrolling:touch]",
          isEmpty ? "py-2" : "space-y-5 py-4",
        )}
      >
        {!isEmpty
          ? messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <div
                    className={cn(
                      "max-w-[88%] rounded-md bg-gray-100 px-3 py-2 text-left leading-snug text-gray-900 sm:max-w-[80%]",
                      isExpanded ? "text-base" : "text-sm",
                    )}
                  >
                    {message.content}
                  </div>
                </div>
              ) : (
                <div key={message.id}>
                  <AssistantMessage
                    message={message}
                    productContext={productContext}
                    isExpanded={isExpanded}
                  />
                </div>
              ),
            )
          : null}
      </div>

      <footer
        className="shrink-0 border-t border-gray-100 px-4 py-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <form onSubmit={handleSubmit}>
          <div className="relative rounded-xl border border-gray-200 bg-white">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={onInputFocus}
              placeholder="Ask anything about this…"
              rows={1}
              disabled={isLoading}
              className={cn(
                "max-h-[120px] resize-none rounded-xl border-0 bg-transparent px-3 py-2.5 pr-11 text-left leading-relaxed text-foreground shadow-none focus-visible:ring-0",
                isExpanded ? "min-h-[52px] text-base" : "min-h-[44px] text-sm",
              )}
            />
            <Button
              type="submit"
              size="icon-sm"
              variant="ghost"
              disabled={!input.trim() || isLoading}
              className="absolute bottom-1 right-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </footer>
    </div>
  );
}

export function ProductGeniePanel() {
  const { isOpen, close, productContext } = useGenie();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [shouldRender, setShouldRender] = React.useState(isOpen && !!productContext);
  const [isLeaving, setIsLeaving] = React.useState(false);
  const [isMounted, setIsMounted] = React.useState(false);
  const [headerTitle, setHeaderTitle] = React.useState(pickRandomProductGenieTitle);
  const [suggestions, setSuggestions] = React.useState<string[]>([
    ...FALLBACK_PRODUCT_GENIE_SUGGESTIONS,
  ]);
  const [suggestionsLoading, setSuggestionsLoading] = React.useState(false);
  const [isDesktopExpanded, setIsDesktopExpanded] = React.useState(false);

  React.useEffect(() => {
    setIsDesktopExpanded(readDesktopExpandedPreference());
  }, []);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const toggleDesktopExpand = React.useCallback(() => {
    setIsDesktopExpanded((current) => {
      const next = !current;
      writeDesktopExpandedPreference(next);
      return next;
    });
  }, []);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const panelActive = isOpen && !!productContext;

  React.useEffect(() => {
    if (panelActive) {
      setHeaderTitle(pickRandomProductGenieTitle());
    }
  }, [panelActive, productContext?.id]);

  React.useEffect(() => {
    if (!panelActive || !productContext?.id) return;

    let cancelled = false;
    const controller = new AbortController();

    setSuggestions([...FALLBACK_PRODUCT_GENIE_SUGGESTIONS]);
    setSuggestionsLoading(true);

    fetch("/api/genie/product-suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: productContext }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { suggestions?: string[] };
        if (cancelled) return;
        if (Array.isArray(data.suggestions) && data.suggestions.length >= 3) {
          setSuggestions(data.suggestions.slice(0, 3));
        }
      })
      .catch((error) => {
        if (cancelled || (error as Error).name === "AbortError") return;
        setSuggestions([...FALLBACK_PRODUCT_GENIE_SUGGESTIONS]);
      })
      .finally(() => {
        if (!cancelled) setSuggestionsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [panelActive, productContext]);

  React.useEffect(() => {
    if (panelActive) {
      setShouldRender(true);
      setIsLeaving(false);
      return;
    }

    if (!shouldRender) return;

    setIsLeaving(true);
    const timer = window.setTimeout(() => {
      setShouldRender(false);
      setIsLeaving(false);
    }, PANEL_CLOSE_MS);

    return () => window.clearTimeout(timer);
  }, [panelActive, shouldRender]);

  React.useEffect(() => {
    if (!shouldRender) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [shouldRender]);

  React.useEffect(() => {
    if (!panelActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelActive, close]);

  React.useEffect(() => {
    if (!panelActive) return;
    const isMobile = window.matchMedia("(max-width: 639px)").matches;
    if (isMobile) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 320);
    return () => window.clearTimeout(focusTimer);
  }, [panelActive, productContext?.id]);

  const { metrics: mobileViewport, refresh: refreshMobileViewport } =
    useMobileSheetViewport(shouldRender);

  const handleMobileInputFocus = React.useCallback(() => {
    refreshMobileViewport();
    window.requestAnimationFrame(() => refreshMobileViewport());
    window.setTimeout(() => refreshMobileViewport(), 120);
    window.setTimeout(() => refreshMobileViewport(), 360);
  }, [refreshMobileViewport]);

  React.useEffect(() => {
    if (!isOpen) {
      setMessages([]);
      setInput("");
      abortRef.current?.abort();
      abortRef.current = null;
      setIsLoading(false);
    }
  }, [isOpen, productContext?.id]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = React.useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading || !productContext) return;

      const userMsg: ChatMessage = {
        id: createMessageId(),
        role: "user",
        content: text.trim(),
      };
      const assistantId = createMessageId();

      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          isStreaming: true,
          statusText: "Thinking…",
        },
      ]);
      setInput("");
      setIsLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const streamState = { pending: "", rafId: null as number | null, assistantText: "" };

      const flush = () => {
        if (!streamState.pending) {
          streamState.rafId = null;
          return;
        }
        const chunk = streamState.pending;
        streamState.pending = "";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + chunk, statusText: undefined } : m,
          ),
        );
        streamState.rafId = null;
      };

      try {
        const history = [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/genie/product-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, product: productContext }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;

            try {
              const parsed = JSON.parse(raw) as Record<string, unknown>;
              if (parsed.event === "status" && typeof parsed.text === "string") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, statusText: parsed.text as string } : m,
                  ),
                );
              }
              if (parsed.event === "text_delta" && typeof parsed.text === "string") {
                streamState.pending += parsed.text;
                streamState.assistantText += parsed.text;
                if (streamState.rafId === null) {
                  streamState.rafId = requestAnimationFrame(flush);
                }
              }
              if (
                parsed.event === "seller_cta" &&
                typeof parsed.reason === "string" &&
                typeof parsed.suggestedMessage === "string"
              ) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          sellerCta: {
                            reason: parsed.reason as SellerIntentReason,
                            suggestedMessage: parsed.suggestedMessage as string,
                          },
                        }
                      : m,
                  ),
                );
              }
              if (parsed.event === "products" && Array.isArray(parsed.products)) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, products: parsed.products as GenieMarketplaceProduct[] }
                      : m,
                  ),
                );
              }
              if (parsed.event === "videos" && Array.isArray(parsed.videos)) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, videos: parsed.videos as GenieYoutubeVideoPreview[] }
                      : m,
                  ),
                );
              }
              if (parsed.event === "sources" && Array.isArray(parsed.sources)) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, sources: parsed.sources as Citation[] } : m,
                  ),
                );
              }
              if (parsed.event === "error") {
                throw new Error(String(parsed.message ?? "Something went wrong"));
              }
            } catch (parseError) {
              if (parseError instanceof SyntaxError) continue;
              throw parseError;
            }
          }
        }

        if (streamState.rafId !== null) {
          cancelAnimationFrame(streamState.rafId);
        }
        flush();
        const sellerCta = resolveSellerCta(userMsg.content, streamState.assistantText);
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            const nextMessage = { ...m, isStreaming: false, statusText: undefined };
            if (!m.sellerCta && sellerCta?.needsSeller && sellerCta.reason) {
              nextMessage.sellerCta = {
                reason: sellerCta.reason,
                suggestedMessage: sellerCta.suggestedMessage,
              };
            }
            return nextMessage;
          }),
        );
      } catch (err) {
        if (streamState.rafId !== null) {
          cancelAnimationFrame(streamState.rafId);
        }
        if ((err as Error).name === "AbortError") return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  isStreaming: false,
                  statusText: undefined,
                  error: "Could not get an answer right now. Please try again.",
                }
              : m,
          ),
        );
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [isLoading, messages, productContext],
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(input);
    }
  };

  if (!productContext || !shouldRender || !isMounted) return null;

  const isEmpty = messages.length === 0;
  const panelState = isLeaving ? "closed" : "open";
  const mobileSheetHeight =
    mobileViewport.height > 0
      ? mobileViewport.keyboardOpen
        ? mobileViewport.height
        : Math.round(mobileViewport.height * 0.85)
      : undefined;

  const bodyProps = {
    productContext,
    headerTitle,
    suggestions,
    suggestionsLoading,
    close,
    messages,
    isEmpty,
    sendMessage,
    scrollRef,
    inputRef,
    input,
    setInput,
    isLoading,
    handleSubmit,
    handleKeyDown,
    onInputFocus: handleMobileInputFocus,
  };

  const desktopBodyProps = {
    ...bodyProps,
    isExpanded: isDesktopExpanded,
    onToggleExpand: toggleDesktopExpand,
    showExpandControl: true,
  };

  const panel = (
    <>
      {/* Mobile: native bottom sheet */}
      <div
        data-state={panelState}
        className="store-message-overlay fixed inset-x-0 z-[110] flex items-end justify-center bg-black/40 px-0 sm:hidden"
        role="presentation"
        style={{
          top: mobileViewport.top,
          bottom: mobileViewport.bottom,
          pointerEvents: isLeaving ? "none" : "auto",
        }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div
          data-state={panelState}
          role="dialog"
          aria-modal="true"
          aria-label="Ask about this product"
          className="store-message-sheet flex w-full flex-col overflow-hidden rounded-t-2xl border border-gray-200/80 bg-white shadow-xl"
          style={{
            height: mobileSheetHeight ?? SHEET_HEIGHT,
            maxHeight: mobileViewport.height > 0 ? mobileViewport.height : SHEET_HEIGHT,
          }}
        >
          <ProductGeniePanelBody {...bodyProps} />
        </div>
      </div>

      {/* Desktop: bottom-right popup */}
      <div className="hidden sm:block">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isLeaving ? 0 : 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed inset-0 z-40 bg-black/20"
          style={{ pointerEvents: isLeaving ? "none" : "auto" }}
          onClick={close}
        />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Ask about this product"
          initial={{ opacity: 0, y: 36, scale: 0.88 }}
          animate={
            isLeaving
              ? { opacity: 0, y: 24, scale: 0.92 }
              : {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  width: isDesktopExpanded ? DESKTOP_PANEL_EXPANDED_WIDTH : DESKTOP_PANEL_WIDTH_PX,
                  height: isDesktopExpanded ? DESKTOP_PANEL_EXPANDED_HEIGHT : DESKTOP_PANEL_HEIGHT,
                }
          }
          transition={{
            ...DESKTOP_PANEL_SPRING,
            width: { type: "spring", damping: 22, stiffness: 260, mass: 0.82 },
            height: { type: "spring", damping: 22, stiffness: 260, mass: 0.82 },
          }}
          className={cn(
            "fixed bottom-6 right-6 z-50 flex shrink-0 flex-col overflow-hidden",
            "rounded-2xl border border-gray-200 bg-white shadow-2xl ring-1 ring-black/5",
            "mb-[env(safe-area-inset-bottom)]",
            "max-w-[calc(100vw-3rem)]",
          )}
          style={{
            transformOrigin: "bottom right",
            pointerEvents: isLeaving ? "none" : "auto",
          }}
        >
          <ProductGeniePanelBody {...desktopBodyProps} />
        </motion.div>
      </div>
    </>
  );

  return createPortal(panel, document.body);
}
