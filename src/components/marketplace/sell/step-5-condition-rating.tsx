"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { 
  ConditionFormData, 
  CONDITION_RATINGS,
  ConditionRating 
} from "@/lib/types/listing";
import { SectionHeader } from "./form-elements";
import { Textarea } from "@/components/ui/textarea";
import { ValidationError, getFieldError } from "@/lib/validation/listing-validation";
import { cn } from "@/lib/utils";
import { Sparkles, Star, Heart, ThumbsUp, Wrench, AlertTriangle } from "lucide-react";
import { FormField } from "./form-elements";

// ============================================================
// Step 5: Condition Rating
// ============================================================

interface Step5ConditionRatingProps {
  data: ConditionFormData;
  onChange: (data: ConditionFormData) => void;
  errors?: ValidationError[];
}

export function Step5ConditionRating({ data, onChange, errors = [] }: Step5ConditionRatingProps) {
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
        <h2 className="text-2xl font-bold text-gray-900">Overall Condition</h2>
        <p className="text-gray-600">
          Select the rating that best describes the item's condition
        </p>
      </div>

      {/* Condition Rating Selection */}
      <div className="space-y-4">
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
          title="Describe the Condition"
          description="Give buyers a detailed overview of what they'll receive"
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
      </div>
    </div>
  );
}






