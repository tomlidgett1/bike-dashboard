"use client";

import * as React from "react";
import { FileText, Upload, ChevronRight } from "lucide-react";
import Image from "next/image";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";

// ============================================================
// Mobile Upload Method Dialog
// Native bottom sheet design optimised for mobile
// Uses Radix Sheet for smooth, hardware-accelerated animations
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
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent 
        side="bottom" 
        className="rounded-t-2xl p-0 overflow-hidden gap-0"
        showCloseButton={false}
      >
        {/* Handle Bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        
        {/* Header */}
        <div className="px-5 pb-3">
          <h2 className="text-xl font-semibold text-gray-900">
            List Your Item
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Choose how you'd like to create your listing
          </p>
        </div>
        
        {/* Options */}
        <div className="px-4 pb-8 space-y-2">
          {/* Recommended: Quick Upload */}
          <button
            onClick={() => {
              onClose();
              onSelectQuick();
            }}
            className="w-full active:scale-[0.98] transition-transform"
          >
            <div className="bg-white border border-gray-300 rounded-xl p-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <img 
                    src="/icons/noun-fast-4767027.svg" 
                    alt="Quick Upload" 
                    className="w-7 h-7"
                  />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <h3 className="text-base font-semibold text-gray-900">
                    Quick Upload
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    AI fills in details from your photos
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
              </div>
            </div>
          </button>

          {/* Facebook Import */}
          <button
            onClick={() => {
              onClose();
              onSelectFacebook();
            }}
            className="w-full active:scale-[0.98] transition-transform"
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
          </button>

          {/* Divider with "More options" */}
          <div className="flex items-center gap-3 py-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">More options</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Secondary Options Row */}
          <div className="grid grid-cols-2 gap-2">
            {/* Bulk Upload */}
            <button
              onClick={() => {
                onClose();
                onSelectBulk();
              }}
              className="w-full active:scale-[0.98] transition-transform"
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
            </button>

            {/* Manual Entry */}
            <button
              onClick={() => {
                onClose();
                onSelectComprehensive();
              }}
              className="w-full active:scale-[0.98] transition-transform"
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
            </button>
          </div>
        </div>
        
        {/* Safe area padding for iOS */}
        <div className="h-safe-area-inset-bottom" />
      </SheetContent>
    </Sheet>
  );
}

