"use client";

import * as React from "react";
import { Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
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
      <DialogContent className="sm:max-w-md rounded-md">
        <DialogHeader>
          <DialogTitle>
            {status === 'syncing' && 'Syncing Inventory'}
            {status === 'success' && 'Sync Complete'}
            {status === 'error' && 'Sync Failed'}
          </DialogTitle>
          <DialogDescription>
            {status === 'syncing' && 'Please wait while we sync your products to the marketplace'}
            {status === 'success' && 'Your products have been successfully synced'}
            {status === 'error' && 'An error occurred during the sync process'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Syncing State */}
          {status === 'syncing' && (
            <>
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{phase}</div>
                  {message && (
                    <div className="text-xs text-muted-foreground mt-0.5">{message}</div>
                  )}
                </div>
              </div>
              
              <Progress value={progress} className="h-2" />
              
              <div className="text-xs text-center text-muted-foreground">
                {progress}%
              </div>
            </>
          )}

          {/* Success State */}
          {status === 'success' && result && (
            <>
              <div className="flex items-center gap-3 p-4 rounded-md bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-green-900 dark:text-green-400">
                    Successfully synced {result.itemsSynced} products
                  </div>
                  <div className="text-xs text-green-700 dark:text-green-400 mt-1">
                    {result.itemsWithStock} items had stock • {result.totalItems} total items processed
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Link href="/marketplace" className="flex-1">
                  <Button variant="default" className="w-full rounded-md">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View on Marketplace
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="rounded-md"
                >
                  Close
                </Button>
              </div>
            </>
          )}

          {/* Error State */}
          {status === 'error' && (
            <>
              <div className="flex items-start gap-3 p-4 rounded-md bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-red-900 dark:text-red-400">
                    Sync Failed
                  </div>
                  <div className="text-xs text-red-700 dark:text-red-400 mt-1">
                    {error || 'An unknown error occurred'}
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={onClose}
                className="w-full rounded-md"
              >
                Close
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

