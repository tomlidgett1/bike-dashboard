"use client";

import * as React from "react";
import { 
  ApparelDetailsFormData, 
  GENDER_FITS, 
  APPAREL_SIZES,
  SHOE_SIZES_EU 
} from "@/lib/types/listing";
import { MARKETPLACE_SUBCATEGORIES } from "@/lib/types/marketplace";
import { FormField, SectionHeader, InfoBox } from "./form-elements";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ValidationError, getFieldError } from "@/lib/validation/listing-validation";

// ============================================================
// Step 2C: Apparel Details Form
// ============================================================

interface Step2CApparelDetailsProps {
  data: ApparelDetailsFormData;
  onChange: (data: ApparelDetailsFormData) => void;
  errors?: ValidationError[];
}

export function Step2CApparelDetails({ data, onChange, errors = [] }: Step2CApparelDetailsProps) {
  const updateField = <K extends keyof ApparelDetailsFormData>(
    field: K,
    value: ApparelDetailsFormData[K]
  ) => {
    onChange({ ...data, [field]: value });
  };

  const isShoes = data.marketplace_subcategory === "Shoes";
  const isHelmet = data.marketplace_subcategory === "Helmets";

  // Auto-generate title
  React.useEffect(() => {
    if (data.brand && data.marketplace_subcategory) {
      const parts = [
        data.genderFit,
        data.brand,
        data.model,
        data.marketplace_subcategory,
        data.size && `Size ${data.size}`,
      ].filter(Boolean);
      const generatedTitle = parts.join(" ");
      if (generatedTitle !== data.title) {
        updateField("title", generatedTitle);
      }
    }
  }, [data.brand, data.model, data.marketplace_subcategory, data.size, data.genderFit]);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Apparel Details</h2>
        <p className="text-gray-600">
          Tell us about your cycling apparel or accessory
        </p>
      </div>

      {/* Section 1: Basic Information */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Basic Information"
          description="What are you selling?"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            label="Category"
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
                {MARKETPLACE_SUBCATEGORIES.Apparel.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            label="Brand"
            required
            error={getFieldError(errors, "brand")}
          >
            <Input
              value={data.brand || ""}
              onChange={(e) => updateField("brand", e.target.value)}
              placeholder="e.g., Castelli, Rapha, POC"
              className="rounded-md"
            />
          </FormField>

          <FormField
            label="Model/Name (Optional)"
            hint="Product name if known"
          >
            <Input
              value={data.model || ""}
              onChange={(e) => updateField("model", e.target.value)}
              placeholder="e.g., Perfetto RoS"
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
            placeholder="e.g., Men's Castelli Perfetto RoS Jacket Size M"
            className="rounded-md"
            maxLength={150}
          />
        </FormField>
      </div>

      {/* Section 2: Sizing */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Size & Fit"
          description="Help buyers find the right fit"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            label="Size"
            required
            error={getFieldError(errors, "size")}
          >
            {isShoes ? (
              <Select
                value={data.size}
                onValueChange={(value) => updateField("size", value)}
              >
                <SelectTrigger className="rounded-md">
                  <SelectValue placeholder="Select shoe size" />
                </SelectTrigger>
                <SelectContent>
                  {SHOE_SIZES_EU.map((size) => (
                    <SelectItem key={size} value={size}>
                      EU {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : isHelmet ? (
              <Input
                value={data.size || ""}
                onChange={(e) => updateField("size", e.target.value)}
                placeholder="e.g., 54-58cm, M/L"
                className="rounded-md"
              />
            ) : (
              <Select
                value={data.size}
                onValueChange={(value) => updateField("size", value)}
              >
                <SelectTrigger className="rounded-md">
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  {APPAREL_SIZES.map((size) => (
                    <SelectItem key={size} value={size}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>

          <FormField
            label="Gender/Fit"
            required
            error={getFieldError(errors, "genderFit")}
          >
            <Select
              value={data.genderFit}
              onValueChange={(value: any) => updateField("genderFit", value)}
            >
              <SelectTrigger className="rounded-md">
                <SelectValue placeholder="Select fit" />
              </SelectTrigger>
              <SelectContent>
                {GENDER_FITS.map((fit) => (
                  <SelectItem key={fit} value={fit}>
                    {fit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <div className="md:col-span-2">
            <FormField
              label="Fit Notes (Optional)"
              hint="e.g., Runs small, Race fit, Relaxed fit"
            >
              <Input
                value={data.fitNotes || ""}
                onChange={(e) => updateField("fitNotes", e.target.value)}
                placeholder="Any sizing notes?"
                className="rounded-md"
              />
            </FormField>
          </div>
        </div>

        <InfoBox>
          <p>
            <strong>Size guide:</strong> Cycling apparel sizing can vary by brand. If you
            know the item runs large or small, mention it in the fit notes to help buyers.
          </p>
        </InfoBox>
      </div>

      {/* Section 3: Details */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Product Details"
          description="Colours, materials, and features"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            label="Colour(s)"
            hint="Main colour or colour combination"
          >
            <Input
              value={data.colorPrimary || ""}
              onChange={(e) => updateField("colorPrimary", e.target.value)}
              placeholder="e.g., Black/Red, Fluorescent Yellow"
              className="rounded-md"
            />
          </FormField>

          <FormField
            label="Material (Optional)"
            hint="e.g., Merino wool, Gore-Tex, Lycra"
          >
            <Input
              value={data.apparelMaterial || ""}
              onChange={(e) => updateField("apparelMaterial", e.target.value)}
              placeholder="Enter material"
              className="rounded-md"
            />
          </FormField>
        </div>

        <FormField
          label="Features (Optional)"
          hint="Notable features that add value"
          error={getFieldError(errors, "features")}
        >
          <Textarea
            value={data.features || ""}
            onChange={(e) => updateField("features", e.target.value)}
            placeholder="e.g., Waterproof, reflective panels, 3 rear pockets, full-length zipper, MIPS technology"
            className="rounded-md min-h-[100px]"
            maxLength={500}
          />
        </FormField>

        <InfoBox>
          <p>
            <strong>💡 Tip:</strong> Mention technical features like waterproofing, wind
            resistance, reflective elements, or safety certifications (for helmets). These
            details help justify your asking price.
          </p>
        </InfoBox>
      </div>
    </div>
  );
}

