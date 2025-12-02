"use client";

import * as React from "react";
import { HistoryFormData } from "@/lib/types/listing";
import { FormField, SectionHeader, PriceInput } from "./form-elements";
import { Input } from "@/components/ui/input";
import { ValidationError, getFieldError } from "@/lib/validation/listing-validation";

// ============================================================
// Step 8: Purchase History
// ============================================================

interface Step8PurchaseHistoryProps {
  data: HistoryFormData;
  onChange: (data: HistoryFormData) => void;
  errors?: ValidationError[];
}

export function Step8PurchaseHistory({ data, onChange, errors = [] }: Step8PurchaseHistoryProps) {
  const updateField = <K extends keyof HistoryFormData>(
    field: K,
    value: HistoryFormData[K]
  ) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Purchase Information</h2>
        <p className="text-gray-600">
          Where and when did you get this item?
        </p>
      </div>

      {/* Purchase Information */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            label="Purchased From (Optional)"
            hint="Store name, website, or 'Private sale'"
          >
            <Input
              value={data.purchaseLocation || ""}
              onChange={(e) => updateField("purchaseLocation", e.target.value)}
              placeholder="e.g., Local bike shop, BikeExchange"
              className="rounded-md"
            />
          </FormField>

          <FormField
            label="Purchase Date (Optional)"
            hint="Helps establish age and value"
            error={getFieldError(errors, "purchaseDate")}
          >
            <Input
              type="date"
              value={data.purchaseDate || ""}
              onChange={(e) => updateField("purchaseDate", e.target.value)}
              className="rounded-md"
              max={new Date().toISOString().split("T")[0]}
            />
          </FormField>

          <div className="md:col-span-2">
            <FormField
              label="Original RRP (Optional)"
              hint="What did you pay new? Helps buyers understand the deal"
              error={getFieldError(errors, "originalRrp")}
            >
              <PriceInput
                value={data.originalRrp}
                onChange={(value) => updateField("originalRrp", value)}
                placeholder="0.00"
              />
            </FormField>
          </div>
        </div>
      </div>
    </div>
  );
}

