"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Link2, FileText, X, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ============================================================
// Mobile Upload Method Dialog
// Shows three upload options optimized for mobile
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
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-gray-900">
            Create Your Listing
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-600">
            Choose your preferred upload method
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          {/* Quick Upload - AI Powered */}
          <motion.button
            onClick={() => {
              onClose();
              onSelectQuick();
            }}
            whileTap={{ scale: 0.98 }}
            className="w-full text-left"
          >
            <div className="p-4 bg-white border-2 border-gray-900 rounded-md hover:shadow-md transition-all">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-md bg-gray-900 flex items-center justify-center flex-shrink-0">
                  <Zap className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-gray-900 mb-0.5">
                    Quick Upload
                  </h3>
                  <p className="text-xs text-gray-600">
                    AI detects details from photos
                  </p>
                </div>
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
            className="w-full text-left"
          >
            <div className="p-4 bg-white border-2 border-gray-200 rounded-md hover:border-blue-200 hover:shadow-md transition-all">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-md bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Link2 className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-gray-900 mb-0.5">
                    Facebook Upload
                  </h3>
                  <p className="text-xs text-gray-600">
                    Import from Facebook link
                  </p>
                </div>
              </div>
            </div>
          </motion.button>

          {/* Bulk Upload */}
          <motion.button
            onClick={() => {
              onClose();
              onSelectBulk();
            }}
            whileTap={{ scale: 0.98 }}
            className="w-full text-left"
          >
            <div className="p-4 bg-white border-2 border-gray-200 rounded-md hover:border-gray-300 hover:shadow-md transition-all">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Upload className="h-5 w-5 text-gray-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-gray-900 mb-0.5">
                    Bulk Upload
                  </h3>
                  <p className="text-xs text-gray-600">
                    Upload multiple products at once
                  </p>
                </div>
              </div>
            </div>
          </motion.button>

          {/* Comprehensive Upload */}
          <motion.button
            onClick={() => {
              onClose();
              onSelectComprehensive();
            }}
            whileTap={{ scale: 0.98 }}
            className="w-full text-left"
          >
            <div className="p-4 bg-white border-2 border-gray-200 rounded-md hover:border-gray-300 hover:shadow-md transition-all">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-gray-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-gray-900 mb-0.5">
                    Comprehensive Upload
                  </h3>
                  <p className="text-xs text-gray-600">
                    Manual form with full control
                  </p>
                </div>
              </div>
            </div>
          </motion.button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

