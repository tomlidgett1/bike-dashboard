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
import { Button } from "@/components/ui/button";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const router = useRouter();

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
        <AuthCard
          onAuthenticated={({ destination, mode }) => {
            onOpenChange(false);

            if (destination === "/settings" || mode === "signup") {
              router.push(destination);
            }

            router.refresh();
          }}
        />
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
