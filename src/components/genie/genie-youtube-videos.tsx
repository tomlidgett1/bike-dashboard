"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Play } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import type { GenieYoutubeVideoPreview } from "@/lib/genie/youtube-video-search";

function YoutubeVideoCard({ video }: { video: GenieYoutubeVideoPreview }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-md border border-gray-200 bg-white"
    >
      <div className="aspect-video w-full overflow-hidden bg-gray-100">
        <iframe
          src={`https://www.youtube.com/embed/${video.video_id}`}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          className="h-full w-full"
          loading="lazy"
        />
      </div>
      <div className="space-y-0.5 px-3 py-2">
        <p className="line-clamp-2 text-xs font-medium leading-snug text-gray-800">{video.title}</p>
        {(video.channel || video.duration) && (
          <p className="truncate text-[10px] text-gray-500">
            {[video.channel, video.duration].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </motion.div>
  );
}

export function GenieYoutubeVideos({
  videos,
  title = "Helpful video",
  className,
}: {
  videos: GenieYoutubeVideoPreview[];
  title?: string;
  className?: string;
}) {
  if (!videos.length) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-1.5 px-0.5">
        <Play className="h-3.5 w-3.5 text-gray-500" />
        <p className="text-[11px] font-medium text-gray-600">{title}</p>
      </div>
      <div className="space-y-2">
        {videos.map((video) => (
          <YoutubeVideoCard key={video.id} video={video} />
        ))}
      </div>
    </div>
  );
}
