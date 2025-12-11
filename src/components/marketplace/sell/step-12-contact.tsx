"use client";

import * as React from "react";
import { PricingFormData, ContactPreference } from "@/lib/types/listing";
import { FormField, SectionHeader, InfoBox } from "./form-elements";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ValidationError, getFieldError } from "@/lib/validation/listing-validation";

// ============================================================
// Step 12: Contact Preferences
// ============================================================

interface Step12ContactProps {
  data: PricingFormData;
  onChange: (data: PricingFormData) => void;
  errors?: ValidationError[];
}

export function Step12Contact({ data, onChange, errors = [] }: Step12ContactProps) {
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
        <h2 className="text-2xl font-bold text-gray-900">Contact Preferences</h2>
        <p className="text-gray-600">
          How should interested buyers reach you?
        </p>
      </div>

      {/* Contact Preferences */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <FormField
          label="Preferred Contact Method"
          hint="Choose how you'd like to be contacted"
        >
          <Select
            value={data.sellerContactPreference || "message"}
            onValueChange={(value: ContactPreference) =>
              updateField("sellerContactPreference", value)
            }
          >
            <SelectTrigger className="rounded-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="message">In-app messaging (recommended)</SelectItem>
              <SelectItem value="phone">Phone</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        {data.sellerContactPreference === "phone" && (
          <FormField
            label="Phone Number"
            required
            error={getFieldError(errors, "sellerPhone")}
            hint="Will be visible to interested buyers"
          >
            <Input
              type="tel"
              value={data.sellerPhone || ""}
              onChange={(e) => updateField("sellerPhone", e.target.value)}
              placeholder="04XX XXX XXX"
              className="rounded-md"
            />
          </FormField>
        )}

        {data.sellerContactPreference === "email" && (
          <FormField
            label="Email Address"
            required
            error={getFieldError(errors, "sellerEmail")}
            hint="Will be visible to interested buyers"
          >
            <Input
              type="email"
              value={data.sellerEmail || ""}
              onChange={(e) => updateField("sellerEmail", e.target.value)}
              placeholder="your@email.com"
              className="rounded-md"
            />
          </FormField>
        )}

        <InfoBox>
          <p>
            <strong>Privacy note:</strong> In-app messaging keeps your contact details private
            until you choose to share them. Phone and email will be visible in your listing.
          </p>
        </InfoBox>
      </div>
    </div>
  );
}







