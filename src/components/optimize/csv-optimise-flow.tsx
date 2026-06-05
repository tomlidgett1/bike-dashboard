"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OptimiseStepper } from "@/components/optimize/optimise-stepper";
import {
  type CsvPhotosPayload,
  StoreOnlineProductsCsvPanel,
} from "@/components/settings/store-online-products-csv-panel";
import { CsvOptimisePhotosStep } from "@/components/optimize/csv-optimise-photos-step";

const STEPS = [
  { id: "import", label: "Import CSV" },
  { id: "copy", label: "Optimise copy" },
  { id: "photos", label: "Choose photos" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export function CsvOptimiseFlow({ onBack }: { onBack: () => void }) {
  const [step, setStep] = React.useState<StepId>("import");
  const [error, setError] = React.useState<string | null>(null);
  const [photosPayload, setPhotosPayload] = React.useState<CsvPhotosPayload | null>(null);

  const handleBack = () => {
    if (step === "photos") setStep("copy");
    else if (step === "copy") setStep("import");
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

      {error && (
        <div className="rounded-md border border-destructive/30 bg-white px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {step !== "photos" && (
        <StoreOnlineProductsCsvPanel
          wizardMode
          wizardStep={step === "import" ? "import" : "copy"}
          onError={setError}
          onImportComplete={() => setStep("copy")}
          onReadyForPhotos={(payload) => {
            setPhotosPayload(payload);
            setStep("photos");
          }}
          onBackToImport={() => setStep("import")}
        />
      )}

      {step === "photos" && photosPayload && (
        <CsvOptimisePhotosStep
          payload={photosPayload}
          onComplete={onBack}
        />
      )}
    </div>
  );
}
