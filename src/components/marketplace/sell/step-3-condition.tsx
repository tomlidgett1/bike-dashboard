"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { 
  ConditionFormData, 
  CONDITION_RATINGS, 
  USAGE_ESTIMATES, 
  RIDING_STYLES,
  ConditionRating 
} from "@/lib/types/listing";
import { FormField, SectionHeader, InfoBox } from "./form-elements";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ValidationError, getFieldError } from "@/lib/validation/listing-validation";
import { cn } from "@/lib/utils";
import { Sparkles, Star, Heart, ThumbsUp, Wrench, AlertTriangle } from "lucide-react";

// ============================================================
// Step 3: Condition Assessment
// ============================================================

interface Step3ConditionProps {
  data: ConditionFormData;
  onChange: (data: ConditionFormData) => void;
  errors?: ValidationError[];
}

export function Step3Condition({ data, onChange, errors = [] }: Step3ConditionProps) {
  const [noIssues, setNoIssues] = React.useState(false);

  const updateField = <K extends keyof ConditionFormData>(
    field: K,
    value: ConditionFormData[K]
  ) => {
    onChange({ ...data, [field]: value });
  };

  const conditionIcons = {
    "New": Sparkles,
    "Like New": Star,
    "Excellent": Heart,
    "Good": ThumbsUp,
    "Fair": Wrench,
    "Well Used": AlertTriangle,
  };

  const conditionDescriptions = {
    "New": "Brand new with tags, never used or ridden",
    "Like New": "Minimal use, no visible wear, like-new condition",
    "Excellent": "Lightly used, well maintained, minor wear only",
    "Good": "Moderate use, normal wear, fully functional",
    "Fair": "Heavily used, visible wear but fully functional",
    "Well Used": "Significant wear, may need service or repairs",
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Condition Assessment</h2>
        <p className="text-gray-600">
          Be honest about the condition - it builds trust with buyers
        </p>
      </div>

      {/* Condition Rating Selection */}
      <div className="space-y-4">
        <SectionHeader
          title="Overall Condition"
          description="Select the rating that best describes the item's condition"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CONDITION_RATINGS.map((rating) => {
            const Icon = conditionIcons[rating];
            const isSelected = data.conditionRating === rating;

            return (
              <motion.button
                key={rating}
                type="button"
                onClick={() => updateField("conditionRating", rating)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "p-4 rounded-md border-2 transition-all text-left",
                  isSelected
                    ? "border-gray-900 bg-gray-50 shadow-md"
                    : "border-gray-200 bg-white hover:border-gray-300"
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                      isSelected ? "bg-gray-900" : "bg-gray-100"
                    )}
                  >
                    <Icon
                      className={cn("h-5 w-5", isSelected ? "text-white" : "text-gray-600")}
                    />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-semibold text-gray-900">{rating}</h4>
                    <p className="text-xs text-gray-600">{conditionDescriptions[rating]}</p>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        {getFieldError(errors, "conditionRating") && (
          <p className="text-sm text-red-600">{getFieldError(errors, "conditionRating")}</p>
        )}
      </div>

      {/* Condition Details */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Condition Details"
          description="Describe the current condition in detail"
        />

        <FormField
          label="Visual Condition Description"
          required
          error={getFieldError(errors, "conditionDetails")}
          hint="Describe what buyers will see - be specific and honest"
        >
          <Textarea
            value={data.conditionDetails || ""}
            onChange={(e) => updateField("conditionDetails", e.target.value)}
            placeholder="e.g., The bike is in excellent condition with no major scratches or dents. The paint has minor scuffing on the top tube from cable rub. All components function perfectly and shift smoothly. Recently serviced with new chain and brake pads."
            className="rounded-md min-h-[150px]"
            maxLength={2000}
          />
        </FormField>

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
            upfront prevents surprises and shows you're an honest seller. Buyers appreciate
            detailed descriptions!
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

        <InfoBox>
          <p>
            <strong>Example:</strong> A bike with 500km used for casual weekend rides will
            have less wear than one with 500km of daily commuting. Context helps buyers
            assess true condition.
          </p>
        </InfoBox>
      </div>
    </div>
  );
}





