"use client";

import * as React from "react";
import Link from "next/link";
import { Bot, Command, Search, User, X } from "lucide-react";
import type { CrmCustomerSummary, CustomerListResponse } from "@/components/crm/types";
import { errorMessage } from "@/components/crm/types";

type AskResponse = {
  answer?: string;
  grounding?: Array<{ label: string; href: string }>;
  error?: string;
};

export function CrmCommandBar() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [customers, setCustomers] = React.useState<CrmCustomerSummary[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [asking, setAsking] = React.useState(false);
  const [answer, setAnswer] = React.useState<AskResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  React.useEffect(() => {
    if (!open || query.trim().length < 2) {
      setCustomers([]);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const params = new URLSearchParams({ query: query.trim(), limit: "6" });
        const response = await fetch(`/api/store/crm/customers?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as CustomerListResponse;
        if (!response.ok) throw new Error(errorMessage(payload, "Customer search failed."));
        setCustomers(payload.items ?? payload.customers ?? []);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Customer search failed.");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, query]);

  const ask = async () => {
    if (!query.trim() || asking) return;
    setAsking(true);
    setError(null);
    setAnswer(null);
    try {
      const response = await fetch("/api/store/crm/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const payload = (await response.json().catch(() => ({}))) as AskResponse;
      if (!response.ok) throw new Error(errorMessage(payload, "Yellow Jersey could not answer."));
      setAnswer(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Yellow Jersey could not answer.");
    } finally {
      setAsking(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-2xl bg-white px-3 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-300 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
      >
        <Search className="h-3.5 w-3.5" aria-hidden />
        Search or ask
        <span className="ml-1 hidden items-center gap-0.5 rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-500 sm:inline-flex">
          <Command className="h-2.5 w-2.5" aria-hidden />K
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/35 px-4 pt-[10vh] animate-in fade-in duration-200"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Search or ask Yellow Jersey"
            className="flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-md bg-white shadow-2xl animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out"
          >
            <div className="flex items-center gap-3 border-b border-gray-200 px-4">
              <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setAnswer(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void ask();
                }}
                placeholder="Search customers, or ask about revenue, workshop and CRM speed…"
                className="h-12 min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
              />
              {searching ? <span className="text-[11px] text-gray-400">Searching…</span> : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                aria-label="Close search"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {customers.length > 0 ? (
                <section>
                  <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">
                    Customers
                  </p>
                  <div className="space-y-1">
                    {customers.map((customer) => (
                      <Link
                        key={customer.id}
                        href={`/settings/store/crm/customers/${customer.id}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-500">
                          <User className="h-3.5 w-3.5" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-gray-900">
                            {customer.displayName}
                          </span>
                          <span className="block truncate text-xs text-gray-500">
                            {customer.primaryEmail || customer.primaryPhone || "No contact details"}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}

              {answer?.answer ? (
                <section className="mt-2 rounded-md bg-gray-50 p-4 ring-1 ring-inset ring-gray-200">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-gray-500 ring-1 ring-inset ring-gray-200">
                      <Bot className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm leading-relaxed text-gray-800">{answer.answer}</p>
                      {answer.grounding?.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {answer.grounding.map((source) => (
                            <Link
                              key={`${source.href}:${source.label}`}
                              href={source.href}
                              onClick={() => setOpen(false)}
                              className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-100"
                            >
                              {source.label}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>
              ) : null}

              {error ? (
                <div role="alert" className="mt-2 rounded-md bg-white p-3 text-sm text-gray-700 ring-1 ring-inset ring-gray-200">
                  {error}
                </div>
              ) : null}

              {query.trim() ? (
                <button
                  type="button"
                  disabled={asking}
                  onClick={() => void ask()}
                  className="mt-3 flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-50"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-500">
                    <Bot className="h-4 w-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-gray-900">
                      {asking ? "Checking live CRM records…" : `Ask Yellow Jersey “${query.trim()}”`}
                    </span>
                    <span className="block text-xs text-gray-500">Answers include links to the records used.</span>
                  </span>
                </button>
              ) : (
                <div className="px-3 py-10 text-center">
                  <p className="text-sm font-medium text-gray-900">Find anyone in a second</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Search by name, email, phone, bike or serial number.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
