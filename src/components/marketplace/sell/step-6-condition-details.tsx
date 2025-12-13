"use client";

import * as React from "react";
import { 
  ConditionFormData, 
  USAGE_ESTIMATES, 
  RIDING_STYLES
} from "@/lib/types/listing";
import { FormField, SectionHeader, InfoBox } from "./form-elements";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ValidationError, getFieldError } from "@/lib/validation/listing-validation";

// ============================================================
// Step 6: Condition Details
// ============================================================

interface Step6ConditionDetailsProps {
  data: ConditionFormData;
  onChange: (data: ConditionFormData) => void;
  errors?: ValidationError[];
}

export function Step6ConditionDetails({ data, onChange, errors = [] }: Step6ConditionDetailsProps) {
  const [noIssues, setNoIssues] = React.useState(false);

  const updateField = <K extends keyof ConditionFormData>(
    field: K,
    value: ConditionFormData[K]
  ) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Additional Condition Details</h2>
        <p className="text-gray-600">
          Help buyers understand the item's history and any imperfections
        </p>
      </div>

      {/* Wear & Issues */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Wear & Damage Notes"
          description="Be transparent about any issues"
        />

        <div className="flex items-center space-x-2">
          <Checkbox
            id="no-issues"
            checked={noIssues}
            onCheckedChange={(checked) => {
              setNoIssues(checked as boolean);
              if (checked) {
                updateField("wearNotes", "No functional issues");
              } else {
                updateField("wearNotes", "");
              }
            }}
          />
          <Label
            htmlFor="no-issues"
            className="text-sm font-medium text-gray-900 cursor-pointer"
          >
            No functional or cosmetic issues
          </Label>
        </div>

        {!noIssues && (
          <FormField
            label="Wear Notes & Damage (Optional)"
            hint="List any scratches, chips, wear areas, or damage"
            error={getFieldError(errors, "wearNotes")}
          >
            <Textarea
              value={data.wearNotes || ""}
              onChange={(e) => updateField("wearNotes", e.target.value)}
              placeholder="e.g., Small paint chip on downtube (5mm), bar tape showing wear, minor scratches on crank arms from pedal strikes"
              className="rounded-md min-h-[100px]"
              maxLength={1000}
            />
          </FormField>
        )}

        <InfoBox>
          <p>
            <strong>💡 Tip:</strong> Transparency builds trust. Mentioning minor issues
            upfront prevents surprises and shows you're an honest seller.
          </p>
        </InfoBox>
      </div>

      {/* Usage History */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Usage History"
          description="Help buyers understand how much the item has been used"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            label="Approximate Usage"
            hint="How much has it been used?"
          >
            <Select
              value={data.usageEstimate}
              onValueChange={(value) => updateField("usageEstimate", value)}
            >
              <SelectTrigger className="rounded-md">
                <SelectValue placeholder="Select usage" />
              </SelectTrigger>
              <SelectContent>
                {USAGE_ESTIMATES.map((estimate) => (
                  <SelectItem key={estimate} value={estimate}>
                    {estimate}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            label="Riding Style (Optional)"
            hint="How was it primarily used?"
          >
            <Select
              value={data.ridingStyle}
              onValueChange={(value) => updateField("ridingStyle", value)}
            >
              <SelectTrigger className="rounded-md">
                <SelectValue placeholder="Select riding style" />
              </SelectTrigger>
              <SelectContent>
                {RIDING_STYLES.map((style) => (
                  <SelectItem key={style} value={style}>
                    {style}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
      </div>
    </div>
  );
}








