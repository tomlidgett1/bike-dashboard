"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Link2, FileText, X, Upload, ChevronRight } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

// ============================================================
// Mobile Upload Method Dialog
// Native bottom sheet design optimised for mobile
// ============================================================

interface MobileUploadMethodDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectQuick: () => void;
  onSelectFacebook: () => void;
  onSelectBulk: () => void;
  onSelectComprehensive: () => void;
}

export function MobileUploadMethodDialog({
  isOpen,
  onClose,
  onSelectQuick,
  onSelectFacebook,
  onSelectBulk,
  onSelectComprehensive,
}: MobileUploadMethodDialogProps) {
  // Prevent body scroll when sheet is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
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
            className="fixed inset-0 bg-black/40 z-[100]"
            onClick={onClose}
          />
          
          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ 
              type: "spring",
              damping: 30,
              stiffness: 400,
            }}
            className="fixed bottom-0 left-0 right-0 z-[101] bg-white rounded-t-2xl max-h-[85vh] overflow-hidden"
          >
            {/* Handle Bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            
            {/* Header */}
            <div className="px-5 pb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                List Your Item
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Choose how you'd like to create your listing
              </p>
            </div>
            
            {/* Options */}
            <div className="px-4 pb-8 space-y-2">
              {/* Recommended: Smart Upload */}
              <motion.button
                onClick={() => {
                  onClose();
                  onSelectQuick();
                }}
                whileTap={{ scale: 0.98 }}
                className="w-full"
              >
                <div className="bg-white border-2 border-gray-900 rounded-xl p-4">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-gray-900 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="h-6 w-6 text-[#FFC72C]" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <h3 className="text-base font-semibold text-gray-900">
                        Smart Upload
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        AI fills in details from your photos
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  </div>
                </div>
              </motion.button>

              {/* Facebook Import */}
              <motion.button
                onClick={() => {
                  onClose();
                  onSelectFacebook();
                }}
                whileTap={{ scale: 0.98 }}
                className="w-full"
              >
                <div className="bg-white border border-gray-200 rounded-xl p-4 active:bg-gray-50">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Image src="/facebook.png" alt="Facebook" width={24} height={24} />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <h3 className="text-base font-semibold text-gray-900">
                        Import from Facebook
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Paste a Marketplace link
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  </div>
                </div>
              </motion.button>

              {/* Divider with "More options" */}
              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium">More options</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* Secondary Options Row */}
              <div className="grid grid-cols-2 gap-2">
                {/* Bulk Upload */}
                <motion.button
                  onClick={() => {
                    onClose();
                    onSelectBulk();
                  }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full"
                >
                  <div className="bg-gray-50 rounded-xl p-4 h-full active:bg-gray-100">
                    <div className="flex flex-col items-center text-center gap-2">
                      <div className="h-10 w-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                        <Upload className="h-5 w-5 text-gray-600" />
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-900">
                          Bulk Upload
                        </h3>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Multiple items
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.button>

                {/* Manual Entry */}
                <motion.button
                  onClick={() => {
                    onClose();
                    onSelectComprehensive();
                  }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full"
                >
                  <div className="bg-gray-50 rounded-xl p-4 h-full active:bg-gray-100">
                    <div className="flex flex-col items-center text-center gap-2">
                      <div className="h-10 w-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-gray-600" />
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-900">
                          Manual Entry
                        </h3>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Full control
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.button>
              </div>
            </div>
            
            {/* Safe area padding for iOS */}
            <div className="h-safe-area-inset-bottom" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

