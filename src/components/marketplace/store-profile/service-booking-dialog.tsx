"use client";

import * as React from "react";
import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useNestStorefrontChat } from "@/components/providers/nest-storefront-chat-provider";
import { cn } from "@/lib/utils";
import {
  getMonthGridDays,
  shiftMonth,
  toDateKey,
} from "@/lib/rentals/availability";
import type { StoreService } from "@/lib/types/store";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CAPACITY = 10;
const BOOKING_TZ = "Australia/Melbourne";

/** Force solid white over Input's bg-transparent / dark:bg-input/30. */
const bookingFieldClassName = cn(
  "h-12 !bg-white text-base shadow-none dark:!bg-white",
  "[&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_#fff]",
  "[&:-webkit-autofill]:[-webkit-text-fill-color:theme(colors.gray.900)]",
);

const STEPS = ["date", "name", "phone", "bike", "notes"] as const;
type BookingStep = (typeof STEPS)[number];

function stepTitle(step: BookingStep, serviceName?: string | null): string {
  switch (step) {
    case "date":
      return serviceName ? `Book ${serviceName}` : "Pick a day";
    case "name":
      return "Your name";
    case "phone":
      return "Your mobile";
    case "bike":
      return "Your bike";
    case "notes":
      return "Anything else?";
  }
}

function stepDescription(step: BookingStep): string {
  switch (step) {
    case "date":
      return "Choose a weekday for when the service should be finished. You can drop the bike off before then. Weekends are unavailable.";
    case "name":
      return "Who is the booking under?";
    case "phone":
      return "We'll text you a confirmation.";
    case "bike":
      return "Which bike are you bringing in?";
    case "notes":
      return "Add any details for the workshop (optional).";
  }
}

function melbourneTodayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Weekend days are closed for service completion bookings. */
function isWeekendDateKey(dateKey: string): boolean {
  const day = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

type AvailabilityPayload = {
  connected?: boolean;
  capacity?: number;
  counts?: Record<string, number>;
  fullDates?: string[];
  error?: string;
  warning?: string;
};

type BookingPayload = {
  ok?: boolean;
  workorder_id?: number;
  drop_off_date?: string;
  nest_sent?: boolean;
  error?: string;
  code?: string;
};

export interface ServiceBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  storeName: string;
  service?: StoreService | null;
  accent?: string;
  accentText?: string;
}

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);
  return isMobile;
}

/**
 * Keeps a bottom-anchored sheet inside the visible area when the mobile
 * keyboard opens. Without this the sheet stays pinned to the layout-viewport
 * bottom (behind the keyboard) and the browser scrolls its top off-screen.
 */
function useKeyboardViewport(active: boolean) {
  const [state, setState] = React.useState<{ inset: number; maxHeight: number | null }>({
    inset: 0,
    maxHeight: null,
  });

  React.useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setState({ inset, maxHeight: vv.height });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);

  return state;
}

function formatSelectedDay(dateKey: string): string {
  return format(new Date(`${dateKey}T12:00:00`), "EEEE d MMMM yyyy");
}

function ServiceBookingForm({
  storeId,
  storeName,
  service,
  accent = "#ffde59",
  accentText = "#0a0a0a",
  onClose,
  compact = false,
  onStepChange,
  onBookedChange,
}: {
  storeId: string;
  storeName: string;
  service?: StoreService | null;
  accent?: string;
  accentText?: string;
  onClose: () => void;
  compact?: boolean;
  onStepChange?: (step: BookingStep) => void;
  onBookedChange?: (booked: boolean) => void;
}) {
  const [step, setStep] = React.useState<BookingStep>("date");
  const [visibleMonth, setVisibleMonth] = React.useState(() => new Date());
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [connected, setConnected] = React.useState(true);
  const [loadingAvailability, setLoadingAvailability] = React.useState(true);
  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [bike, setBike] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<{
    date: string;
    nestSent: boolean;
  } | null>(null);

  const gridDays = React.useMemo(() => getMonthGridDays(visibleMonth), [visibleMonth]);
  const capacity = CAPACITY;

  const goToStep = React.useCallback(
    (next: BookingStep) => {
      setStep(next);
      onStepChange?.(next);
    },
    [onStepChange],
  );

  const loadAvailability = React.useCallback(async () => {
    setLoadingAvailability(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/marketplace/store/${storeId}/service-bookings/availability`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as AvailabilityPayload;
      if (!res.ok) {
        setError(data.error || "Could not load available days");
        setConnected(false);
        setCounts({});
        return;
      }
      setConnected(data.connected !== false);
      setCounts(data.counts ?? {});
      if (data.connected === false) {
        setError(
          data.warning ||
            "Online booking is not available for this store right now.",
        );
      } else if (data.warning) {
        setError(null);
      }
    } catch {
      setError("Could not load available days");
      setConnected(false);
    } finally {
      setLoadingAvailability(false);
    }
  }, [storeId]);

  React.useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  const selectedCount = selectedDate ? counts[selectedDate] ?? 0 : 0;
  const selectedFull = selectedDate ? selectedCount >= capacity : false;
  const selectedWeekend = selectedDate ? isWeekendDateKey(selectedDate) : false;

  const stepIndex = STEPS.indexOf(step);
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === STEPS.length - 1;

  const stepValid = ((): boolean => {
    switch (step) {
      case "date":
        return (
          connected &&
          !!selectedDate &&
          !selectedFull &&
          !selectedWeekend &&
          !loadingAvailability
        );
      case "name":
        return customerName.trim().length > 0;
      case "phone":
        return customerPhone.trim().length >= 8;
      case "bike":
        return bike.trim().length > 0;
      case "notes":
        return true;
    }
  })();

  const canSubmit =
    connected &&
    !!selectedDate &&
    !selectedFull &&
    !selectedWeekend &&
    customerName.trim().length > 0 &&
    customerPhone.trim().length >= 8 &&
    bike.trim().length > 0 &&
    !submitting;

  const handleSelectDate = (dateKey: string) => {
    const count = counts[dateKey] ?? 0;
    if (count >= capacity) return;
    setSelectedDate(dateKey);
    setError(null);
  };

  const handleNext = () => {
    if (!stepValid) return;
    setError(null);
    if (isLastStep) {
      void handleSubmit();
      return;
    }
    goToStep(STEPS[stepIndex + 1]);
  };

  const handleBack = () => {
    setError(null);
    if (isFirstStep) {
      onClose();
      return;
    }
    goToStep(STEPS[stepIndex - 1]);
  };

  const handleSubmit = async () => {
    if (!selectedDate || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketplace/store/${storeId}/service-bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          bike: bike.trim(),
          notes: notes.trim(),
          drop_off_date: selectedDate,
          service_name: service?.name ?? null,
          service_id: service?.id ?? null,
        }),
      });
      const data = (await res.json()) as BookingPayload;
      if (!res.ok || !data.ok) {
        if (data.code === "day_full") {
          await loadAvailability();
          goToStep("date");
        }
        setError(data.error || "Could not complete the booking");
        return;
      }
      setSuccess({
        date: data.drop_off_date || selectedDate,
        nestSent: data.nest_sent !== false,
      });
      onBookedChange?.(true);
    } catch {
      setError("Could not complete the booking");
    } finally {
      setSubmitting(false);
    }
  };

  const primaryEnabled = isLastStep ? canSubmit : stepValid;
  const footer = success ? (
    <Button type="button" className="w-full" onClick={onClose}>
      Done
    </Button>
  ) : (
    <>
      <Button type="button" variant="outline" className="flex-1" onClick={handleBack}>
        {isFirstStep ? "Cancel" : "Back"}
      </Button>
      <Button
        type="button"
        className="flex-1"
        disabled={!primaryEnabled}
        onClick={handleNext}
        style={
          primaryEnabled
            ? { backgroundColor: accent, color: accentText }
            : undefined
        }
      >
        {isLastStep ? (
          submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Book"
        ) : (
          "Continue"
        )}
      </Button>
    </>
  );

  const calendar = (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setVisibleMonth((month) => shiftMonth(month, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="text-sm font-medium text-gray-900">
          {format(visibleMonth, "MMMM yyyy")}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setVisibleMonth((month) => shiftMonth(month, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {loadingAvailability ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="text-center text-[11px] font-medium text-gray-400 py-1"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {gridDays.map((day, index) => {
              if (!day) {
                return <div key={`empty-${index}`} className="aspect-square" />;
              }
              const dateKey = toDateKey(day);
              const past = dateKey < melbourneTodayKey();
              const weekend = isWeekendDateKey(dateKey);
              const count = counts[dateKey] ?? 0;
              const full = count >= capacity;
              const unavailable = past || weekend || full || !connected;
              const selected = selectedDate === dateKey;
              const remaining = Math.max(0, capacity - count);

              return (
                <button
                  key={dateKey}
                  type="button"
                  disabled={unavailable}
                  onClick={() => handleSelectDate(dateKey)}
                  className={cn(
                    "relative aspect-square rounded-md text-sm font-medium transition-colors",
                    unavailable && "text-gray-300 cursor-not-allowed",
                    !unavailable && !selected && "text-gray-800 hover:bg-gray-100 cursor-pointer",
                    selected && "text-white",
                  )}
                  style={
                    selected
                      ? { backgroundColor: accent, color: accentText }
                      : undefined
                  }
                  aria-label={`${format(day, "d MMMM yyyy")}${
                    weekend
                      ? ", closed weekends"
                      : full
                        ? ", fully booked"
                        : past
                          ? ", past"
                          : `, ${remaining} spots left`
                  }`}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  const onEnterAdvance = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleNext();
    }
  };

  const dateStep = (
    <div className="space-y-3">
      {calendar}
      <p className="text-center text-sm text-gray-600 min-h-5">
        {selectedDate ? (
          <>
            Completion day:{" "}
            <span className="font-medium text-gray-900">{formatSelectedDay(selectedDate)}</span>
          </>
        ) : (
          <span className="text-gray-400">Tap a day to continue</span>
        )}
      </p>
    </div>
  );

  const stepContent = ((): React.ReactNode => {
    switch (step) {
      case "date":
        return dateStep;
      case "name":
        return (
          <Input
            id="service-booking-name"
            autoFocus
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            onKeyDown={onEnterAdvance}
            placeholder="Full name"
            autoComplete="name"
            className={bookingFieldClassName}
          />
        );
      case "phone":
        return (
          <Input
            id="service-booking-phone"
            autoFocus
            type="tel"
            inputMode="tel"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            onKeyDown={onEnterAdvance}
            placeholder="0412 345 678"
            autoComplete="tel"
            className={bookingFieldClassName}
          />
        );
      case "bike":
        return (
          <Input
            id="service-booking-bike"
            autoFocus
            value={bike}
            onChange={(e) => setBike(e.target.value)}
            onKeyDown={onEnterAdvance}
            placeholder="e.g. Trek Marlin 6"
            autoComplete="off"
            className={bookingFieldClassName}
          />
        );
      case "notes":
        return (
          <Textarea
            id="service-booking-notes"
            autoFocus
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything we should know? (optional)"
            rows={4}
            className={cn(bookingFieldClassName, "resize-none")}
          />
        );
    }
  })();

  const successView = success ? (
    <div className="rounded-md bg-white border border-gray-200 p-5 text-center space-y-3">
      <div
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-md"
        style={{ backgroundColor: accent, color: accentText }}
      >
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-gray-900">You&apos;re booked in</h3>
        <p className="text-sm text-gray-600 leading-relaxed">
          Your service is due on{" "}
          <span className="font-medium text-gray-900">{formatSelectedDay(success.date)}</span>.
          You can drop the bike off on or before that day.
        </p>
      </div>
      {success.nestSent ? (
        <p className="text-xs text-gray-500">
          We&apos;ve sent you a Nest text with the booking details.
        </p>
      ) : (
        <p className="text-xs text-gray-500">
          Your booking is confirmed. If you don&apos;t get a Nest text shortly, the shop still has you on the sheet.
        </p>
      )}
    </div>
  ) : null;

  const scrollBody = (
    <div className="space-y-4">
      {success ? (
        successView
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.22, ease: [0.04, 0.62, 0.23, 0.98] }}
          >
            {stepContent}
          </motion.div>
        </AnimatePresence>
      )}

      {error && (
        <div className="rounded-md bg-white border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        compact ? "" : "max-h-[min(36rem,70vh)]",
      )}
    >
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain",
          compact ? "px-5 pt-4 pb-5" : "",
        )}
      >
        {scrollBody}
      </div>
      <div
        className={cn(
          "shrink-0 flex gap-2 border-t border-border bg-white",
          compact
            ? "px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
            : "pt-4",
        )}
      >
        {footer}
      </div>
    </div>
  );
}

export function ServiceBookingDialog({
  open,
  onOpenChange,
  storeId,
  storeName,
  service = null,
  accent = "#ffde59",
  accentText = "#0a0a0a",
}: ServiceBookingDialogProps) {
  const isMobile = useIsMobile();
  const keyboard = useKeyboardViewport(isMobile && open);
  const { setBubbleHidden } = useNestStorefrontChat();
  const [step, setStep] = React.useState<BookingStep>("date");
  const [booked, setBooked] = React.useState(false);

  // Hide the floating chat bubble while the booking sheet/dialog is open.
  React.useEffect(() => {
    setBubbleHidden(open);
    return () => setBubbleHidden(false);
  }, [open, setBubbleHidden]);

  const title = booked ? "Booking confirmed" : stepTitle(step, service?.name);
  const description = booked ? "" : stepDescription(step);
  const stepNumber = STEPS.indexOf(step) + 1;

  const form = (
    <ServiceBookingForm
      key={`${open}-${service?.id ?? "general"}`}
      storeId={storeId}
      storeName={storeName}
      service={service}
      accent={accent}
      accentText={accentText}
      onClose={() => onOpenChange(false)}
      compact={isMobile}
      onStepChange={setStep}
      onBookedChange={setBooked}
    />
  );

  React.useEffect(() => {
    if (!open) {
      setStep("date");
      setBooked(false);
    }
  }, [open]);

  const progress = !booked ? (
    <div className="mt-2 flex items-center gap-1.5" aria-hidden>
      {STEPS.map((s, i) => (
        <span
          key={s}
          className={cn(
            "h-1 flex-1 rounded-full transition-colors",
            i < stepNumber ? "bg-gray-900" : "bg-gray-200",
          )}
        />
      ))}
    </div>
  ) : null;

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="flex h-[85svh] max-h-[85svh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0"
          style={
            keyboard.maxHeight
              ? {
                  bottom: keyboard.inset ? `${keyboard.inset}px` : undefined,
                  maxHeight: `${keyboard.maxHeight}px`,
                }
              : undefined
          }
        >
          <div className="shrink-0 pt-2.5 pb-1 flex justify-center">
            <span className="h-1 w-9 rounded-full bg-gray-300" aria-hidden />
          </div>
          <SheetHeader className="shrink-0 px-5 pb-3 pt-1 border-b border-border text-left">
            <SheetTitle>{title}</SheetTitle>
            {description ? (
              <SheetDescription>{description}</SheetDescription>
            ) : (
              <SheetDescription className="sr-only">{title}</SheetDescription>
            )}
            {progress}
          </SheetHeader>
          {form}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="animate-in fade-in duration-200"
        className="flex max-h-[min(44rem,92vh)] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out"
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
          {progress}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden px-6 py-4">{form}</div>
      </DialogContent>
    </Dialog>
  );
}
