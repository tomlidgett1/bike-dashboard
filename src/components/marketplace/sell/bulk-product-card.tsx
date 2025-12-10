"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { AlertCircle, Trash2, DollarSign, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { CONDITION_RATINGS, type ConditionRating, type ItemType } from "@/lib/types/listing";

// ============================================================
// Bulk Product Card
// Single product editor with photo gallery and AI-detected fields
// ============================================================

interface BulkProductCardProps {
  groupId: string;
  imageUrls: string[];
  suggestedName: string;
  aiData: any;
  onChange: (data: any) => void;
  onDelete?: () => void;
}

export function BulkProductCard({
  groupId,
  imageUrls,
  suggestedName,
  aiData,
  onChange,
  onDelete,
}: BulkProductCardProps) {
  const [formData, setFormData] = React.useState({
    itemType: aiData?.item_type || 'bike',
    title: suggestedName || '',
    description: aiData?.condition_details || '',
    brand: aiData?.brand || '',
    model: aiData?.model || '',
    modelYear: aiData?.model_year || '',
    bikeType: aiData?.bike_type || '',
    frameSize: aiData?.frame_size || '',
    frameMaterial: aiData?.frame_material || '',
    groupset: aiData?.groupset || '',
    wheelSize: aiData?.wheel_size || '',
    suspensionType: aiData?.suspension_type || '',
    colorPrimary: aiData?.color_primary || '',
    partTypeDetail: aiData?.part_type || '',
    compatibilityNotes: aiData?.compatibility || '',
    size: aiData?.size || '',
    genderFit: aiData?.gender_fit || '',
    conditionRating: (aiData?.condition_rating || 'Good') as ConditionRating,
    conditionDetails: aiData?.condition_details || '',
    wearNotes: aiData?.wear_notes || '',
    usageEstimate: aiData?.usage_estimate || '',
    price: aiData?.price_min_aud || 0,
    originalRrp: aiData?.price_max_aud || 0,
  });

  const [primaryImageIndex, setPrimaryImageIndex] = React.useState(0);
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  // Update parent when form changes
  React.useEffect(() => {
    onChange(formData);
  }, [formData]);

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isLowConfidence = aiData?.overall_confidence < 70;
  const isBike = formData.itemType === 'bike';
  const isPart = formData.itemType === 'part';
  const isApparel = formData.itemType === 'apparel';

  return (
    <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
      {/* Photo Gallery */}
      <div className="relative aspect-[4/3] bg-gray-100">
        <Image
          src={imageUrls[primaryImageIndex]}
          alt="Product"
          fill
          className="object-contain"
          priority
        />
        
        {/* Confidence Warning */}
        {isLowConfidence && (
          <div className="absolute top-4 left-4 right-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-yellow-800">
                  Low AI confidence - Please review carefully
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Delete Button */}
        {onDelete && (
          <button
            onClick={onDelete}
            className="absolute top-4 right-4 p-2 bg-red-500 hover:bg-red-600 text-white rounded-md shadow-lg transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Thumbnail Strip */}
      {imageUrls.length > 1 && (
        <div className="flex gap-2 p-4 border-b border-gray-200 overflow-x-auto">
          {imageUrls.map((url, index) => (
            <button
              key={index}
              onClick={() => setPrimaryImageIndex(index)}
              className={cn(
                "relative flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-colors",
                index === primaryImageIndex
                  ? "border-gray-900"
                  : "border-gray-200 hover:border-gray-300"
              )}
            >
              <Image
                src={url}
                alt={`Photo ${index + 1}`}
                fill
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Form Fields */}
      <div className="p-6 space-y-6">
        {/* Basic Info */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Product Type
            </label>
            <Select
              value={formData.itemType}
              onValueChange={(value) => updateField('itemType', value)}
            >
              <SelectTrigger className="rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bike">Bike</SelectItem>
                <SelectItem value="part">Part/Component</SelectItem>
                <SelectItem value="apparel">Apparel</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Product Title
            </label>
            <Input
              value={formData.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="e.g., Trek Fuel EX 9.8 Mountain Bike"
              className="rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Description
            </label>
            <Textarea
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Describe your product..."
              className="rounded-md"
              rows={4}
            />
            {aiData?.overall_confidence && aiData.overall_confidence < 70 && (
              <p className="text-xs text-gray-500 mt-1">
                ⚠️ AI confidence: {aiData.overall_confidence}% - Please review carefully
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Brand
              </label>
              <Input
                value={formData.brand}
                onChange={(e) => updateField('brand', e.target.value)}
                placeholder="e.g., Trek, Specialized"
                className="rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Model
              </label>
              <Input
                value={formData.model}
                onChange={(e) => updateField('model', e.target.value)}
                placeholder="e.g., Fuel EX 9.8"
                className="rounded-md"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Model Year
            </label>
            <Input
              value={formData.modelYear}
              onChange={(e) => updateField('modelYear', e.target.value)}
              placeholder="e.g., 2023"
              className="rounded-md"
            />
          </div>
        </div>

        {/* Bike-Specific Fields */}
        {isBike && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Package className="h-4 w-4" />
              Bike Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Bike Type
                </label>
                <Input
                  value={formData.bikeType}
                  onChange={(e) => updateField('bikeType', e.target.value)}
                  placeholder="e.g., Mountain, Road"
                  className="rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Frame Size
                </label>
                <Input
                  value={formData.frameSize}
                  onChange={(e) => updateField('frameSize', e.target.value)}
                  placeholder="e.g., Medium, 54cm"
                  className="rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Frame Material
                </label>
                <Input
                  value={formData.frameMaterial}
                  onChange={(e) => updateField('frameMaterial', e.target.value)}
                  placeholder="e.g., Carbon, Aluminium"
                  className="rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Groupset
                </label>
                <Input
                  value={formData.groupset}
                  onChange={(e) => updateField('groupset', e.target.value)}
                  placeholder="e.g., Shimano XT"
                  className="rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Wheel Size
                </label>
                <Input
                  value={formData.wheelSize}
                  onChange={(e) => updateField('wheelSize', e.target.value)}
                  placeholder='e.g., 29", 700c'
                  className="rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Colour
                </label>
                <Input
                  value={formData.colorPrimary}
                  onChange={(e) => updateField('colorPrimary', e.target.value)}
                  placeholder="e.g., Red, Blue"
                  className="rounded-md"
                />
              </div>
            </div>
          </div>
        )}

        {/* Part-Specific Fields */}
        {isPart && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Part Details</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Part Type
              </label>
              <Input
                value={formData.partTypeDetail}
                onChange={(e) => updateField('partTypeDetail', e.target.value)}
                placeholder="e.g., Rear Derailleur, Crankset"
                className="rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Compatibility
              </label>
              <Textarea
                value={formData.compatibilityNotes}
                onChange={(e) => updateField('compatibilityNotes', e.target.value)}
                placeholder="e.g., Fits Shimano 11-speed systems"
                className="rounded-md"
                rows={2}
              />
            </div>
          </div>
        )}

        {/* Apparel-Specific Fields */}
        {isApparel && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Apparel Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Size
                </label>
                <Input
                  value={formData.size}
                  onChange={(e) => updateField('size', e.target.value)}
                  placeholder="e.g., Medium, Large"
                  className="rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Gender Fit
                </label>
                <Select
                  value={formData.genderFit}
                  onValueChange={(value) => updateField('genderFit', value)}
                >
                  <SelectTrigger className="rounded-md">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Men's">Men's</SelectItem>
                    <SelectItem value="Women's">Women's</SelectItem>
                    <SelectItem value="Unisex">Unisex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* Condition */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Condition</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Condition Rating
            </label>
            <Select
              value={formData.conditionRating}
              onValueChange={(value) => updateField('conditionRating', value)}
            >
              <SelectTrigger className="rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_RATINGS.map((rating) => (
                  <SelectItem key={rating} value={rating}>
                    {rating}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Condition Details
            </label>
            <Textarea
              value={formData.conditionDetails}
              onChange={(e) => updateField('conditionDetails', e.target.value)}
              placeholder="Describe the overall condition..."
              className="rounded-md"
              rows={3}
            />
          </div>
          {formData.wearNotes && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Wear Notes
              </label>
              <Textarea
                value={formData.wearNotes}
                onChange={(e) => updateField('wearNotes', e.target.value)}
                placeholder="Any scratches, marks, or wear..."
                className="rounded-md"
                rows={2}
              />
            </div>
          )}
        </div>

        {/* Pricing */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Pricing
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Asking Price (AUD)
              </label>
              <Input
                type="number"
                value={formData.price}
                onChange={(e) => updateField('price', parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="rounded-md"
                min="0"
                step="1"
              />
              {aiData?.price_reasoning && (
                <p className="text-xs text-gray-500 mt-1">
                  AI: {aiData.price_reasoning}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Original RRP (AUD)
              </label>
              <Input
                type="number"
                value={formData.originalRrp}
                onChange={(e) => updateField('originalRrp', parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="rounded-md"
                min="0"
                step="1"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

