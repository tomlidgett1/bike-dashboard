"use client";

import * as React from "react";
import { PricingFormData, REASONS_FOR_SELLING } from "@/lib/types/listing";
import { FormField, SectionHeader, InfoBox, PriceInput } from "./form-elements";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ValidationError, getFieldError } from "@/lib/validation/listing-validation";

// ============================================================
// Step 10: Pricing
// ============================================================

interface Step10PricingProps {
  data: PricingFormData;
  onChange: (data: PricingFormData) => void;
  errors?: ValidationError[];
}

export function Step10Pricing({ data, onChange, errors = [] }: Step10PricingProps) {
  const [otherReason, setOtherReason] = React.useState("");

  const updateField = <K extends keyof PricingFormData>(
    field: K,
    value: PricingFormData[K]
  ) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Set Your Price</h2>
        <p className="text-gray-600">
          What's your asking price?
        </p>
      </div>

      {/* Pricing */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <div className="grid grid-cols-1 gap-6">
          <FormField
            label="List Price"
            required
            error={getFieldError(errors, "price")}
            hint="Your asking price in AUD"
          >
            <PriceInput
              value={data.price}
              onChange={(value) => updateField("price", value)}
              placeholder="0.00"
            />
          </FormField>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="negotiable"
              checked={data.isNegotiable || false}
              onCheckedChange={(checked) => updateField("isNegotiable", checked as boolean)}
            />
            <Label
              htmlFor="negotiable"
              className="text-sm font-medium text-gray-900 cursor-pointer"
            >
              Price is negotiable
            </Label>
          </div>
        </div>

        <InfoBox>
          <p>
            <strong>💡 Pricing tip:</strong> Research similar items to set a competitive
            price. Consider the condition, age, and any upgrades when pricing. Listings with
            fair prices sell faster!
          </p>
        </InfoBox>
      </div>

      {/* Reason for Selling */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Reason for Selling (Optional)"
          description="Why are you selling? Builds trust with buyers"
        />

        <FormField label="Reason">
          <Select
            value={
              REASONS_FOR_SELLING.includes(data.reasonForSelling as any)
                ? data.reasonForSelling
                : "Other"
            }
            onValueChange={(value) => {
              if (value === "Other") {
                updateField("reasonForSelling", otherReason);
              } else {
                updateField("reasonForSelling", value);
                setOtherReason("");
              }
            }}
          >
            <SelectTrigger className="rounded-md">
              <SelectValue placeholder="Select reason" />
            </SelectTrigger>
            <SelectContent>
              {REASONS_FOR_SELLING.map((reason) => (
                <SelectItem key={reason} value={reason}>
                  {reason}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {(!REASONS_FOR_SELLING.includes(data.reasonForSelling as any) ||
          data.reasonForSelling === "Other") && (
          <FormField label="Please specify">
            <Input
              value={otherReason || data.reasonForSelling || ""}
              onChange={(e) => {
                setOtherReason(e.target.value);
                updateField("reasonForSelling", e.target.value);
              }}
              placeholder="Tell buyers why you're selling"
              className="rounded-md"
            />
          </FormField>
        )}
      </div>
    </div>
  );
}











