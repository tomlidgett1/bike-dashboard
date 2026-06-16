"use client";

import * as React from "react";
import { Loader2, CheckCircle2, XCircle, ExternalLink } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";

interface SyncProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: 'syncing' | 'success' | 'error' | null;
  progress?: number;
  phase?: string;
  message?: string;
  result?: {
    itemsSynced: number;
    itemsWithStock: number;
    totalItems: number;
  };
  error?: string;
}

export function SyncProgressModal({
  isOpen,
  onClose,
  status,
  progress = 0,
  phase = '',
  message = '',
  result,
  error,
}: SyncProgressModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle className="text-sm font-semibold">
            {status === 'syncing' && 'Syncing inventory'}
            {status === 'success' && 'Sync complete'}
            {status === 'error' && 'Sync failed'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {status === 'syncing' && 'Syncing your products to the marketplace'}
            {status === 'success' && 'Your products have been synced successfully'}
            {status === 'error' && 'An error occurred during the sync'}
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <div className="px-4 py-3">
          {status === 'syncing' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{phase}</p>
                  {message && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{message}</p>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground flex-shrink-0">{progress}%</span>
              </div>
              <Progress value={progress} className="h-1" />
            </div>
          )}

          {status === 'success' && result && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                <p className="text-xs font-medium text-foreground">
                  {result.itemsSynced} products synced
                </p>
              </div>
              <div className="flex items-center justify-between pl-6">
                <span className="text-[11px] text-muted-foreground">With stock</span>
                <span className="text-[11px] text-foreground">{result.itemsWithStock}</span>
              </div>
              <div className="flex items-center justify-between pl-6">
                <span className="text-[11px] text-muted-foreground">Total processed</span>
                <span className="text-[11px] text-foreground">{result.totalItems}</span>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="flex items-start gap-2.5">
              <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {error || 'An unknown error occurred'}
              </p>
            </div>
          )}
        </div>

        <Separator />

        <div className="px-4 py-3 flex justify-end gap-2">
          {status === 'success' && result && (
            <Link href="/marketplace">
              <Button size="sm" className="h-8 text-xs gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" />
                View marketplace
              </Button>
            </Link>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-8 text-xs"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
