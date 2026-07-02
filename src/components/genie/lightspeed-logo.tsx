import Image from "next/image";
import type { IconProps } from "@solar-icons/react";
import { cn } from "@/lib/utils";

export function LightspeedLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/ls.png"
      alt="Lightspeed"
      width={32}
      height={32}
      unoptimized
      className={cn("h-[18px] w-[18px] rounded-full object-cover", className)}
    />
  );
}

export function LightspeedSidebarIcon({ className }: IconProps) {
  return (
    <Image
      src="/ls.png"
      alt="Lightspeed"
      width={16}
      height={16}
      unoptimized
      className={cn("size-4 shrink-0 rounded-full object-cover", className)}
    />
  );
}
