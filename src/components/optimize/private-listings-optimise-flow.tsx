"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyQueue } from "@/components/optimize/copy-queue";
import { PhotoQueue } from "@/components/optimize/photo-queue";
import { OptimiseStepper } from "@/components/optimize/optimise-stepper";

const STEPS = [
  { id: "copy", label: "Optimise copy" },
  { id: "photos", label: "Add photos" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export function PrivateListingsOptimiseFlow({ onBack }: { onBack: () => void }) {
  const [step, setStep] = React.useState<StepId>("copy");

  const handleBack = () => {
    if (step === "photos") setStep("copy");
    else onBack();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <Button type="button" size="sm" variant="ghost" onClick={handleBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <OptimiseStepper compact steps={[...STEPS]} currentStepId={step} />
      </div>

      {step === "copy" && (
        <>
          <CopyQueue fixedScope="private_listing" />
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => setStep("photos")}>
              Continue to photos
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </>
      )}

      {step === "photos" && <PhotoQueue fixedScope="private_listing" />}
    </div>
  );
}
