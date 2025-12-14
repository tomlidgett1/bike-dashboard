"use client";

import * as React from "react";
import { MapPin, Truck, DollarSign } from "lucide-react";
import { PricingFormData, ContactPreference } from "@/lib/types/listing";
import { FormField, SectionHeader, InfoBox, PriceInput } from "./form-elements";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ValidationError, getFieldError } from "@/lib/validation/listing-validation";

// ============================================================
// Step 6: Pricing & Delivery
// ============================================================

interface Step6PricingProps {
  data: PricingFormData;
  onChange: (data: PricingFormData) => void;
  errors?: ValidationError[];
}

export function Step6Pricing({ data, onChange, errors = [] }: Step6PricingProps) {
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
        <h2 className="text-2xl font-bold text-gray-900">Pricing & Delivery</h2>
        <p className="text-gray-600">
          Set your price and let buyers know how they can get the item
        </p>
      </div>

      {/* Pricing */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Pricing"
          description="What's your asking price?"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

          <div className="flex items-center space-x-2 mt-8">
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

      {/* Delivery Options */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Delivery Options"
          description="How can buyers collect or receive the item?"
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
            Consider if you're willing to pack and ship, or prefer local pickup only. Many
            buyers prefer to inspect bikes in person.
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

        <InfoBox>
          <p>
            <strong>Example:</strong> For bikes, mention if pedals are included (many sellers
            remove them). For parts, mention if mounting hardware is included.
          </p>
        </InfoBox>
      </div>

      {/* Contact Preferences */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <SectionHeader
          title="Contact Preferences"
          description="How should interested buyers reach you?"
        />

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










