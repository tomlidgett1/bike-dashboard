"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { StoreSetupFlow } from "@/components/settings/store-setup-flow";

interface StoreSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function StoreSetupModal({
  open,
  onOpenChange,
  onComplete,
}: StoreSetupModalProps) {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const handleClose = () => onOpenChange(false);

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="h-[88dvh] max-h-[88dvh] overflow-hidden rounded-t-3xl border-0 bg-transparent p-0 shadow-none"
        >
          <SheetTitle className="sr-only">Store onboarding</SheetTitle>
          <SheetDescription className="sr-only">
            Set up your bike store storefront on Yellow Jersey.
          </SheetDescription>
          {open ? (
            <StoreSetupFlow
              className="h-full max-w-none rounded-b-none rounded-t-3xl shadow-none"
              onClose={handleClose}
              onComplete={onComplete}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="duration-200 data-open:fade-in data-closed:fade-out"
        className="h-[680px] w-[560px] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden border-0 bg-transparent p-0 text-popover-foreground ring-0 duration-300 ease-out animate-in fade-in slide-in-from-bottom-4 zoom-in-95 sm:max-w-[560px]"
      >
        <DialogTitle className="sr-only">Store onboarding</DialogTitle>
        <DialogDescription className="sr-only">
          Set up your bike store storefront on Yellow Jersey.
        </DialogDescription>
        {open ? (
          <StoreSetupFlow
            className="h-full w-full"
            onClose={handleClose}
            onComplete={onComplete}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
