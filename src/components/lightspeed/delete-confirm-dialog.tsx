"use client";

import * as React from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  title = 'Confirm Deletion',
  description,
  itemCount = 0,
  itemType = 'products',
}: DeleteConfirmDialogProps) {
  const defaultDescription = `Are you sure you want to delete ${itemCount} ${itemType}? This action will mark them as inactive and remove them from your marketplace listings.`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md rounded-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description || defaultDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-xs text-amber-900 dark:text-amber-400">
              <strong>Note:</strong> Items will be marked as inactive. You can reactivate them later if needed.
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-md flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
            className="rounded-md flex-1"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

