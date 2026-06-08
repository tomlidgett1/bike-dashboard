"use client";

import * as React from "react";
import Image from "next/image";
import { Globe, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useGenie } from "@/components/providers/genie-provider";
import { renderGenieMarkdown } from "@/lib/genie/render-markdown";
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

const SUGGESTIONS = [
  "Is this good value?",
  "What should I know before buying?",
  "How does this compare to similar options?",
  "Anything I should check on this listing?",
];

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
      className="inline-flex max-w-[160px] items-center gap-1.5 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-medium text-gray-600 transition-all hover:border-gray-300 hover:text-gray-900"
    >
      <Globe className="h-2.5 w-2.5 shrink-0 text-gray-500" />
      <span className="truncate">{displayName}</span>
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
      {message.isStreaming && !message.content && message.statusText && (
        <p className="text-xs text-gray-500">{message.statusText}</p>
      )}
      {message.content && (
        <div
          className="prose prose-sm max-w-none text-sm leading-relaxed text-gray-800 [&_strong]:font-semibold [&_strong]:text-gray-900 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      {message.isStreaming && message.content && (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
      )}
      {message.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {message.error}
        </p>
      )}
      {message.sources && message.sources.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[10px] font-medium text-gray-500">Official sources</p>
          <div className="flex flex-wrap gap-1.5">
            {message.sources.map((source, index) => (
              <SourcePill key={`${source.url}-${index}`} citation={source} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProductGeniePanel() {
  const { isOpen, close, productContext } = useGenie();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);

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
        id: crypto.randomUUID(),
        role: "user",
        content: text.trim(),
      };
      const assistantId = crypto.randomUUID();

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

  if (!productContext) return null;

  const isEmpty = messages.length === 0;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20 animate-in fade-in duration-200"
        style={{
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 0.2s ease",
        }}
        onClick={close}
      />

      <div
        className={cn(
          "fixed right-3 top-[1.5%] z-50 flex w-[min(420px,calc(100vw-24px))] max-w-[calc(100vw-24px)] flex-col overflow-hidden",
          "rounded-2xl border border-gray-200 bg-white shadow-xl",
          "animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out",
        )}
        style={{
          height: "97vh",
          transform: isOpen ? "translateX(0)" : "translateX(calc(100% + 24px))",
          transition: "transform 0.38s cubic-bezier(0.32, 0.72, 0, 1)",
          pointerEvents: isOpen ? "auto" : "none",
        }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Image
              src="/yjsmall.png"
              alt="Yellow Jersey"
              width={32}
              height={32}
              className="size-8 shrink-0 rounded-md object-contain"
              priority
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">Ask about this product</p>
              <p className="text-[11px] text-gray-500">Official sources · Yellow Jersey Genius</p>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="shrink-0 border-b border-gray-100 bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
              {productContext.image ? (
                <Image
                  src={productContext.image}
                  alt={productContext.name}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                  No image
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium leading-snug text-gray-900">
                {productContext.name}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                {productContext.brand && <span>{productContext.brand}</span>}
                {productContext.condition && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{productContext.condition}</span>
                  </>
                )}
              </div>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {formatPrice(productContext.price)}
              </p>
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {isEmpty ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Ask anything about this listing — sizing, specs, fit, value, or how it compares.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => sendMessage(suggestion)}
                    className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[86%] rounded-[24px] bg-primary px-4 py-2 text-sm leading-snug text-primary-foreground shadow-sm sm:max-w-[78%]">
                    {message.content}
                  </div>
                </div>
              ) : (
                <div key={message.id}>
                  <AssistantMessage message={message} />
                </div>
              ),
            )
          )}
        </div>

        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3">
          <form onSubmit={handleSubmit}>
            <div className="relative overflow-hidden rounded-xl border-2 border-yellow-400 bg-gray-100 shadow-[0_2px_4px_rgba(0,0,0,0.04),0_8px_16px_rgba(0,0,0,0.06),0_16px_24px_rgba(234,179,8,0.14)] ring-1 ring-black/5">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about this product…"
                rows={2}
                disabled={isLoading}
                className="min-h-[72px] max-h-[140px] resize-none border-0 bg-transparent px-3.5 py-3 pr-12 text-sm leading-relaxed text-foreground shadow-none focus-visible:ring-0"
              />
              <Button
                type="submit"
                size="icon-sm"
                disabled={!input.trim() || isLoading}
                className="absolute bottom-2.5 right-2.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
