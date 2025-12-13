"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Camera, X, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WizardFormData } from "./order-help-wizard";

// ============================================================
// Types
// ============================================================

interface HelpStepDetailsProps {
  category: string;
  formData: WizardFormData;
  onUpdate: (updates: Partial<WizardFormData>) => void;
}

interface Subcategory {
  value: string;
  label: string;
}

// ============================================================
// Subcategory Data
// ============================================================

const SUBCATEGORIES: Record<string, Subcategory[]> = {
  item_not_received: [
    { value: "never_shipped", label: "Seller hasn't shipped yet" },
    { value: "tracking_stuck", label: "Tracking hasn't updated" },
    { value: "marked_delivered", label: "Shows delivered but didn't receive" },
    { value: "lost_in_transit", label: "Appears lost in transit" },
  ],
  item_not_as_described: [
    { value: "wrong_condition", label: "Condition is worse than described" },
    { value: "wrong_size", label: "Size is different" },
    { value: "missing_parts", label: "Missing parts or accessories" },
    { value: "different_model", label: "Different model/version" },
    { value: "wrong_colour", label: "Colour is different" },
    { value: "functionality", label: "Doesn't work as described" },
  ],
  damaged: [
    { value: "shipping_damage", label: "Damaged during shipping" },
    { value: "already_damaged", label: "Was already damaged" },
    { value: "packaging_issue", label: "Poor packaging caused damage" },
  ],
  wrong_item: [
    { value: "completely_different", label: "Completely different item" },
    { value: "wrong_variant", label: "Wrong size/colour/variant" },
    { value: "empty_package", label: "Package was empty" },
  ],
  refund_request: [
    { value: "changed_mind", label: "Changed my mind" },
    { value: "found_cheaper", label: "Found it cheaper elsewhere" },
    { value: "no_longer_needed", label: "No longer need it" },
    { value: "other", label: "Other reason" },
  ],
  shipping_issue: [
    { value: "no_tracking", label: "No tracking information" },
    { value: "delayed", label: "Significantly delayed" },
    { value: "wrong_address", label: "Sent to wrong address" },
  ],
  general_question: [],
};

const RESOLUTION_OPTIONS: { value: string; label: string }[] = [
  { value: "full_refund", label: "Full refund" },
  { value: "partial_refund", label: "Partial refund" },
  { value: "replacement", label: "Replacement item" },
  { value: "speak_to_seller", label: "Just want to speak to seller" },
  { value: "other", label: "Other" },
];

// ============================================================
// Component
// ============================================================

export function HelpStepDetails({
  category,
  formData,
  onUpdate,
}: HelpStepDetailsProps) {
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const subcategories = SUBCATEGORIES[category] || [];
  const showSubcategory = subcategories.length > 0;
  const showPhotoUpload = ["damaged", "wrong_item", "item_not_as_described"].includes(category);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    try {
      // Upload each file to Cloudinary
      for (const file of Array.from(files)) {
        const formDataUpload = new FormData();
        formDataUpload.append("file", file);
        formDataUpload.append("type", "support-evidence");

        const response = await fetch("/api/cloudinary/upload", {
          method: "POST",
          body: formDataUpload,
        });

        if (response.ok) {
          const data = await response.json();
          onUpdate({
            attachments: [
              ...formData.attachments,
              {
                url: data.url,
                fileName: file.name,
                fileType: file.type,
              },
            ],
          });
        }
      }
    } catch (error) {
      console.error("Failed to upload files:", error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveAttachment = (index: number) => {
    const newAttachments = formData.attachments.filter((_, i) => i !== index);
    onUpdate({ attachments: newAttachments });
  };

  const getCategoryLabel = (cat: string): string => {
    const labels: Record<string, string> = {
      item_not_received: "Item Not Received",
      item_not_as_described: "Not as Described",
      damaged: "Damaged Item",
      wrong_item: "Wrong Item",
      refund_request: "Refund Request",
      shipping_issue: "Shipping Issue",
      general_question: "General Question",
    };
    return labels[cat] || cat;
  };

  return (
    <div className="space-y-5">
      {/* Selected Category Badge */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Issue type:</span>
        <Badge variant="secondary" className="rounded-md">
          {getCategoryLabel(category)}
        </Badge>
      </div>

      {/* Subcategory */}
      {showSubcategory && (
        <div className="space-y-2">
          <Label htmlFor="subcategory">More specifically...</Label>
          <Select
            value={formData.subcategory}
            onValueChange={(value) => onUpdate({ subcategory: value })}
          >
            <SelectTrigger className="rounded-md">
              <SelectValue placeholder="Select what best describes your issue" />
            </SelectTrigger>
            <SelectContent>
              {subcategories.map((sub) => (
                <SelectItem key={sub.value} value={sub.value}>
                  {sub.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">
          Describe your issue <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id="description"
          placeholder="Please provide as much detail as possible about the issue..."
          value={formData.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          rows={4}
          className="rounded-md resize-none"
        />
        <p className="text-xs text-gray-500">
          {formData.description.length}/500 characters (minimum 10)
        </p>
      </div>

      {/* Photo Upload */}
      {showPhotoUpload && (
        <div className="space-y-2">
          <Label>Photos (optional but recommended)</Label>
          <p className="text-xs text-gray-500 mb-2">
            Upload photos showing the issue to help us resolve your case faster
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <div className="grid grid-cols-4 gap-2">
            {formData.attachments.map((att, index) => (
              <div
                key={index}
                className="relative aspect-square rounded-md overflow-hidden bg-gray-100"
              >
                <img
                  src={att.url}
                  alt={att.fileName}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => handleRemoveAttachment(index)}
                  className="absolute top-1 right-1 p-1 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
                >
                  <X className="h-3 w-3 text-white" />
                </button>
              </div>
            ))}

            {formData.attachments.length < 4 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className={cn(
                  "aspect-square rounded-md border-2 border-dashed border-gray-300",
                  "flex flex-col items-center justify-center gap-1",
                  "bg-white hover:bg-gray-50 transition-colors",
                  "text-gray-400 hover:text-gray-500",
                  isUploading && "opacity-50 cursor-not-allowed"
                )}
              >
                {isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Camera className="h-5 w-5" />
                    <span className="text-[10px]">Add Photo</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Requested Resolution */}
      <div className="space-y-2">
        <Label htmlFor="resolution">What would you like to happen?</Label>
        <Select
          value={formData.requestedResolution}
          onValueChange={(value) => onUpdate({ requestedResolution: value })}
        >
          <SelectTrigger className="rounded-md">
            <SelectValue placeholder="Select your preferred resolution" />
          </SelectTrigger>
          <SelectContent>
            {RESOLUTION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

