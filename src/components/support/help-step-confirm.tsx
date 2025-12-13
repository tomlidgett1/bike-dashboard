"use client";

import * as React from "react";
import Image from "next/image";
import { Package, AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WizardFormData, OrderHelpWizardProps } from "./order-help-wizard";

// ============================================================
// Types
// ============================================================

interface HelpStepConfirmProps {
  purchase: OrderHelpWizardProps["purchase"];
  formData: WizardFormData;
  error: string | null;
}

// ============================================================
// Helper Functions
// ============================================================

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    item_not_received: "Item Not Received",
    item_not_as_described: "Not as Described",
    damaged: "Damaged Item",
    wrong_item: "Wrong Item",
    refund_request: "Refund Request",
    shipping_issue: "Shipping Issue",
    general_question: "General Question",
  };
  return labels[category] || category;
}

function getResolutionLabel(resolution: string): string {
  const labels: Record<string, string> = {
    full_refund: "Full refund",
    partial_refund: "Partial refund",
    replacement: "Replacement item",
    speak_to_seller: "Speak to seller",
    other: "Other",
  };
  return labels[resolution] || resolution;
}

function getProductImage(product: OrderHelpWizardProps["purchase"]["product"]): string | null {
  if (product.cached_image_url) return product.cached_image_url;
  if (product.primary_image_url) return product.primary_image_url;
  return null;
}

function getProductName(product: OrderHelpWizardProps["purchase"]["product"]): string {
  return product.display_name || product.description || "Product";
}

// ============================================================
// Component
// ============================================================

export function HelpStepConfirm({
  purchase,
  formData,
  error,
}: HelpStepConfirmProps) {
  const productImage = getProductImage(purchase.product);
  const productName = getProductName(purchase.product);

  return (
    <div className="space-y-4">
      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 rounded-md border border-red-200">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Summary Header */}
      <div className="flex items-center gap-3 p-4 bg-green-50 rounded-md border border-green-200">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        </div>
        <div>
          <p className="font-medium text-green-900">Ready to submit</p>
          <p className="text-sm text-green-700">
            Review your request below before submitting
          </p>
        </div>
      </div>

      {/* Order Summary */}
      <div className="bg-white rounded-md border border-gray-200 p-4">
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
          Order
        </h4>
        <div className="flex gap-3">
          <div className="relative h-14 w-14 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
            {productImage ? (
              <Image
                src={productImage}
                alt={productName}
                fill
                className="object-cover"
                sizes="56px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Package className="h-6 w-6 text-gray-400" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 line-clamp-1">{productName}</p>
            <p className="text-sm text-gray-500">#{purchase.order_number}</p>
          </div>
        </div>
      </div>

      {/* Issue Details */}
      <div className="bg-white rounded-md border border-gray-200 p-4 space-y-3">
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Issue Details
        </h4>

        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">Category</span>
          <Badge variant="secondary" className="rounded-md">
            {getCategoryLabel(formData.category)}
          </Badge>
        </div>

        {formData.subcategory && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Type</span>
            <span className="text-sm font-medium text-gray-900">
              {formData.subcategory.replace(/_/g, " ")}
            </span>
          </div>
        )}

        {formData.requestedResolution && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Requested Resolution</span>
            <span className="text-sm font-medium text-gray-900">
              {getResolutionLabel(formData.requestedResolution)}
            </span>
          </div>
        )}

        {formData.attachments.length > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Photos</span>
            <span className="text-sm font-medium text-gray-900">
              {formData.attachments.length} attached
            </span>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="bg-white rounded-md border border-gray-200 p-4">
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Your Message
        </h4>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">
          {formData.description}
        </p>
      </div>

      {/* Attached Photos Preview */}
      {formData.attachments.length > 0 && (
        <div className="bg-white rounded-md border border-gray-200 p-4">
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            Attached Photos
          </h4>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {formData.attachments.map((att, index) => (
              <div
                key={index}
                className="relative h-16 w-16 rounded-md overflow-hidden bg-gray-100 flex-shrink-0"
              >
                <img
                  src={att.url}
                  alt={att.fileName}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What Happens Next */}
      <div className="bg-gray-50 rounded-md border border-gray-200 p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">What happens next?</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• We'll review your request within 24-48 hours</li>
          <li>• The seller will be notified and can respond</li>
          <li>• Your payment remains protected during this process</li>
          <li>• You'll receive updates via email and in-app notifications</li>
        </ul>
      </div>
    </div>
  );
}

