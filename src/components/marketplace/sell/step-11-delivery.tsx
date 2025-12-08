"use client";

import * as React from "react";
import { MapPin } from "lucide-react";
import { PricingFormData } from "@/lib/types/listing";
import { FormField, SectionHeader, InfoBox, PriceInput } from "./form-elements";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ValidationError, getFieldError } from "@/lib/validation/listing-validation";

// ============================================================
// Step 11: Delivery Options
// ============================================================

interface Step11DeliveryProps {
  data: PricingFormData;
  onChange: (data: PricingFormData) => void;
  errors?: ValidationError[];
}

export function Step11Delivery({ data, onChange, errors = [] }: Step11DeliveryProps) {
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
        <h2 className="text-2xl font-bold text-gray-900">Delivery Options</h2>
        <p className="text-gray-600">
          How can buyers collect or receive the item?
        </p>
      </div>

      {/* Delivery Options */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Pickup & Shipping"
          description="Set your delivery options"
        />

        <FormField
          label="Pickup Location"
          required
          error={getFieldError(errors, "pickupLocation")}
          hint="Suburb or area (don't include your full address)"
        >
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={data.pickupLocation || ""}
              onChange={(e) => updateField("pickupLocation", e.target.value)}
              placeholder="e.g., Sydney CBD, Melbourne East"
              className="rounded-md pl-10"
            />
          </div>
        </FormField>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="shipping"
              checked={data.shippingAvailable || false}
              onCheckedChange={(checked) =>
                updateField("shippingAvailable", checked as boolean)
              }
            />
            <Label
              htmlFor="shipping"
              className="text-sm font-medium text-gray-900 cursor-pointer"
            >
              Shipping available
            </Label>
          </div>

          {data.shippingAvailable && (
            <div className="ml-6 space-y-4 bg-gray-50 rounded-md p-4">
              <FormField
                label="Shipping Cost (Optional)"
                hint="Flat rate or leave blank for 'buyer pays shipping'"
                error={getFieldError(errors, "shippingCost")}
              >
                <PriceInput
                  value={data.shippingCost}
                  onChange={(value) => updateField("shippingCost", value)}
                  placeholder="0.00"
                />
              </FormField>

              <FormField
                label="Shipping Restrictions (Optional)"
                hint="e.g., Metro areas only, Australia-wide, NSW only"
              >
                <Input
                  value={data.shippingRestrictions || ""}
                  onChange={(e) => updateField("shippingRestrictions", e.target.value)}
                  placeholder="Enter shipping restrictions"
                  className="rounded-md"
                />
              </FormField>
            </div>
          )}
        </div>

        <InfoBox>
          <p>
            <strong>Shipping note:</strong> For bikes, shipping can be expensive ($100-200+).
            Consider if you're willing to pack and ship, or prefer local pickup only.
          </p>
        </InfoBox>
      </div>

      {/* Included Items */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="What's Included"
          description="List everything included in the sale"
        />

        <FormField
          label="Included Accessories (Optional)"
          hint="Be specific about what's included"
          error={getFieldError(errors, "includedAccessories")}
        >
          <Textarea
            value={data.includedAccessories || ""}
            onChange={(e) => updateField("includedAccessories", e.target.value)}
            placeholder="e.g., Includes pedals, bottle cages, spare tube, bike computer mount, original manual and box"
            className="rounded-md min-h-[100px]"
            maxLength={500}
          />
        </FormField>
      </div>
    </div>
  );
}





