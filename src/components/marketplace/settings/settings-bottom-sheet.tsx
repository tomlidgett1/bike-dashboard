"use client";

import * as React from "react";
import { X, Loader2 } from '@/components/layout/app-sidebar/dashboard-icons';
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";

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
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl p-0 max-h-[90vh] flex flex-col gap-0"
        showCloseButton={false}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-8 h-1 bg-muted-foreground/20 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-4 pb-3 pt-1 flex-shrink-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-muted transition-colors"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        <Separator className="flex-shrink-0" />

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {children}
        </div>

        {showSave && onSave && (
          <>
            <Separator className="flex-shrink-0" />
            <div className="flex-shrink-0 px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
              <Button
                onClick={onSave}
                disabled={saving}
                className="w-full h-9"
                size="sm"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span className="ml-1.5 text-xs">Saving...</span>
                  </>
                ) : (
                  <span className="text-xs">Save</span>
                )}
              </Button>
            </div>
          </>
        )}

        {!showSave && <div className="pb-[env(safe-area-inset-bottom)]" />}
      </SheetContent>
    </Sheet>
  );
}
