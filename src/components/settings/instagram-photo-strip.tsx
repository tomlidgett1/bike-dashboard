"use client";

import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type InstagramAttachedPhoto = {
  id: string;
  previewUrl: string;
  remoteUrl?: string | null;
  uploading?: boolean;
  error?: string | null;
};

export function InstagramPhotoStrip({
  photos,
  disabled,
  onRemove,
}: {
  photos: InstagramAttachedPhoto[];
  disabled?: boolean;
  onRemove: (id: string) => void;
}) {
  if (photos.length === 0) return null;

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-600">
          {photos.length === 1
            ? "1 photo attached"
            : `${photos.length} photos · carousel`}
        </p>
        {photos.length >= 10 ? (
          <p className="text-[11px] text-gray-400">Max 10 photos</p>
        ) : null}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((photo, index) => (
          <div
            key={photo.id}
            className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.previewUrl}
              alt={`Photo ${index + 1}`}
              className={cn(
                "h-full w-full object-cover",
                photo.uploading && "opacity-60",
              )}
            />
            {photo.uploading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/40">
                <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
              </div>
            ) : null}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove(photo.id)}
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-white/95 text-gray-600 shadow-sm disabled:opacity-50"
              aria-label={`Remove photo ${index + 1}`}
            >
              <X className="h-3 w-3" />
            </button>
            <span className="absolute bottom-1 left-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {index + 1}
            </span>
          </div>
        ))}
      </div>
      {photos.some((photo) => photo.error) ? (
        <p className="text-xs text-gray-500">
          {photos.find((photo) => photo.error)?.error}
        </p>
      ) : null}
    </div>
  );
}
