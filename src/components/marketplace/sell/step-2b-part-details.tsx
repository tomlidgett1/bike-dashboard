"use client";

import * as React from "react";
import { PartDetailsFormData, COMMON_COMPONENT_BRANDS } from "@/lib/types/listing";
import { MARKETPLACE_SUBCATEGORIES } from "@/lib/types/marketplace";
import { FormField, SectionHeader, Autocomplete, InfoBox } from "./form-elements";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ValidationError, getFieldError } from "@/lib/validation/listing-validation";

// ============================================================
// Step 2B: Part Details Form
// ============================================================

interface Step2BPartDetailsProps {
  data: PartDetailsFormData;
  onChange: (data: PartDetailsFormData) => void;
  errors?: ValidationError[];
}

export function Step2BPartDetails({ data, onChange, errors = [] }: Step2BPartDetailsProps) {
  const updateField = <K extends keyof PartDetailsFormData>(
    field: K,
    value: PartDetailsFormData[K]
  ) => {
    onChange({ ...data, [field]: value });
  };

  // Auto-generate title
  React.useEffect(() => {
    if (data.brand && data.model) {
      const parts = [data.brand, data.model, data.partTypeDetail].filter(Boolean);
      const generatedTitle = parts.join(" ");
      if (generatedTitle !== data.title) {
        updateField("title", generatedTitle);
      }
    }
  }, [data.brand, data.model, data.partTypeDetail]);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Part Details</h2>
        <p className="text-gray-600">
          Provide detailed information about your cycling component
        </p>
      </div>

      {/* Section 1: Basic Information */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Basic Information"
          description="What part are you selling?"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            label="Part Category"
            required
            error={getFieldError(errors, "marketplace_subcategory")}
          >
            <Select
              value={data.marketplace_subcategory}
              onValueChange={(value) => updateField("marketplace_subcategory", value)}
            >
              <SelectTrigger className="rounded-md">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {MARKETPLACE_SUBCATEGORIES.Parts.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            label="Specific Part Type"
            hint="e.g., Rear Derailleur, 11-speed Cassette"
            error={getFieldError(errors, "partTypeDetail")}
          >
            <Input
              value={data.partTypeDetail || ""}
              onChange={(e) => updateField("partTypeDetail", e.target.value)}
              placeholder="Be specific"
              className="rounded-md"
            />
          </FormField>

          <FormField
            label="Brand"
            required
            error={getFieldError(errors, "brand")}
            hint="Start typing for suggestions"
          >
            <Autocomplete
              value={data.brand || ""}
              onChange={(value) => updateField("brand", value)}
              suggestions={COMMON_COMPONENT_BRANDS}
              placeholder="e.g., Shimano, SRAM, Campagnolo"
            />
          </FormField>

          <FormField
            label="Model/Part Number"
            required
            error={getFieldError(errors, "model")}
            hint="Include the specific model"
          >
            <Input
              value={data.model || ""}
              onChange={(e) => updateField("model", e.target.value)}
              placeholder="e.g., GX Eagle, Ultegra R8000"
              className="rounded-md"
            />
          </FormField>
        </div>

        <FormField
          label="Listing Title"
          hint="Auto-generated, but you can customise it"
          error={getFieldError(errors, "title")}
        >
          <Input
            value={data.title || ""}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="e.g., SRAM GX Eagle Rear Derailleur"
            className="rounded-md"
            maxLength={150}
          />
        </FormField>
      </div>

      {/* Section 2: Specifications */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Specifications"
          description="Technical details about the part"
        />

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
        </div>
      </div>

      {/* Section 3: Compatibility */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Compatibility Information"
          description="Help buyers know if this part will work with their bike"
        />

        <FormField
          label="Compatibility Notes"
          hint="Be specific about what this part fits (speeds, standards, mounting)"
          error={getFieldError(errors, "compatibilityNotes")}
        >
          <Textarea
            value={data.compatibilityNotes || ""}
            onChange={(e) => updateField("compatibilityNotes", e.target.value)}
            placeholder="e.g., Compatible with Shimano 11/12-speed drivetrains, HG freehub body required, fits road and gravel bikes"
            className="rounded-md min-h-[100px]"
            maxLength={500}
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

