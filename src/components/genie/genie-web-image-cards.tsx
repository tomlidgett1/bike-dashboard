"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GenieWebImagePreview } from "@/lib/genie/web-image-search";

function WebImageCard({ image }: { image: GenieWebImagePreview }) {
  const [failed, setFailed] = React.useState(false);
  const src = image.thumbnail_url || image.image_url;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex w-[168px] shrink-0 flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm"
    >
      <div className="relative flex h-[104px] items-center justify-center overflow-hidden bg-gray-50">
        {!failed && src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={image.title}
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : (
          <ImageIcon className="h-7 w-7 text-gray-300" />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="space-y-0.5">
          <p className="line-clamp-2 text-xs font-medium leading-snug text-gray-800">{image.title}</p>
          {image.domain ? (
            <p className="truncate text-[10px] text-gray-500">{image.domain}</p>
          ) : null}
        </div>

        {image.source_url ? (
          <Link
            href={image.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto inline-flex h-8 w-full items-center justify-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            View source
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
    </motion.div>
  );
}

export function GenieWebImageCards({
  images,
  title = "From the web",
  className,
}: {
  images: GenieWebImagePreview[];
  title?: string;
  className?: string;
}) {
  if (!images.length) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-1.5 px-0.5">
        <ImageIcon className="h-3.5 w-3.5 text-gray-500" />
        <p className="text-[11px] font-medium text-gray-600">{title}</p>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {images.map((image) => (
          <WebImageCard key={image.id} image={image} />
        ))}
      </div>
    </div>
  );
}
