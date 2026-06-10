"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

export function LightspeedCarouselLogo({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "badge";
}) {
  if (variant === "badge") {
    return (
      <span
        className={cn(
          "inline-flex h-3.5 w-3.5 shrink-0 overflow-hidden rounded-full",
          className,
        )}
        title="Lightspeed"
      >
        <Image
          src="/ls.png"
          alt="Lightspeed"
          width={14}
          height={14}
          className="h-full w-full object-cover"
          unoptimized
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-gray-200",
        className,
      )}
    >
      <Image
        src="/ls.png"
        alt="Lightspeed"
        width={20}
        height={20}
        className="h-5 w-5 object-cover"
        unoptimized
      />
    </span>
  );
}
