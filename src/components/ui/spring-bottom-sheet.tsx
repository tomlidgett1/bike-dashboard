"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

// Native-feeling sheet: pure CSS transform transitions on the compositor,
// using the iOS sheet curve. No JS-driven animation frames.
const OPEN_MS = 480;
const CLOSE_MS = 320;
const IOS_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const DRAG_DISMISS_PX = 90;
const DRAG_DISMISS_VELOCITY = 0.6; // px per ms

interface SpringBottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  showDragHandle?: boolean;
  "aria-label"?: string;
}

export function SpringBottomSheet({
  open,
  onClose,
  children,
  className,
  showDragHandle = true,
  "aria-label": ariaLabel = "Bottom sheet",
}: SpringBottomSheetProps) {
  const [mounted, setMounted] = React.useState(false);
  // present: sheet is in the DOM; shown: sheet is at its resting position
  const [present, setPresent] = React.useState(false);
  const [shown, setShown] = React.useState(false);
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = React.useRef<{
    startY: number;
    lastY: number;
    lastT: number;
    velocity: number;
    dragging: boolean;
  } | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (open) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setPresent(true);
      // Two frames so the browser commits the off-screen position first,
      // then transitions to the resting position.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setShown(false);
    closeTimerRef.current = setTimeout(() => setPresent(false), CLOSE_MS);
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const handlePointerDown = (event: React.PointerEvent) => {
    if (!showDragHandle) return;
    dragRef.current = {
      startY: event.clientY,
      lastY: event.clientY,
      lastT: event.timeStamp,
      velocity: 0,
      dragging: true,
    };
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    const sheet = sheetRef.current;
    if (sheet) sheet.style.transition = "none";
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag?.dragging) return;
    const dy = Math.max(0, event.clientY - drag.startY);
    const dt = Math.max(1, event.timeStamp - drag.lastT);
    drag.velocity = (event.clientY - drag.lastY) / dt;
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
    const sheet = sheetRef.current;
    if (sheet) sheet.style.transform = `translateY(${dy}px)`;
  };

  const handlePointerEnd = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag?.dragging) return;
    dragRef.current = null;
    const dy = Math.max(0, event.clientY - drag.startY);
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.style.transition = "";
    sheet.style.transform = "";
    if (dy > DRAG_DISMISS_PX || drag.velocity > DRAG_DISMISS_VELOCITY) {
      onClose();
    }
  };

  if (!mounted || !present) return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close sheet"
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[3px]"
        style={{
          opacity: shown ? 1 : 0,
          transition: `opacity ${shown ? 280 : CLOSE_MS}ms ease`,
        }}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden",
          "rounded-t-3xl border border-white/70 bg-white/90 shadow-[0_-16px_56px_rgba(15,23,42,0.16),0_-4px_16px_rgba(15,23,42,0.06)] backdrop-blur-2xl",
          className,
        )}
        style={{
          transform: shown ? "translateY(0)" : "translateY(100%)",
          transition: `transform ${shown ? OPEN_MS : CLOSE_MS}ms ${IOS_EASE}`,
          willChange: "transform",
        }}
      >
        {showDragHandle ? (
          <div
            className="flex shrink-0 cursor-grab justify-center pt-3 pb-2 active:cursor-grabbing"
            style={{ touchAction: "none" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            <div className="h-1 w-9 rounded-full bg-gray-300/80" />
          </div>
        ) : null}
        {children}
      </div>
    </>,
    document.body,
  );
}
