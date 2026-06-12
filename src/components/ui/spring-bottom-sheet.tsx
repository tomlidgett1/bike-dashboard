"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

// Critically damped — snappy deceleration without y overshoot (no gap at screen bottom).
const SHEET_OPEN_SPRING = {
  type: "spring" as const,
  stiffness: 420,
  damping: 44,
  mass: 0.85,
};

const SHEET_CLOSE_SPRING = {
  type: "spring" as const,
  stiffness: 520,
  damping: 48,
  mass: 0.9,
};

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
  const reduceMotion = useReducedMotion();

  React.useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!mounted) return null;

  const sheetVariants = reduceMotion
    ? {
        hidden: { y: "100%", opacity: 0 },
        visible: { y: 0, opacity: 1, transition: { duration: 0.2 } },
        exit: { y: "100%", opacity: 0, transition: { duration: 0.16 } },
      }
    : {
        hidden: { y: "100%", opacity: 0.96 },
        visible: { y: 0, opacity: 1, transition: SHEET_OPEN_SPRING },
        exit: { y: "100%", opacity: 0, transition: SHEET_CLOSE_SPRING },
      };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close sheet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[3px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            variants={sheetVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden",
              "rounded-t-3xl border border-white/70 bg-white/90 shadow-[0_-16px_56px_rgba(15,23,42,0.16),0_-4px_16px_rgba(15,23,42,0.06)] backdrop-blur-2xl",
              className,
            )}
            style={{ willChange: "transform, opacity" }}
          >
            {showDragHandle ? (
              <div className="flex shrink-0 justify-center pt-3 pb-1">
                <div className="h-1 w-9 rounded-full bg-gray-300/80" />
              </div>
            ) : null}
            {children}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
