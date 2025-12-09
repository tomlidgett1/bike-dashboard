"use client";

import * as React from "react";
import { PartDetailsFormData, COMMON_COMPONENT_BRANDS } from "@/lib/types/listing";
import { FormField, SectionHeader, InfoBox } from "./form-elements";
import { Input } from "@/components/ui/input";
import { ValidationError, getFieldError } from "@/lib/validation/listing-validation";

// ============================================================
// Step 3: Specifications (Parts)
// ============================================================

interface Step3SpecificationsProps {
  data: PartDetailsFormData;
  onChange: (data: PartDetailsFormData) => void;
  errors?: ValidationError[];
}

export function Step3Specifications({ data, onChange, errors = [] }: Step3SpecificationsProps) {
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
        <h2 className="text-2xl font-bold text-gray-900">Specifications</h2>
        <p className="text-gray-600">
          Technical details about the part
        </p>
      </div>

      {/* Specifications */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            label="Material (Optional)"
            hint="e.g., Carbon, Aluminium, Titanium"
          >
            <Input
              value={data.material || ""}
              onChange={(e) => updateField("material", e.target.value)}
              placeholder="Enter material"
              className="rounded-md"
            />
          </FormField>

          <FormField
            label="Colour"
            hint="Main colour of the part"
          >
            <Input
              value={data.colorPrimary || ""}
              onChange={(e) => updateField("colorPrimary", e.target.value)}
              placeholder="e.g., Black, Silver"
              className="rounded-md"
            />
          </FormField>

          <FormField
            label="Weight (Optional)"
            hint="e.g., 245g, 0.5 lbs"
          >
            <Input
              value={data.weight || ""}
              onChange={(e) => updateField("weight", e.target.value)}
              placeholder="Enter weight"
              className="rounded-md"
            />
          </FormField>

          <FormField
            label="Intended Use (Optional)"
            hint="Road, Mountain, Gravel, etc."
          >
            <Input
              value={data.intendedUse || ""}
              onChange={(e) => updateField("intendedUse", e.target.value)}
              placeholder="e.g., Road, MTB, Gravel"
              className="rounded-md"
            />
          </FormField>
        </div>

        <InfoBox>
          <p>
            <strong>💡 Tip:</strong> Accurate specifications help buyers make informed
            decisions. Include measurements and technical details where possible.
          </p>
        </InfoBox>
      </div>
    </div>
  );
}






