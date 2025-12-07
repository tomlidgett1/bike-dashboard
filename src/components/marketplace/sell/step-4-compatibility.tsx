"use client";

import * as React from "react";
import { PartDetailsFormData } from "@/lib/types/listing";
import { FormField, SectionHeader, InfoBox } from "./form-elements";
import { Textarea } from "@/components/ui/textarea";
import { ValidationError, getFieldError } from "@/lib/validation/listing-validation";

// ============================================================
// Step 4: Compatibility (Parts)
// ============================================================

interface Step4CompatibilityProps {
  data: PartDetailsFormData;
  onChange: (data: PartDetailsFormData) => void;
  errors?: ValidationError[];
}

export function Step4Compatibility({ data, onChange, errors = [] }: Step4CompatibilityProps) {
  const updateField = <K extends keyof PartDetailsFormData>(
    field: K,
    value: PartDetailsFormData[K]
  ) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Compatibility Information</h2>
        <p className="text-gray-600">
          Help buyers know if this part will work with their bike
        </p>
      </div>

      {/* Compatibility */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <FormField
          label="Compatibility Notes"
          hint="Be specific about what this part fits (speeds, standards, mounting)"
          error={getFieldError(errors, "compatibilityNotes")}
        >
          <Textarea
            value={data.compatibilityNotes || ""}
            onChange={(e) => updateField("compatibilityNotes", e.target.value)}
            placeholder="e.g., Compatible with Shimano 11/12-speed drivetrains, HG freehub body required, fits road and gravel bikes"
            className="rounded-md min-h-[150px]"
            maxLength={500}
          />
        </FormField>

        <InfoBox>
          <p>
            <strong>💡 Tip:</strong> Clear compatibility information helps buyers make
            confident decisions. Include details about fitment standards, axle types,
            speeds, or any other relevant specifications.
          </p>
        </InfoBox>
      </div>
    </div>
  );
}




