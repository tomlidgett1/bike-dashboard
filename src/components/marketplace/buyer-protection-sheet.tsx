"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import {
  X,
  Lock,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  ArrowRight,
} from "@/components/layout/app-sidebar/dashboard-icons";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getMobileSheetHeight,
  useMobileSheetViewport,
} from "@/hooks/use-mobile-sheet-viewport";
import { cn } from "@/lib/utils";

const COVERED_ITEMS = [
  "Item not received",
  "Not as described in the listing",
  "Damaged in transit",
  "Wrong item delivered",
];

const STEPS = [
  "Complete your purchase with Buy Now on Yellow Jersey",
  "Your payment is held securely in escrow",
  "The seller ships your item and you inspect it on arrival",
  "Funds are released to the seller once you confirm receipt",
];

const PANEL_CLOSE_MS = 320;
const SHEET_HEIGHT = "min(88vh, 640px)";
const MOBILE_SHEET_HEIGHT_RATIO = 0.88;

interface BuyerProtectionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 640px)").matches
      : false,
  );

  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

const FEATURES = [
  {
    icon: Lock,
    title: "Secure escrow payments",
    description:
      "Your money is held safely until you confirm the bike arrived as described.",
  },
  {
    icon: ShieldCheck,
    title: "Money-back guarantee",
    description: "Refunded if your order never arrives or isn't as described.",
  },
  {
    icon: Sparkles,
    title: "Included free",
    description:
      "Added automatically to every Yellow Jersey order at no extra cost.",
  },
];

function BuyerProtectionContent({
  onClose,
  variant,
}: {
  onClose: () => void;
  variant: "sheet" | "dialog";
}) {
  return (
    <>
      {/* Premium hero */}
      <div className="relative shrink-0 overflow-hidden border-b border-gray-100 bg-gray-50 px-6 pb-6 text-gray-900">
        {/* Brand glow accent */}
        <div
          className="pointer-events-none absolute -right-14 -top-20 h-52 w-52 rounded-full bg-[#ffde59]/30 blur-3xl"
          aria-hidden
        />

        {variant === "sheet" && (
          <div className="relative flex justify-center pb-2 pt-3" aria-hidden>
            <div className="h-1 w-10 rounded-full bg-gray-300" />
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm ring-1 ring-gray-200 transition-colors hover:text-gray-700"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className={cn("relative", variant === "dialog" ? "pt-7" : "pt-2")}>
          <Image
            src="/yjsmall.png"
            alt="Yellow Jersey"
            width={56}
            height={56}
            className="h-12 w-12 rounded-2xl object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.12)]"
          />

          <h2 className="mt-4 text-xl font-semibold tracking-tight text-gray-900">
            Buyer Protection
          </h2>
          <p className="mt-1.5 max-w-[36ch] text-sm leading-relaxed text-gray-500">
            Shop with confidence — peace of mind most marketplaces simply
            don&apos;t offer.
          </p>

          <div className="mt-4 flex items-center gap-1.5">
            <Lock className="h-3 w-3 text-gray-400" />
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
              Payments secured by
            </span>
            <Image
              src="/stripe.svg"
              alt="Stripe"
              width={34}
              height={14}
              className="opacity-60"
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 [scrollbar-width:thin]">
        {/* Premium feature highlights */}
        <div className="space-y-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
                <Icon className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0 pt-0.5">
                <p className="text-sm font-medium text-gray-900">{title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-gray-500">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="my-5 h-px bg-gray-100" />

        {/* How it works */}
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          How it works
        </p>
        <ol className="mt-3 space-y-3">
          {STEPS.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-[11px] font-semibold text-white">
                {index + 1}
              </span>
              <span className="pt-0.5 text-[13px] leading-relaxed text-gray-700">
                {step}
              </span>
            </li>
          ))}
        </ol>

        <div className="my-5 h-px bg-gray-100" />

        {/* What's covered */}
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          What&apos;s covered
        </p>
        <ul className="mt-3 space-y-2.5">
          {COVERED_ITEMS.map((item) => (
            <li
              key={item}
              className="flex items-center gap-2.5 text-[13px] text-gray-700"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-gray-900" />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        {/* Off-platform note */}
        <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-[13px] leading-relaxed text-gray-500">
            <span className="font-medium text-gray-900">
              Only on Yellow Jersey.
            </span>{" "}
            Protection applies when you pay through our secure checkout. Paying a
            seller directly — or buying the same listing on Gumtree, Facebook
            Marketplace, or elsewhere — isn&apos;t covered.
          </p>
        </div>

        <Link
          href="/marketplace/help/article/understanding-buyer-protection"
          onClick={onClose}
          className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-gray-900 underline-offset-2 hover:underline"
        >
          Learn more about Buyer Protection
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Footer */}
      <div
        className={cn(
          "shrink-0 border-t border-gray-100 bg-white px-6 py-4",
          variant === "sheet" && "pb-[calc(16px+env(safe-area-inset-bottom))]",
        )}
      >
        <button
          type="button"
          onClick={onClose}
          className="h-12 w-full rounded-xl bg-gray-900 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
        >
          Got it
        </button>
      </div>
    </>
  );
}

export function BuyerProtectionSheet({ open, onOpenChange }: BuyerProtectionSheetProps) {
  const isDesktop = useIsDesktop();
  const [mounted, setMounted] = React.useState(false);
  const [shouldRender, setShouldRender] = React.useState(open);
  const [isLeaving, setIsLeaving] = React.useState(false);

  const handleClose = () => onOpenChange(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (open) {
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
  }, [open, shouldRender]);

  React.useEffect(() => {
    if (!shouldRender || isDesktop) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [shouldRender, isDesktop]);

  const { metrics: mobileViewport } = useMobileSheetViewport(shouldRender && !isDesktop);

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="animate-in fade-in duration-200"
          className={cn(
            "flex max-h-[min(88vh,640px)] max-w-md flex-col gap-0 overflow-hidden rounded-[28px] border border-gray-200/70 bg-white p-0 shadow-2xl",
            "animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out",
          )}
        >
          <DialogTitle className="sr-only">Yellow Jersey Buyer Protection</DialogTitle>
          <BuyerProtectionContent onClose={handleClose} variant="dialog" />
        </DialogContent>
      </Dialog>
    );
  }

  if (!mounted || !shouldRender) return null;

  const panelState = isLeaving ? "closed" : "open";
  const mobileSheetHeight = getMobileSheetHeight(mobileViewport, MOBILE_SHEET_HEIGHT_RATIO);

  return createPortal(
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
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        data-state={panelState}
        role="dialog"
        aria-modal="true"
        aria-label="Buyer Protection"
        className="store-message-sheet flex w-full flex-col overflow-hidden rounded-t-[28px] border border-gray-200/80 bg-white shadow-2xl"
        style={{
          height: mobileSheetHeight ?? SHEET_HEIGHT,
          maxHeight: mobileViewport.height > 0 ? mobileViewport.height : SHEET_HEIGHT,
        }}
      >
        <BuyerProtectionContent onClose={handleClose} variant="sheet" />
      </div>
    </div>,
    document.body,
  );
}
