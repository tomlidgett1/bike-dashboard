"use client";

import * as React from "react";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================================
// Wizard Navigation Component
// ============================================================

interface WizardNavigationProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
  isNextDisabled?: boolean;
  isBackDisabled?: boolean;
  nextLabel?: string;
  showSaveDraft?: boolean;
  lastSaved?: Date | null;
}

export function WizardNavigation({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onSaveDraft,
  isNextDisabled = false,
  isBackDisabled = false,
  nextLabel = "Continue",
  showSaveDraft = true,
  lastSaved,
}: WizardNavigationProps) {
  return (
    <div className="border-t border-gray-200 bg-white px-6 py-4">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        {/* Back Button */}
        <div className="flex-1">
          {currentStep > 1 && (
            <Button
              variant="ghost"
              onClick={onBack}
              disabled={isBackDisabled}
              className="rounded-md"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
        </div>

        {/* Progress & Save Draft */}
        <div className="flex-1 flex flex-col items-center gap-2">
          {/* Progress Dots */}
          <div className="flex items-center gap-2">
            {Array.from({ length: totalSteps }).map((_, index) => {
              const stepNumber = index + 1;
              const isActive = stepNumber === currentStep;
              const isCompleted = stepNumber < currentStep;

              return (
                <div
                  key={stepNumber}
                  className={cn(
                    "h-2 rounded-full transition-all",
                    isActive && "w-8 bg-gray-900",
                    isCompleted && "w-2 bg-gray-400",
                    !isActive && !isCompleted && "w-2 bg-gray-200"
                  )}
                />
              );
            })}
          </div>

          {/* Step Counter & Last Saved */}
          <div className="flex flex-col items-center gap-1">
            <p className="text-xs font-medium text-gray-900">
              Step {currentStep} of {totalSteps}
            </p>
            {lastSaved && (
              <p className="text-xs text-gray-500">
                Auto-saved {formatLastSaved(lastSaved)}
              </p>
            )}
          </div>
        </div>

        {/* Next/Save Buttons */}
        <div className="flex-1 flex items-center justify-end gap-3">
          {showSaveDraft && (
            <Button
              variant="outline"
              onClick={onSaveDraft}
              className="rounded-md"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Draft
            </Button>
          )}

          <Button
            onClick={onNext}
            disabled={isNextDisabled}
            className="rounded-md bg-gray-900 hover:bg-gray-800 text-white"
          >
            {nextLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Step Progress Indicator (for header)
// ============================================================

interface StepProgressProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
}

export function StepProgress({ currentStep, totalSteps, stepLabels }: StepProgressProps) {
  return (
    <div className="w-full max-w-4xl mx-auto py-6">
      <div className="flex items-center justify-between relative">
        {/* Progress Line */}
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 -z-10" />
        <div
          className="absolute top-5 left-0 h-0.5 bg-gray-900 -z-10 transition-all duration-300"
          style={{ width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%` }}
        />

        {/* Steps */}
        {stepLabels.map((label, index) => {
          const stepNumber = index + 1;
          const isActive = stepNumber === currentStep;
          const isCompleted = stepNumber < currentStep;

          return (
            <div key={stepNumber} className="flex flex-col items-center gap-2 bg-white px-2">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
                  isActive && "bg-gray-900 text-white",
                  isCompleted && "bg-gray-900 text-white",
                  !isActive && !isCompleted && "bg-gray-200 text-gray-600"
                )}
              >
                {isCompleted ? "✓" : stepNumber}
              </div>
              <p
                className={cn(
                  "text-xs font-medium text-center max-w-[80px] transition-colors",
                  isActive && "text-gray-900",
                  !isActive && "text-gray-500"
                )}
              >
                {label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Helper Functions
// ============================================================

function formatLastSaved(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins === 1) return "1 minute ago";
  if (diffMins < 60) return `${diffMins} minutes ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1 hour ago";
  return `${diffHours} hours ago`;
}

