"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type MagnetProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  padding?: number;
  disabled?: boolean;
  magnetStrength?: number;
  innerClassName?: string;
};

/**
 * Adapted from React Bits Magnet (MIT).
 * The response is intentionally low-strength for commerce controls.
 * Source: https://reactbits.dev/animations/magnet
 */
export function Magnet({
  children,
  padding = 30,
  disabled = false,
  magnetStrength = 18,
  className,
  innerClassName,
  ...props
}: MagnetProps) {
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [isActive, setIsActive] = React.useState(false);
  const magnetRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (
      disabled ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(pointer: coarse)").matches
    ) {
      setPosition({ x: 0, y: 0 });
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const element = magnetRef.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const centreX = rect.left + rect.width / 2;
      const centreY = rect.top + rect.height / 2;
      const nearby =
        Math.abs(centreX - event.clientX) < rect.width / 2 + padding &&
        Math.abs(centreY - event.clientY) < rect.height / 2 + padding;

      setIsActive(nearby);
      setPosition(
        nearby
          ? {
              x: (event.clientX - centreX) / magnetStrength,
              y: (event.clientY - centreY) / magnetStrength,
            }
          : { x: 0, y: 0 },
      );
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [disabled, magnetStrength, padding]);

  return (
    <div ref={magnetRef} className={cn("relative", className)} {...props}>
      <div
        className={cn("h-full", innerClassName)}
        style={{
          transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
          transition: isActive
            ? "transform 180ms ease-out"
            : "transform 420ms cubic-bezier(0.04, 0.62, 0.23, 0.98)",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}
