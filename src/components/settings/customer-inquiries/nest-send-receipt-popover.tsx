"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { LightspeedLogo } from "@/components/genie/lightspeed-logo";
import { storeSettingsHeaderActionClass } from "@/components/settings/actions-page-header";
import { cn } from "@/lib/utils";

type WorkorderReceiptOption = {
  workorder_id: string;
  status_name: string;
  updated_at: string;
  note_preview: string;
  sale_id: string | null;
  can_send_receipt: boolean;
};

type ReceiptOptionsPayload = {
  workorders: WorkorderReceiptOption[];
  customer_name: string | null;
  error?: string;
};

const CLIENT_CACHE_TTL_MS = 60_000;
const clientCache = new Map<
  string,
  { expiresAt: number; payload: ReceiptOptionsPayload; inflight?: Promise<ReceiptOptionsPayload> }
>();

function cacheKey(chatId: string, customerId?: string | null): string {
  return `${chatId}:${customerId?.trim() || ""}`;
}

function buildReceiptOptionsUrl(
  chatId: string,
  customerId?: string | null,
  customerName?: string | null,
): string {
  const params = new URLSearchParams();
  if (chatId) params.set("chatId", chatId);
  if (customerId?.trim()) params.set("customerId", customerId.trim());
  if (customerName?.trim()) params.set("customerName", customerName.trim());
  return `/api/store/workorders/receipt-options?${params.toString()}`;
}

async function fetchReceiptOptions(
  chatId: string,
  customerId?: string | null,
  customerName?: string | null,
): Promise<ReceiptOptionsPayload> {
  const key = cacheKey(chatId, customerId);
  const cached = clientCache.get(key);
  if (cached && cached.expiresAt > Date.now() && !cached.inflight) {
    return cached.payload;
  }
  if (cached?.inflight) return cached.inflight;

  const inflight = (async () => {
    const res = await fetch(buildReceiptOptionsUrl(chatId, customerId, customerName), {
      cache: "no-store",
    });
    const data = (await res.json()) as {
      workorders?: WorkorderReceiptOption[];
      customer_name?: string;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || "Could not load workorders.");
    }
    const payload: ReceiptOptionsPayload = {
      workorders: data.workorders ?? [],
      customer_name: data.customer_name ?? null,
    };
    clientCache.set(key, {
      expiresAt: Date.now() + CLIENT_CACHE_TTL_MS,
      payload,
    });
    return payload;
  })().catch((error) => {
    clientCache.delete(key);
    throw error;
  });

  clientCache.set(key, {
    expiresAt: Date.now() + CLIENT_CACHE_TTL_MS,
    payload: cached?.payload ?? { workorders: [], customer_name: null },
    inflight,
  });

  return inflight;
}

function formatEdited(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "";
  const diffMs = Date.now() - parsed;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(
    new Date(parsed),
  );
}

function useAnchoredPanelStyle(
  open: boolean,
  anchorRef: React.RefObject<HTMLButtonElement | null>,
) {
  const [style, setStyle] = React.useState<React.CSSProperties>({});

  React.useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;

    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const width = 288;
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);

      setStyle({
        position: "fixed",
        left,
        bottom: window.innerHeight - rect.top + 8,
        width,
        zIndex: 70,
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef]);

  return style;
}

export function NestSendReceiptPopover({
  chatId,
  customerId,
  customerName: customerNameProp,
  onPrepared,
}: {
  chatId: string;
  customerId?: string | null;
  customerName?: string | null;
  onPrepared: (payload: {
    attachmentId: string;
    filename: string;
    draftMessage: string;
  }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [isPreparing, setIsPreparing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [customerName, setCustomerName] = React.useState<string | null>(
    customerNameProp ?? null,
  );
  const [workorders, setWorkorders] = React.useState<WorkorderReceiptOption[]>([]);
  const anchorRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const panelStyle = useAnchoredPanelStyle(open, anchorRef);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Prefetch as soon as the composer mounts so the popover is warm on click.
  React.useEffect(() => {
    let cancelled = false;
    void fetchReceiptOptions(chatId, customerId, customerNameProp)
      .then((payload) => {
        if (cancelled) return;
        setWorkorders(payload.workorders);
        setCustomerName(payload.customer_name ?? customerNameProp ?? null);
        setError(null);
      })
      .catch(() => {
        // Keep quiet until the user opens the popover.
      });
    return () => {
      cancelled = true;
    };
  }, [chatId, customerId, customerNameProp]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const key = cacheKey(chatId, customerId);
    const cached = clientCache.get(key);
    if (cached && cached.expiresAt > Date.now() && !cached.inflight) {
      setWorkorders(cached.payload.workorders);
      setCustomerName(cached.payload.customer_name ?? customerNameProp ?? null);
      setLoading(false);
      setError(null);
      return;
    }

    // Prefetch may already have filled the list — keep it visible while refreshing.
    setLoading((current) => current || workorders.length === 0);
    setError(null);
    void fetchReceiptOptions(chatId, customerId, customerNameProp)
      .then((payload) => {
        if (cancelled) return;
        setWorkorders(payload.workorders);
        setCustomerName(payload.customer_name ?? customerNameProp ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          if (workorders.length === 0) setWorkorders([]);
          setError(err instanceof Error ? err.message : "Could not load workorders.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only refetch when the popover opens / identity changes
  }, [open, chatId, customerId, customerNameProp]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function prepareReceipt(workorderId: string) {
    if (isPreparing) return;
    setIsPreparing(true);
    setOpen(false);
    setError(null);
    try {
      const res = await fetch("/api/store/workorders/prepare-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, workorderId }),
      });
      const data = (await res.json()) as {
        attachmentId?: string;
        filename?: string;
        draftMessage?: string;
        error?: string;
      };
      if (!res.ok || !data.attachmentId || !data.draftMessage) {
        throw new Error(data.error || "Could not prepare the receipt.");
      }
      onPrepared({
        attachmentId: data.attachmentId,
        filename: data.filename || `receipt-${workorderId}.pdf`,
        draftMessage: data.draftMessage,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare the receipt.");
      setOpen(true);
    } finally {
      setIsPreparing(false);
    }
  }

  const panel = (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={panelRef}
          style={panelStyle}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
          className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg"
        >
          <div className="border-b border-gray-100 px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <LightspeedLogo className="h-4 w-4 shrink-0 rounded-full object-cover" />
              <p className="text-xs font-medium text-gray-900">Send receipt</p>
            </div>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {customerName
                ? `Recent workorders for ${customerName}`
                : "Pick a workorder to attach the Lightspeed receipt."}
            </p>
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading workorders…
              </div>
            ) : workorders.length === 0 ? (
              <p className="px-3 py-4 text-xs text-gray-500">
                {error || "No recent workorders found for this customer."}
              </p>
            ) : (
              workorders.map((workorder) => (
                <button
                  key={workorder.workorder_id}
                  type="button"
                  disabled={!workorder.can_send_receipt || isPreparing}
                  onClick={() => void prepareReceipt(workorder.workorder_id)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors",
                    workorder.can_send_receipt
                      ? "hover:bg-gray-50"
                      : "cursor-not-allowed opacity-50",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-900">
                      #{workorder.workorder_id}
                    </span>
                    <span className="shrink-0 text-[10px] text-gray-400">
                      {formatEdited(workorder.updated_at)}
                    </span>
                  </span>
                  <span className="truncate text-[11px] text-gray-500">
                    {workorder.status_name}
                    {workorder.note_preview ? ` · ${workorder.note_preview}` : ""}
                  </span>
                  {!workorder.can_send_receipt ? (
                    <span className="text-[10px] text-gray-400">No linked sale receipt yet</span>
                  ) : (
                    <span className="text-[10px] text-gray-400">Tap to attach receipt PDF</span>
                  )}
                </button>
              ))
            )}
          </div>

          {error && workorders.length > 0 ? (
            <p className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-600">{error}</p>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        disabled={isPreparing}
        onClick={() => {
          if (isPreparing) return;
          setOpen((value) => !value);
        }}
        className={cn(
          storeSettingsHeaderActionClass(),
          "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 text-xs",
          isPreparing && "cursor-wait opacity-80",
        )}
        aria-expanded={open}
        aria-busy={isPreparing}
      >
        {isPreparing ? (
          <Loader2 className="size-[14px] animate-spin" />
        ) : (
          <LightspeedLogo className="size-[14px] shrink-0 rounded-full object-cover" />
        )}
        Send receipt
      </button>

      {mounted ? createPortal(panel, document.body) : null}
    </>
  );
}
