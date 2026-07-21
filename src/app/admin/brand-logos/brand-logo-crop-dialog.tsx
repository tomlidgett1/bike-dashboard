"use client";

import * as React from "react";
import ReactCrop, {
  type Crop,
  type PercentCrop,
  centerCrop,
  convertToPercentCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BrandLogoCropPixels } from "@/lib/admin/import-brand-logo";

export type { BrandLogoCropPixels };

type BrandLogoCropDialogProps = {
  open: boolean;
  imageUrl: string;
  brandName: string;
  busy?: boolean;
  confirmLabel?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (crop: BrandLogoCropPixels) => void;
};

function toPercentCrop(crop: PercentCrop): BrandLogoCropPixels | null {
  if (crop.width < 1 || crop.height < 1) return null;

  const x = Math.max(0, crop.x);
  const y = Math.max(0, crop.y);
  const width = Math.min(crop.width, 100 - x);
  const height = Math.min(crop.height, 100 - y);

  if (width < 1 || height < 1) return null;

  return {
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    width: Number(width.toFixed(4)),
    height: Number(height.toFixed(4)),
  };
}

export function BrandLogoCropDialog({
  open,
  imageUrl,
  brandName,
  busy = false,
  confirmLabel = "Crop & approve",
  onOpenChange,
  onConfirm,
}: BrandLogoCropDialogProps) {
  const [crop, setCrop] = React.useState<Crop>();
  const [percentCrop, setPercentCrop] = React.useState<BrandLogoCropPixels | null>(null);
  const [imageError, setImageError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setCrop(undefined);
    setPercentCrop(null);
    setImageError(null);
  }, [open, imageUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="animate-in fade-in duration-200"
        className="max-w-2xl gap-0 overflow-hidden rounded-md border border-gray-200 bg-white p-0 shadow-lg animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out"
      >
        <DialogHeader className="border-b border-gray-100 px-5 py-4">
          <DialogTitle className="text-base font-semibold text-gray-900">
            Crop {brandName} logo
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            Drag the selection and pull the corner handles to choose exactly what to keep.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] items-center justify-center overflow-auto bg-gray-100 px-4 py-4">
          {imageError ? (
            <p className="rounded-md bg-white p-3 text-sm text-red-600">{imageError}</p>
          ) : (
            <ReactCrop
              crop={crop}
              onChange={(next) => setCrop(next)}
              onComplete={(_pixel, percent) => {
                setPercentCrop(toPercentCrop(percent));
              }}
              keepSelection
              ruleOfThirds
              className="max-w-full"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={`${brandName} logo to crop`}
                className="max-h-[52vh] max-w-full object-contain"
                onLoad={(e) => {
                  const image = e.currentTarget;
                  const initial = centerCrop(
                    {
                      unit: "%",
                      width: 80,
                      height: 80,
                    },
                    image.width,
                    image.height,
                  );
                  setCrop(initial);
                  setPercentCrop(
                    toPercentCrop(
                      convertToPercentCrop(initial, image.width, image.height),
                    ),
                  );
                }}
                onError={() =>
                  setImageError(
                    "Could not load this image for cropping. Try another candidate.",
                  )
                }
              />
            </ReactCrop>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <Button
            type="button"
            variant="outline"
            className="rounded-md"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-md"
            disabled={busy || !percentCrop}
            onClick={() => {
              if (percentCrop) onConfirm(percentCrop);
            }}
          >
            {busy ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
