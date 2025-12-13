"use client";

import * as React from "react";
import { BikeDetailsFormData, FRAME_MATERIALS } from "@/lib/types/listing";
import { FormField, SectionHeader, InfoBox } from "./form-elements";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ValidationError, getFieldError } from "@/lib/validation/listing-validation";

// ============================================================
// Step 3: Frame Details (Bikes)
// ============================================================

interface Step3FrameDetailsProps {
  data: BikeDetailsFormData;
  onChange: (data: BikeDetailsFormData) => void;
  errors?: ValidationError[];
}

export function Step3FrameDetails({ data, onChange, errors = [] }: Step3FrameDetailsProps) {
  const updateField = <K extends keyof BikeDetailsFormData>(
    field: K,
    value: BikeDetailsFormData[K]
  ) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Frame Specifications</h2>
        <p className="text-gray-600">
          Details about the frame size and material
        </p>
      </div>

      {/* Frame Specifications */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            label="Frame Size"
            required
            error={getFieldError(errors, "frameSize")}
            hint="e.g., 54cm, Medium, 18 inch"
          >
            <Input
              value={data.frameSize || ""}
              onChange={(e) => updateField("frameSize", e.target.value)}
              placeholder="Enter frame size"
              className="rounded-md"
            />
          </FormField>

          <FormField
            label="Frame Material"
            required
            error={getFieldError(errors, "frameMaterial")}
          >
            <Select
              value={data.frameMaterial}
              onValueChange={(value: any) => updateField("frameMaterial", value)}
            >
              <SelectTrigger className="rounded-md">
                <SelectValue placeholder="Select material" />
              </SelectTrigger>
              <SelectContent>
                {FRAME_MATERIALS.map((material) => (
                  <SelectItem key={material} value={material}>
                    {material}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            label="Primary Colour"
            error={getFieldError(errors, "colorPrimary")}
          >
            <Input
              value={data.colorPrimary || ""}
              onChange={(e) => updateField("colorPrimary", e.target.value)}
              placeholder="e.g., Matte Black, Red"
              className="rounded-md"
            />
          </FormField>

          <FormField
            label="Secondary Colour (Optional)"
            hint="If the bike has accent colours"
          >
            <Input
              value={data.colorSecondary || ""}
              onChange={(e) => updateField("colorSecondary", e.target.value)}
              placeholder="e.g., White, Silver"
              className="rounded-md"
            />
          </FormField>
        </div>

        <InfoBox>
          <p>
            <strong>Not sure about your frame size?</strong> Check the manufacturer's
            website or look for a size sticker on the seat tube. Common road bike sizes
            are 50-58cm, while mountain bikes use Small/Medium/Large or inches (16-20").
          </p>
        </InfoBox>
      </div>
    </div>
  );
}








