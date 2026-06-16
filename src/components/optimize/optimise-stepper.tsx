"use client";

import * as React from "react";
import { Check } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";

export interface OptimiseStep {
  id: string;
  label: string;
}

export function OptimiseStepper({
  steps,
  currentStepId,
  compact = false,
}: {
  steps: OptimiseStep[];
  currentStepId: string;
  compact?: boolean;
}) {
  const currentIndex = steps.findIndex((s) => s.id === currentStepId);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        compact
          ? "text-sm"
          : "rounded-md border border-border/60 bg-white px-4 py-3",
      )}
    >
      {steps.map((step, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = step.id === currentStepId;

        return (
          <React.Fragment key={step.id}>
            {index > 0 && (
              <div
                className={cn(
                  "h-px w-4 shrink-0",
                  isComplete ? "bg-foreground/25" : "bg-border",
                )}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-md text-xs font-semibold",
                  compact ? "h-6 w-6" : "h-7 w-7",
                  isComplete && "bg-foreground text-background",
                  isCurrent && "bg-white text-gray-800 shadow-sm ring-1 ring-border",
                  !isComplete && !isCurrent && "bg-gray-100 text-gray-500",
                )}
              >
                {isComplete ? <Check className="h-3 w-3" /> : index + 1}
              </div>
              <span
                className={cn(
                  compact ? "text-xs sm:text-sm" : "text-sm",
                  "font-medium",
                  isCurrent ? "text-foreground" : "text-muted-foreground",
                  compact && !isCurrent && "hidden sm:inline",
                )}
              >
                {step.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
