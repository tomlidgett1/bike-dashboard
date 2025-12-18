"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SettingsBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  showSave?: boolean;
  onSave?: () => void;
  saving?: boolean;
  className?: string;
}

export function SettingsBottomSheet({
  isOpen,
  onClose,
  title,
  children,
  showSave = true,
  onSave,
  saving = false,
  className,
}: SettingsBottomSheetProps) {
  // Prevent body scroll when sheet is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-[100]"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            className={cn(
              "fixed bottom-0 left-0 right-0 bg-white z-[101] rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col",
              className
            )}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="p-2 -mr-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {children}
            </div>

            {/* Footer with Save button */}
            {showSave && onSave && (
              <div className="flex-shrink-0 p-4 border-t border-gray-100 pb-[calc(16px+env(safe-area-inset-bottom))]">
                <Button
                  onClick={onSave}
                  disabled={saving}
                  className="w-full h-12 rounded-md bg-gray-900 hover:bg-gray-800 text-white font-medium"
                >
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            )}

            {/* Safe area only if no save button */}
            {!showSave && (
              <div className="pb-[env(safe-area-inset-bottom)]" />
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}





