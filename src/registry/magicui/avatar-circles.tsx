"use client";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface AvatarCircleItem {
  imageUrl: string;
  label: string;
  profileUrl?: string;
  /** Zoom the logo inside the circle — useful when the asset has built-in padding. */
  imageScale?: number;
}

interface AvatarCirclesProps {
  className?: string;
  avatarUrls: AvatarCircleItem[];
  size?: "sm" | "md";
}

export function AvatarCircles({ className, avatarUrls, size = "sm" }: AvatarCirclesProps) {
  if (avatarUrls.length === 0) return null;

  const shell = size === "sm" ? "size-8" : "size-10";

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("flex items-center", className)}>
        {avatarUrls.map((item, index) => {
          const shellClass = cn(
            shell,
            "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200/90 bg-white",
            index > 0 && "-ml-2.5",
          );
          const shellStyle = { zIndex: index };

          const logo = (
            <img
              src={item.imageUrl}
              alt=""
              aria-hidden
              className="block size-full object-cover"
              style={
                item.imageScale
                  ? { transform: `scale(${item.imageScale})`, transformOrigin: "center" }
                  : undefined
              }
              draggable={false}
            />
          );

          const trigger = item.profileUrl ? (
            <a
              href={item.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={shellClass}
              style={shellStyle}
              aria-label={item.label}
            >
              {logo}
            </a>
          ) : (
            <button
              type="button"
              className={cn(shellClass, "cursor-default p-0")}
              style={shellStyle}
              aria-label={item.label}
            >
              {logo}
            </button>
          );

          return (
            <Tooltip key={`${item.label}-${index}`}>
              <TooltipTrigger asChild>{trigger}</TooltipTrigger>
              <TooltipContent side="top" sideOffset={6}>
                {item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
