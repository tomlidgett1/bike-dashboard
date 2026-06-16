"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, FileText, Loader2, X } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 2 * 60 * 1000; // monitor the inbox every 2 minutes

interface SupplierInvoiceSummary {
  id: string;
  source: "gmail" | "upload";
  attachment_filename: string | null;
  email_subject: string | null;
  email_from: string | null;
  email_date: string | null;
  status: string;
  lightspeed_order_id: string | null;
  lightspeed_order_url: string | null;
}

interface InvoiceFeed {
  gmail_connected: boolean;
  pending: SupplierInvoiceSummary[];
  processing: SupplierInvoiceSummary[];
  recent: SupplierInvoiceSummary[];
}

function senderLabel(invoice: SupplierInvoiceSummary): string {
  if (invoice.source === "upload") return invoice.attachment_filename ?? "Uploaded PDF";
  const from = invoice.email_from?.replace(/<[^>]*>/g, "").replace(/"/g, "").trim();
  return from || invoice.attachment_filename || "Supplier";
}

export function buildInvoicePrompt(invoice: SupplierInvoiceSummary): string {
  const context = invoice.source === "upload"
    ? `uploaded PDF "${invoice.attachment_filename ?? "invoice.pdf"}"`
    : `email from ${senderLabel(invoice)}${invoice.email_subject ? ` with subject "${invoice.email_subject}"` : ""}`;
  return `Process the supplier invoice from the ${context} (invoice id: ${invoice.id}) — extract all the details and create a Lightspeed purchase order from it.`;
}

/**
 * Homepage pill that monitors the connected Gmail inbox for new supplier PDF
 * invoices (refreshes every 2 minutes). Clicking an invoice asks the Genie to
 * extract it and stage a Lightspeed purchase order.
 */
export function SupplierInvoicePill({
  onProcess,
  className,
}: {
  /** Sends a prompt to the Genie chat. */
  onProcess: (prompt: string) => void;
  className?: string;
}) {
  const [feed, setFeed] = React.useState<InvoiceFeed | null>(null);
  const [open, setOpen] = React.useState(false);
  const [dismissing, setDismissing] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const refresh = React.useCallback(async (scan: boolean) => {
    try {
      const response = await fetch(`/api/store/supplier-invoices${scan ? "?scan=1" : ""}`);
      if (!response.ok) return;
      const data = (await response.json()) as InvoiceFeed;
      if (data && Array.isArray(data.pending)) setFeed(data);
    } catch {
      // Pill is best-effort; the Genie can always rescan on demand.
    }
  }, []);

  React.useEffect(() => {
    void refresh(true);
    const timer = setInterval(() => void refresh(true), POLL_INTERVAL_MS);
    const onUploaded = () => void refresh(false);
    window.addEventListener("supplier-invoice-uploaded", onUploaded);
    return () => {
      clearInterval(timer);
      window.removeEventListener("supplier-invoice-uploaded", onUploaded);
    };
  }, [refresh]);

  React.useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const dismiss = React.useCallback(async (invoiceId: string) => {
    setDismissing(invoiceId);
    try {
      await fetch("/api/store/supplier-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", invoice_id: invoiceId }),
      });
      setFeed((current) => current
        ? { ...current, pending: current.pending.filter((row) => row.id !== invoiceId) }
        : current);
    } finally {
      setDismissing(null);
    }
  }, []);

  const pending = feed?.pending ?? [];

  if (!feed || pending.length === 0) return null;

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 shadow-sm transition-colors hover:border-amber-400 hover:bg-amber-100"
        title="Supplier invoices detected in your inbox — click to create purchase orders"
      >
        <FileText className="h-3.5 w-3.5" />
        {pending.length} supplier invoice{pending.length === 1 ? "" : "s"}
        <ChevronDown className={cn("h-3 w-3 opacity-70 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && pending.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 top-full z-30 mt-1.5 w-80 overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-[0_10px_30px_-12px_rgba(15,23,42,0.18)]"
          >
            <p className="border-b border-gray-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Invoices found in your inbox
            </p>
            <ul className="max-h-64 overflow-y-auto p-1">
              {pending.map((invoice) => (
                <li key={invoice.id} className="group flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-gray-50">
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{senderLabel(invoice)}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {invoice.email_subject ?? invoice.attachment_filename ?? "PDF invoice"}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onProcess(buildInvoicePrompt(invoice));
                      }}
                      className="mt-1 inline-flex items-center rounded-md bg-gray-900 px-2 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-gray-800"
                    >
                      Create purchase order
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void dismiss(invoice.id)}
                    disabled={dismissing === invoice.id}
                    className="rounded-md p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    aria-label="Dismiss invoice"
                  >
                    {dismissing === invoice.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
