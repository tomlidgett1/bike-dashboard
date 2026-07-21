"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { InstagramLogo } from "@/components/settings/instagram-logo";
import {
  type InstagramDestination,
  type InstagramPostAspect,
  resolveInstagramFormat,
} from "@/lib/instagram/formats";
import { cn } from "@/lib/utils";

/**
 * Clean Instagram-style post card (no phone chrome).
 * Bottom block: account name, then caption directly underneath.
 * Supports multi-photo carousel previews.
 */
export function InstagramPostPreview({
  imageUrl,
  imageUrls,
  caption,
  username,
  destination,
  aspect,
  className,
}: {
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  caption: string;
  username: string;
  destination: InstagramDestination;
  aspect: InstagramPostAspect;
  className?: string;
}) {
  const slides = React.useMemo(() => {
    const list = (imageUrls || []).map((url) => url.trim()).filter(Boolean);
    if (list.length > 0) return list;
    const single = imageUrl?.trim();
    return single ? [single] : [];
  }, [imageUrl, imageUrls]);

  const [slideIndex, setSlideIndex] = React.useState(0);
  const slidesKey = slides.join("|");
  React.useEffect(() => {
    setSlideIndex(0);
  }, [slidesKey]);

  const handle = username.replace(/^@/, "") || "yourstore";
  const format = resolveInstagramFormat({ destination, aspect });
  const current = slides[Math.min(slideIndex, Math.max(slides.length - 1, 0))] || "";
  const isCarousel = slides.length > 1;

  return (
    <div className={cn("w-full", className)}>
      <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
        <div
          className="relative bg-gray-50"
          style={{ aspectRatio: `${format.width} / ${format.height}` }}
        >
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current}
              alt="Instagram preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-gray-400">
              No photo yet
            </div>
          )}

          {isCarousel ? (
            <>
              <button
                type="button"
                onClick={() =>
                  setSlideIndex((index) =>
                    index === 0 ? slides.length - 1 : index - 1,
                  )
                }
                className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md bg-white/90 text-gray-700 shadow-sm"
                aria-label="Previous photo"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setSlideIndex((index) =>
                    index === slides.length - 1 ? 0 : index + 1,
                  )
                }
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md bg-white/90 text-gray-700 shadow-sm"
                aria-label="Next photo"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-md bg-black/35 px-2 py-1">
                {slides.map((_, index) => (
                  <span
                    key={index}
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      index === slideIndex ? "bg-white" : "bg-white/45",
                    )}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>

        <div className="space-y-1.5 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-50 ring-1 ring-gray-200">
              <InstagramLogo className="h-3.5 w-3.5" />
            </div>
            <p className="truncate text-sm font-semibold text-gray-900">
              {handle}
            </p>
            {isCarousel ? (
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                {slides.length} photos
              </span>
            ) : null}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
            {caption.trim() || (
              <span className="text-gray-400">Your caption will appear here…</span>
            )}
          </p>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-gray-400">
        {isCarousel
          ? `Carousel · ${slides.length} photos`
          : `${format.ratioLabel} · ${format.width}×${format.height}`}
      </p>
    </div>
  );
}
