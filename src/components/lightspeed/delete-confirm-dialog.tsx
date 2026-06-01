"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
  title?: string;
  description?: string;
  itemCount?: number;
  itemType?: 'products' | 'categories';
}

export function DeleteConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
  title = 'Confirm deletion',
  description,
  itemCount = 0,
  itemType = 'products',
}: DeleteConfirmDialogProps) {
  const defaultDescription = `Delete ${itemCount} ${itemType}? They will be marked inactive and removed from your marketplace listings.`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle className="text-sm font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {description || defaultDescription}
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Items can be reactivated later if needed.
          </p>
        </div>

        <Separator />

        <div className="px-4 py-3 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isDeleting}
            className="h-8 text-xs"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={isDeleting}
            className="h-8 text-xs"
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              'Delete'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
