"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type SpotlightCardProps = React.PropsWithChildren<{
  className?: string;
  spotlightColor?: `rgba(${number}, ${number}, ${number}, ${number})`;
}>;

/**
 * Adapted from React Bits SpotlightCard (MIT).
 * Keeps the original pointer-following spotlight, tuned for light surfaces.
 * Source: https://reactbits.dev/components/spotlight-card
 */
export function SpotlightCard({
  children,
  className,
  spotlightColor = "rgba(255, 222, 89, 0.14)",
}: SpotlightCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = React.useState(false);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = React.useState(0);

  const handlePointerMove: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (!cardRef.current || isFocused || event.pointerType === "touch") return;
    const rect = cardRef.current.getBoundingClientRect();
    setPosition({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onFocus={() => {
        setIsFocused(true);
        setOpacity(1);
      }}
      onBlur={() => {
        setIsFocused(false);
        setOpacity(0);
      }}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setOpacity(1);
      }}
      onPointerLeave={() => setOpacity(0)}
      className={cn("relative overflow-hidden rounded-md", className)}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] opacity-0 transition-opacity duration-500 ease-out motion-reduce:hidden"
        style={{
          opacity,
          background: `radial-gradient(360px circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 72%)`,
        }}
      />
      <div className="relative z-[2] h-full">{children}</div>
    </div>
  );
}
