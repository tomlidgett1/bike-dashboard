"use client";

import * as React from "react";
import { BikeDetailsFormData, WHEEL_SIZES, SUSPENSION_TYPES } from "@/lib/types/listing";
import { FormField, SectionHeader } from "./form-elements";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ValidationError, getFieldError } from "@/lib/validation/listing-validation";

// ============================================================
// Step 4: Components (Bikes)
// ============================================================

interface Step4ComponentsProps {
  data: BikeDetailsFormData;
  onChange: (data: BikeDetailsFormData) => void;
  errors?: ValidationError[];
}

export function Step4Components({ data, onChange, errors = [] }: Step4ComponentsProps) {
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
        <h2 className="text-2xl font-bold text-gray-900">Components & Specifications</h2>
        <p className="text-gray-600">
          Key components and features of your bike
        </p>
      </div>

      {/* Components */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            label="Groupset/Drivetrain"
            hint="e.g., Shimano 105, SRAM Eagle"
          >
            <Input
              value={data.groupset || ""}
              onChange={(e) => updateField("groupset", e.target.value)}
              placeholder="Brand and model"
              className="rounded-md"
            />
          </FormField>

          <FormField
            label="Wheel Size"
            hint="Common sizes: 700c (road), 29 inch (MTB)"
          >
            <Select
              value={data.wheelSize}
              onValueChange={(value) => updateField("wheelSize", value)}
            >
              <SelectTrigger className="rounded-md">
                <SelectValue placeholder="Select wheel size" />
              </SelectTrigger>
              <SelectContent>
                {WHEEL_SIZES.map((size) => (
                  <SelectItem key={size} value={size}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            label="Suspension Type"
            hint="For mountain bikes"
          >
            <Select
              value={data.suspensionType}
              onValueChange={(value: any) => updateField("suspensionType", value)}
            >
              <SelectTrigger className="rounded-md">
                <SelectValue placeholder="Select suspension" />
              </SelectTrigger>
              <SelectContent>
                {SUSPENSION_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            label="Approximate Weight (Optional)"
            hint="e.g., 8.5kg, 25 lbs"
          >
            <Input
              value={data.bikeWeight || ""}
              onChange={(e) => updateField("bikeWeight", e.target.value)}
              placeholder="Enter weight"
              className="rounded-md"
            />
          </FormField>
        </div>
      </div>
    </div>
  );
}



