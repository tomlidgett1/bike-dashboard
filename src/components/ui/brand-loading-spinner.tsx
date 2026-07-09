"use client";

import Lottie from "lottie-react";
import loadingAnimation from "@/assets/animations/loading2.json";
import { cn } from "@/lib/utils";

type BrandLoadingSpinnerProps = {
  className?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
};

const SIZE_CLASS = {
  sm: "h-8 w-8",
  md: "h-12 w-12",
  lg: "h-16 w-16",
} as const;

export function BrandLoadingSpinner({
  className,
  label,
  size = "md",
}: BrandLoadingSpinnerProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3", className)}
      role="status"
      aria-live="polite"
      aria-label={label || "Loading"}
    >
      <Lottie
        animationData={loadingAnimation}
        loop
        className={cn("shrink-0", SIZE_CLASS[size])}
      />
      {label ? <p className="text-sm text-gray-500">{label}</p> : null}
    </div>
  );
}
