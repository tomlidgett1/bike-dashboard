"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useGenie } from "@/components/providers/genie-provider";
import { renderGenieMarkdown } from "@/lib/genie/render-markdown";
import {
  genieProgressShimmerClassName,
  genieProgressShimmerStyle,
} from "@/lib/genie/shimmer";
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
  error?: string;
}

const SUGGESTIONS = ["Is this good value?", "What should I check?"];

const PANEL_CLOSE_MS = 360;
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

function AssistantMessage({ message }: { message: ChatMessage }) {
  const html = React.useMemo(
    () => renderGenieMarkdown(message.content, { compact: true, linkMode: "text" }),
    [message.content],
  );

  return (
    <div className="space-y-2">
      {message.isStreaming && message.statusText && (
        <p
          className={cn(
            "text-xs leading-relaxed text-gray-500",
            genieProgressShimmerClassName,
          )}
          style={genieProgressShimmerStyle}
        >
          {message.statusText}
        </p>
      )}
      {message.content && (
        <div
          className={cn(
            "max-w-none text-sm leading-relaxed text-gray-700 [&_a]:text-gray-700 [&_a]:underline [&_strong]:font-medium [&_strong]:text-gray-900 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4",
            message.isStreaming ? "opacity-90" : "",
          )}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      {message.isStreaming && !message.content && !message.statusText && (
        <p
          className={cn("text-xs leading-relaxed text-gray-500", genieProgressShimmerClassName)}
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
      {message.sources && message.sources.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
          {message.sources.map((source, index) => (
            <SourcePill key={`${source.url}-${index}`} citation={source} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductGeniePanelBody({
  productContext,
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
}: {
  productContext: NonNullable<ReturnType<typeof useGenie>["productContext"]>;
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
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 px-4 pt-3 sm:pt-4">
        <div className="mb-3 mx-auto h-1 w-10 rounded-full bg-gray-200 sm:hidden" aria-hidden />
        <div className="flex w-full items-start justify-between gap-3 pb-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">Ask anything</p>
            <div className="mt-2 flex items-center gap-2.5">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-gray-100">
                {productContext.image ? (
                  <Image
                    src={productContext.image}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="40px"
                  />
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs text-gray-600">{productContext.name}</p>
                <p className="text-xs font-medium text-gray-900">{formatPrice(productContext.price)}</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {isEmpty ? (
        <div className="shrink-0 border-b border-gray-100 px-4 pb-3">
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => sendMessage(suggestion)}
                className="rounded-md bg-gray-100 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-200/80 hover:text-gray-800"
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
                  <div className="max-w-[88%] rounded-md bg-gray-100 px-3 py-2 text-sm leading-snug text-gray-900 sm:max-w-[80%]">
                    {message.content}
                  </div>
                </div>
              ) : (
                <div key={message.id}>
                  <AssistantMessage message={message} />
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
          <div className="relative rounded-md border border-gray-200 bg-white">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={onInputFocus}
              placeholder="Ask anything about this…"
              rows={1}
              disabled={isLoading}
              className="min-h-[44px] max-h-[120px] resize-none border-0 bg-transparent px-3 py-2.5 pr-11 text-sm leading-relaxed text-foreground shadow-none focus-visible:ring-0"
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

  React.useEffect(() => {
    setIsMounted(true);
  }, []);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const panelActive = isOpen && !!productContext;

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
          statusText: "Searching official sources…",
        },
      ]);
      setInput("");
      setIsLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;

      let pending = "";

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

        const flush = () => {
          if (!pending) return;
          const chunk = pending;
          pending = "";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + chunk, statusText: undefined } : m,
            ),
          );
        };

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
                pending += parsed.text;
                flush();
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

        flush();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, isStreaming: false, statusText: undefined } : m,
          ),
        );
      } catch (err) {
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

  const panel = (
    <>
      {/* Mobile: native bottom sheet */}
      <div
        data-state={panelState}
        className="store-message-overlay fixed inset-x-0 z-[110] flex items-end justify-center bg-black/30 px-0 sm:hidden"
        role="presentation"
        style={{
          top: mobileViewport.top,
          bottom: mobileViewport.bottom,
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

      {/* Desktop: side panel */}
      <div className="hidden sm:contents">
        <div
          className="fixed inset-0 z-40 bg-black/20"
          style={{
            opacity: isLeaving ? 0 : 1,
            pointerEvents: isLeaving ? "none" : "auto",
            transition: "opacity 0.2s ease",
          }}
          onClick={close}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ask about this product"
          className={cn(
            "fixed right-3 top-[1.5%] z-50 flex w-[min(420px,calc(100vw-24px))] max-w-[calc(100vw-24px)] flex-col overflow-hidden",
            "rounded-md border border-gray-200 bg-white shadow-lg",
          )}
          style={{
            height: "min(92vh, 720px)",
            transform: isLeaving ? "translateX(calc(100% + 24px))" : "translateX(0)",
            transition: "transform 0.38s cubic-bezier(0.32, 0.72, 0, 1)",
            pointerEvents: isLeaving ? "none" : "auto",
          }}
        >
          <ProductGeniePanelBody {...bodyProps} />
        </div>
      </div>
    </>
  );

  return createPortal(panel, document.body);
}
