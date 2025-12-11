"use client";

import * as React from "react";
import { BikeDetailsFormData, BIKE_TYPES, COMMON_BIKE_BRANDS } from "@/lib/types/listing";
import { FormField, SectionHeader, Autocomplete, YearSelector } from "./form-elements";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ValidationError, getFieldError } from "@/lib/validation/listing-validation";

// ============================================================
// Step 2: Basic Info (Bikes)
// ============================================================

interface Step2BasicInfoProps {
  data: BikeDetailsFormData;
  onChange: (data: BikeDetailsFormData) => void;
  errors?: ValidationError[];
}

export function Step2BasicInfo({ data, onChange, errors = [] }: Step2BasicInfoProps) {
  const updateField = <K extends keyof BikeDetailsFormData>(
    field: K,
    value: BikeDetailsFormData[K]
  ) => {
    onChange({ ...data, [field]: value });
  };

  // Auto-generate title when fields change
  React.useEffect(() => {
    if (data.brand && data.model) {
      const parts = [
        data.modelYear,
        data.brand,
        data.model,
        data.bikeType,
      ].filter(Boolean);
      const generatedTitle = parts.join(" ");
      if (generatedTitle !== data.title) {
        updateField("title", generatedTitle);
      }
    }
  }, [data.brand, data.model, data.modelYear, data.bikeType]);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Basic Information</h2>
        <p className="text-gray-600">
          Let's start with the essentials about your bike
        </p>
      </div>

      {/* Basic Information Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            label="Brand/Manufacturer"
            required
            error={getFieldError(errors, "brand")}
            hint="Start typing for suggestions"
          >
            <Autocomplete
              value={data.brand || ""}
              onChange={(value) => updateField("brand", value)}
              suggestions={COMMON_BIKE_BRANDS}
              placeholder="e.g., Specialized, Trek, Canyon"
            />
          </FormField>

          <FormField
            label="Model"
            required
            error={getFieldError(errors, "model")}
          >
            <Input
              value={data.model || ""}
              onChange={(e) => updateField("model", e.target.value)}
              placeholder="e.g., Tarmac SL7, Fuel EX"
              className="rounded-md"
            />
          </FormField>

          <FormField
            label="Model Year"
            error={getFieldError(errors, "modelYear")}
            hint="Optional but helps with valuation"
          >
            <YearSelector
              value={data.modelYear}
              onChange={(value) => updateField("modelYear", value)}
              placeholder="Select year"
            />
          </FormField>

          <FormField
            label="Bike Type"
            required
            error={getFieldError(errors, "bikeType")}
          >
            <Select
              value={data.bikeType}
              onValueChange={(value) => updateField("bikeType", value)}
            >
              <SelectTrigger className="rounded-md">
                <SelectValue placeholder="Select bike type" />
              </SelectTrigger>
              <SelectContent>
                {BIKE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <FormField
          label="Listing Title"
          hint="Auto-generated from the details above, but you can customise it"
          error={getFieldError(errors, "title")}
        >
          <Input
            value={data.title || ""}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="e.g., 2023 Specialized Tarmac SL7 Road"
            className="rounded-md"
            maxLength={150}
          />
        </FormField>
      </div>
    </div>
  );
}







