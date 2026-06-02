"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { XIcon } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import {
  Dialog,
  DialogClose,
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
import { Button } from "@/components/ui/button";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const router = useRouter();

  // Bottom sheet on mobile, centered dialog on desktop.
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const handleAuthenticated = ({
    destination,
    mode,
  }: {
    destination: "/marketplace" | "/settings";
    mode: "signin" | "signup";
  }) => {
    onOpenChange(false);
    if (destination === "/settings" || mode === "signup") {
      router.push(destination);
    }
    router.refresh();
  };

  // ── Mobile: bottom sheet (native CSS slide-up animation) ──────────────────
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[94dvh] overflow-y-auto rounded-t-3xl border-0 bg-transparent p-0 shadow-none"
        >
          <SheetTitle className="sr-only">Sign in to Yellow Jersey</SheetTitle>
          <SheetDescription className="sr-only">
            Sign in or create an account to continue using Yellow Jersey.
          </SheetDescription>
          <AuthCard
            className="max-w-none rounded-b-none pb-[calc(1.75rem+env(safe-area-inset-bottom))] shadow-none sm:p-7"
            onAuthenticated={handleAuthenticated}
          />
        </SheetContent>
      </Sheet>
    );
  }

  // ── Desktop: centered dialog ──────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-full max-w-[420px] gap-0 border-0 bg-transparent p-0 text-popover-foreground ring-0 sm:max-w-[420px]"
      >
        <DialogTitle className="sr-only">Sign in to Yellow Jersey</DialogTitle>
        <DialogDescription className="sr-only">
          Sign in or create an account to continue using Yellow Jersey.
        </DialogDescription>
        <AuthCard onAuthenticated={handleAuthenticated} />
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute -right-3 -top-3 rounded-full bg-white text-gray-600 shadow-lg ring-1 ring-black/5 hover:bg-gray-50 hover:text-gray-900"
          >
            <XIcon className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
