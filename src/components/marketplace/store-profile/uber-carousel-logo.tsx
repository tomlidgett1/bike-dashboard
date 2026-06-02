"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

export function UberCarouselLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-full bg-[#0eb462] px-3 shadow-sm",
        className
      )}
    >
      <Image
        src="/uber.png"
        alt="Uber"
        width={42}
        height={16}
        className="h-3.5 w-auto"
        unoptimized
      />
    </span>
  );
}
