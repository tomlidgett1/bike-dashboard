"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Edit, AlertCircle } from "lucide-react";
import { ListingFormData } from "@/lib/types/listing";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ============================================================
// Step 7: Review & Publish
// ============================================================

interface Step7ReviewProps {
  data: ListingFormData;
  onEdit: (step: number) => void;
  onPublish: () => void;
  onSaveDraft: () => void;
  isPublishing?: boolean;
}

export function Step7Review({
  data,
  onEdit,
  onPublish,
  onSaveDraft,
  isPublishing = false,
}: Step7ReviewProps) {
  const [agreedToTerms, setAgreedToTerms] = React.useState(false);

  const getItemTypeLabel = () => {
    if (data.itemType === "bike") return "Bike";
    if (data.itemType === "part") return "Part/Component";
    if (data.itemType === "apparel") return "Apparel/Accessory";
    return "";
  };

  const getTitle = () => {
    if (data.itemType === "bike") {
      return [data.modelYear, data.brand, data.model, data.bikeType].filter(Boolean).join(" ");
    } else {
      return [data.brand, data.model].filter(Boolean).join(" ");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Review Your Listing</h2>
        <p className="text-gray-600">
          Check everything looks good before publishing
        </p>
      </div>

      {/* Preview Card */}
      <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
        {/* Images Preview */}
        {data.images && data.images.length > 0 && (
          <div className="relative aspect-video bg-gray-100">
            <img
              src={data.primaryImageUrl || data.images[0]?.url}
              alt="Primary"
              className="w-full h-full object-cover"
            />
            <div className="absolute top-4 left-4 px-3 py-1 bg-white/90 backdrop-blur-sm rounded-md text-sm font-medium">
              {data.images.length} photo{data.images.length !== 1 ? "s" : ""}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Title & Price */}
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">{getTitle()}</h3>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900">
                ${data.price?.toLocaleString("en-AU")}
              </span>
              {data.isNegotiable && (
                <span className="text-sm text-gray-600">(negotiable)</span>
              )}
            </div>
          </div>

          {/* Key Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <DetailItem label="Type" value={getItemTypeLabel()} />
            <DetailItem label="Condition" value={data.conditionRating} />
            <DetailItem label="Location" value={data.pickupLocation} />

            {data.itemType === "bike" && (
              <>
                <DetailItem label="Frame Size" value={data.frameSize} />
                <DetailItem label="Material" value={data.frameMaterial} />
                <DetailItem label="Year" value={data.modelYear} />
              </>
            )}

            {data.itemType === "part" && (
              <>
                <DetailItem label="Category" value={data.marketplace_subcategory} />
              </>
            )}

            {data.itemType === "apparel" && (
              <>
                <DetailItem label="Size" value={data.size} />
                <DetailItem label="Fit" value={data.genderFit} />
              </>
            )}
          </div>

          {/* Condition Details */}
          {data.conditionDetails && (
            <div className="space-y-2">
              <h4 className="font-semibold text-gray-900">Condition</h4>
              <p className="text-gray-700 text-sm leading-relaxed">{data.conditionDetails}</p>
            </div>
          )}
        </div>
      </div>

      {/* Editable Sections */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Listing Details</h3>

        <ReviewSection
          title="Item Details"
          step={data.itemType === "bike" ? 2 : data.itemType === "part" ? 2 : 2}
          onEdit={onEdit}
          items={[
            { label: "Brand", value: data.brand },
            { label: "Model", value: data.model },
            ...(data.itemType === "bike" ? [
              { label: "Frame Size", value: data.frameSize },
              { label: "Groupset", value: data.groupset },
            ] : []),
            ...(data.itemType === "apparel" ? [
              { label: "Size", value: data.size },
            ] : []),
          ]}
        />

        <ReviewSection
          title="Condition"
          step={3}
          onEdit={onEdit}
          items={[
            { label: "Rating", value: data.conditionRating },
            { label: "Usage", value: data.usageEstimate },
          ]}
        />

        <ReviewSection
          title="Photos"
          step={4}
          onEdit={onEdit}
          items={[{ label: "Images", value: `${data.images?.length || 0} photos` }]}
        />

        <ReviewSection
          title="History"
          step={5}
          onEdit={onEdit}
          items={[
            { label: "Purchased From", value: data.purchaseLocation || "Not specified" },
            {
              label: "Service Records",
              value: `${data.serviceHistory?.length || 0} record(s)`,
            },
          ]}
        />

        <ReviewSection
          title="Pricing & Delivery"
          step={6}
          onEdit={onEdit}
          items={[
            { label: "Price", value: `$${data.price?.toLocaleString("en-AU")}` },
            { label: "Pickup", value: data.pickupLocation },
            { label: "Shipping", value: data.shippingAvailable ? "Available" : "Not available" },
          ]}
        />
      </div>

      {/* Terms & Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <div className="flex items-start space-x-3">
          <Checkbox
            id="terms"
            checked={agreedToTerms}
            onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
          />
          <Label htmlFor="terms" className="text-sm text-gray-700 cursor-pointer leading-relaxed">
            I confirm that this item is accurately described, I am the legal owner of this item,
            and I agree to the marketplace terms and conditions. I understand that misleading
            listings may be removed.
          </Label>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <Button
            onClick={onSaveDraft}
            variant="outline"
            className="flex-1 rounded-md"
            disabled={isPublishing}
          >
            Save as Draft
          </Button>

          <Button
            onClick={onPublish}
            disabled={!agreedToTerms || isPublishing}
            className="flex-1 rounded-md bg-gray-900 hover:bg-gray-800 text-white"
          >
            {isPublishing ? (
              <>
                <motion.div
                  className="h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
                Publishing...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Publish Listing
              </>
            )}
          </Button>
        </div>

        {!agreedToTerms && (
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-md p-3">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <p>Please agree to the terms before publishing</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Review Section Component
// ============================================================

interface ReviewSectionProps {
  title: string;
  step: number;
  onEdit: (step: number) => void;
  items: Array<{ label: string; value?: string }>;
}

function ReviewSection({ title, step, onEdit, items }: ReviewSectionProps) {
  return (
    <Card className="rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-gray-900">{title}</h4>
        <button
          type="button"
          onClick={() => onEdit(step)}
          className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
        >
          <Edit className="h-3 w-3" />
          Edit
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex justify-between text-sm">
            <span className="text-gray-600">{item.label}:</span>
            <span className="text-gray-900 font-medium">{item.value || "—"}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ============================================================
// Detail Item Component
// ============================================================

interface DetailItemProps {
  label: string;
  value?: string;
}

function DetailItem({ label, value }: DetailItemProps) {
  if (!value) return null;

  return (
    <div>
      <p className="text-xs text-gray-600 mb-1">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

