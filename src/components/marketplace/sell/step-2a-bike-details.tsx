"use client";

import * as React from "react";
import { BikeDetailsFormData, BIKE_TYPES, FRAME_MATERIALS, WHEEL_SIZES, SUSPENSION_TYPES, COMMON_BIKE_BRANDS } from "@/lib/types/listing";
import { FormField, SectionHeader, Autocomplete, YearSelector, InfoBox } from "./form-elements";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ValidationError } from "@/lib/validation/listing-validation";
import { getFieldError } from "@/lib/validation/listing-validation";

// ============================================================
// Step 2A: Bike Details Form
// ============================================================

interface Step2ABikeDetailsProps {
  data: BikeDetailsFormData;
  onChange: (data: BikeDetailsFormData) => void;
  errors?: ValidationError[];
}

export function Step2ABikeDetails({ data, onChange, errors = [] }: Step2ABikeDetailsProps) {
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
        <h2 className="text-2xl font-bold text-gray-900">Bike Details</h2>
        <p className="text-gray-600">
          Tell us about your bike - we'll use this to create an attractive listing
        </p>
      </div>

      {/* Section 1: Basic Information */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Basic Information"
          description="Essential details about your bike"
        />

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

      {/* Section 2: Frame Specifications */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Frame Specifications"
          description="Details about the frame size and material"
        />

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

      {/* Section 3: Components */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Components & Specifications"
          description="Key components and features of your bike"
        />

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

      {/* Section 4: Additional Features */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Upgrades & Notable Features"
          description="Any upgrades or special features worth highlighting"
        />

        <FormField
          label="Upgrades from Stock (Optional)"
          hint="Describe any upgrades you've made (e.g., carbon wheels, electronic shifting)"
          error={getFieldError(errors, "upgradesModifications")}
        >
          <Textarea
            value={data.upgradesModifications || ""}
            onChange={(e) => updateField("upgradesModifications", e.target.value)}
            placeholder="e.g., Upgraded to Zipp 303 carbon wheels, installed Di2 electronic shifting, carbon handlebars"
            className="rounded-md min-h-[120px]"
            maxLength={1000}
          />
        </FormField>

        <InfoBox>
          <p>
            <strong>💡 Tip:</strong> Mentioning upgrades and premium components can
            significantly increase buyer interest. Include brands and models where
            possible.
          </p>
        </InfoBox>
      </div>
    </div>
  );
}

