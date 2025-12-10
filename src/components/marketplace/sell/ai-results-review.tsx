"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, FileText, ChevronDown, DollarSign, Package, AlertCircle, Shirt, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ListingAnalysisResult } from "@/lib/ai/schemas";
import { InlineEditField } from "./inline-edit-field";
import { ConfidenceBadge } from "./confidence-badge";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { CONDITION_RATINGS } from "@/lib/types/listing";

// ============================================================
// AI Results Review Screen
// ============================================================

interface AIResultsReviewProps {
  analysis: ListingAnalysisResult;
  photos: string[];
  onContinue: (editedData: any) => void;
  onReanalyze: () => void;
  onSwitchToManual: () => void;
}

export function AIResultsReview({
  analysis,
  photos,
  onContinue,
  onReanalyze,
  onSwitchToManual,
}: AIResultsReviewProps) {
  const [editedData, setEditedData] = React.useState(analysis);
  const [primaryImageIndex, setPrimaryImageIndex] = React.useState(0);
  const [showDetails, setShowDetails] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  // Detect if on mobile
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const updateField = (path: string, value: any) => {
    setEditedData(prev => {
      const newData = { ...prev };
      const keys = path.split('.');
      let current: any = newData;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
      return newData;
    });
  };

  const getFieldValue = (path: string): string => {
    const keys = path.split('.');
    let current: any = editedData;
    for (const key of keys) {
      if (!current) return '';
      current = current[key];
    }
    return current || '';
  };

  const getConfidence = (field: string): number => {
    const confidence = editedData.field_confidence as Record<string, number> | undefined;
    return confidence?.[field] || editedData.overall_confidence || 80;
  };

  const isBike = editedData.item_type === 'bike';
  const isPart = editedData.item_type === 'part';
  const isApparel = editedData.item_type === 'apparel';
  const isLowConfidence = (editedData.overall_confidence || 80) < 70;

  // Calculate suggested price
  const suggestedPrice = editedData.price_estimate
    ? Math.round((editedData.price_estimate.min_aud + editedData.price_estimate.max_aud) / 2)
    : 0;

  // Mobile view - card-style like BulkProductCard
  if (isMobile) {
    return (
      <div className="min-h-screen bg-gray-50 pb-32">
        {/* Photo Gallery */}
        <div className="relative aspect-square bg-gray-100">
          {photos.length > 0 && (
            <Image
              src={photos[primaryImageIndex]}
              alt="Product"
              fill
              className="object-contain"
              priority
            />
          )}
          
          {/* Confidence Warning */}
          {isLowConfidence && (
            <div className="absolute top-3 left-3 right-3">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-yellow-600 flex-shrink-0" />
                <p className="text-[11px] font-medium text-yellow-800">
                  Low confidence - please review
                </p>
              </div>
            </div>
          )}

          {/* AI Badge */}
          <div className="absolute bottom-3 right-3">
            <div className="bg-white/90 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center gap-1.5 border border-gray-200">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-500" />
              <span className="text-[10px] font-medium text-gray-700">AI Detected</span>
            </div>
          </div>
        </div>

        {/* Thumbnail Strip */}
        {photos.length > 1 && (
          <div className="flex gap-2 p-3 border-b border-gray-200 overflow-x-auto bg-white">
            {photos.map((url, index) => (
              <button
                key={index}
                onClick={() => setPrimaryImageIndex(index)}
                className={cn(
                  "relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors",
                  index === primaryImageIndex
                    ? "border-[#FFC72C]"
                    : "border-gray-200"
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
        <div className="p-4 space-y-4 bg-white">
          {/* Generated Title */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
            <Input
              value={`${editedData.model_year || ''} ${editedData.brand || ''} ${editedData.model || ''}`.trim() || 'Product'}
              onChange={(e) => {
                const parts = e.target.value.split(' ');
                // Simple parsing - just update brand for now
                updateField('brand', e.target.value);
              }}
              className="rounded-xl h-11 text-base"
              placeholder="Product name"
            />
          </div>

          {/* Price & Condition Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Price (AUD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <Input
                  type="number"
                  value={suggestedPrice}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 0;
                    updateField('price_estimate', {
                      ...editedData.price_estimate,
                      min_aud: value * 0.9,
                      max_aud: value * 1.1
                    });
                  }}
                  className="pl-7 rounded-xl h-11 text-base"
                  min="0"
                />
              </div>
              {editedData.price_estimate?.reasoning && (
                <p className="text-[10px] text-gray-500 mt-1 line-clamp-2">
                  {editedData.price_estimate.reasoning}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Condition</label>
              <Select
                value={editedData.condition_rating || 'Good'}
                onValueChange={(value) => updateField('condition_rating', value)}
              >
                <SelectTrigger className="rounded-xl h-11">
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
          </div>

          {/* Brand & Model Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Brand</label>
              <Input
                value={getFieldValue('brand')}
                onChange={(e) => updateField('brand', e.target.value)}
                className="rounded-xl h-11 text-base"
                placeholder="Brand"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Model</label>
              <Input
                value={getFieldValue('model')}
                onChange={(e) => updateField('model', e.target.value)}
                className="rounded-xl h-11 text-base"
                placeholder="Model"
              />
            </div>
          </div>

          {/* Year */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Year</label>
            <Input
              value={getFieldValue('model_year')}
              onChange={(e) => updateField('model_year', e.target.value)}
              className="rounded-xl h-11 text-base"
              placeholder="2023"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
            <Select
              value={editedData.item_type || 'bike'}
              onValueChange={(value) => updateField('item_type', value)}
            >
              <SelectTrigger className="rounded-xl h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bike">Bike</SelectItem>
                <SelectItem value="part">Part/Component</SelectItem>
                <SelectItem value="apparel">Apparel</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <Textarea
              value={getFieldValue('condition_details')}
              onChange={(e) => updateField('condition_details', e.target.value)}
              className="rounded-xl resize-none text-base"
              rows={3}
              placeholder="Describe your product..."
            />
          </div>

          {/* Expandable Details Section */}
          <div>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full flex items-center justify-between py-3 text-left"
            >
              <span className="text-sm font-medium text-gray-900 flex items-center gap-2">
                {isBike && <Package className="h-4 w-4" />}
                {isPart && <Wrench className="h-4 w-4" />}
                {isApparel && <Shirt className="h-4 w-4" />}
                {isBike && "Bike Details"}
                {isPart && "Part Details"}
                {isApparel && "Apparel Details"}
                {!isBike && !isPart && !isApparel && "Additional Details"}
              </span>
              <ChevronDown className={cn(
                "h-5 w-5 text-gray-400 transition-transform duration-200",
                showDetails && "rotate-180"
              )} />
            </button>

            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
                  className="overflow-hidden"
                >
                  <div className="space-y-3 pt-2 pb-2">
                    {/* Bike-Specific Fields */}
                    {isBike && editedData.bike_details && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Frame Size</label>
                            <Input
                              value={getFieldValue('bike_details.frame_size')}
                              onChange={(e) => updateField('bike_details.frame_size', e.target.value)}
                              className="rounded-xl h-11 text-base"
                              placeholder="Medium"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Material</label>
                            <Input
                              value={getFieldValue('bike_details.frame_material')}
                              onChange={(e) => updateField('bike_details.frame_material', e.target.value)}
                              className="rounded-xl h-11 text-base"
                              placeholder="Carbon"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Groupset</label>
                            <Input
                              value={getFieldValue('bike_details.groupset')}
                              onChange={(e) => updateField('bike_details.groupset', e.target.value)}
                              className="rounded-xl h-11 text-base"
                              placeholder="Shimano"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Wheels</label>
                            <Input
                              value={getFieldValue('bike_details.wheel_size')}
                              onChange={(e) => updateField('bike_details.wheel_size', e.target.value)}
                              className="rounded-xl h-11 text-base"
                              placeholder='29"'
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Colour</label>
                          <Input
                            value={getFieldValue('bike_details.color_primary')}
                            onChange={(e) => updateField('bike_details.color_primary', e.target.value)}
                            className="rounded-xl h-11 text-base"
                            placeholder="Black"
                          />
                        </div>
                      </>
                    )}

                    {/* Part-Specific Fields */}
                    {isPart && editedData.part_details && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Part Type</label>
                          <Input
                            value={getFieldValue('part_details.part_type')}
                            onChange={(e) => updateField('part_details.part_type', e.target.value)}
                            className="rounded-xl h-11 text-base"
                            placeholder="e.g., Rear Derailleur"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Compatibility</label>
                          <Textarea
                            value={getFieldValue('part_details.compatibility')}
                            onChange={(e) => updateField('part_details.compatibility', e.target.value)}
                            className="rounded-xl resize-none text-base"
                            rows={2}
                            placeholder="Compatible with..."
                          />
                        </div>
                      </>
                    )}

                    {/* Apparel-Specific Fields */}
                    {isApparel && editedData.apparel_details && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Size</label>
                          <Input
                            value={getFieldValue('apparel_details.size')}
                            onChange={(e) => updateField('apparel_details.size', e.target.value)}
                            className="rounded-xl h-11 text-base"
                            placeholder="Medium"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Fit</label>
                          <Select
                            value={getFieldValue('apparel_details.gender_fit') || ''}
                            onValueChange={(value) => updateField('apparel_details.gender_fit', value)}
                          >
                            <SelectTrigger className="rounded-xl h-11">
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
                    )}

                    {/* Condition Notes */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Condition Notes</label>
                      <Textarea
                        value={getFieldValue('wear_notes')}
                        onChange={(e) => updateField('wear_notes', e.target.value)}
                        className="rounded-xl resize-none text-base"
                        rows={2}
                        placeholder="Any wear or damage..."
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Fixed Bottom Actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-40">
          <div className="flex gap-3">
            <Button
              onClick={onReanalyze}
              variant="outline"
              className="rounded-xl h-12 px-4"
            >
              <RefreshCw className="h-5 w-5" />
            </Button>
            <Button
              onClick={() => onContinue(editedData)}
              className="flex-1 rounded-xl h-12 bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-semibold"
            >
              Continue to Listing
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Desktop view - original layout
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-3">
        <h2 className="text-2xl font-bold text-gray-900">Review Detected Information</h2>
        <p className="text-gray-600">
          Check the details below and edit anything that needs adjustment
        </p>
        <ConfidenceBadge confidence={editedData.overall_confidence} size="md" />
        
        {/* Debug: Web Search Status */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-md">
          <span className={cn(
            "inline-block w-2 h-2 rounded-full",
            editedData.web_enrichment ? 'bg-green-500' : 'bg-gray-400'
          )} />
          {editedData.web_enrichment ? 'Web search completed' : 'Web search not available'}
        </div>
      </div>

      {/* Detected Product */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-base font-bold text-gray-900 mb-1">
          {editedData.model_year} {editedData.brand} {editedData.model || 'Product'}
        </h3>
        <p className="text-sm text-gray-600 mb-3">
          {editedData.item_type === 'bike' && editedData.bike_details?.bike_type || ''}
          {editedData.item_type === 'part' && editedData.part_details?.category || ''}
          {editedData.item_type === 'apparel' && editedData.apparel_details?.category || ''}
        </p>
        
        {/* Analysis Summary */}
        <div className="pt-3 border-t border-gray-200 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-600">Item Type:</span>
            <span className="font-medium text-gray-900 capitalize">{editedData.item_type}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-600">Analysis Method:</span>
            <div className="flex items-center gap-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md border border-purple-200">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-500" />
                Image AI
              </span>
              {editedData.web_enrichment && (
                <>
                  <span className="text-gray-400">+</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md border border-blue-200">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Web Search
                  </span>
                </>
              )}
            </div>
          </div>
          {!editedData.web_enrichment && (
            <div className="flex items-start gap-2 px-3 py-2 bg-yellow-50 rounded-md border border-yellow-200">
              <span className="text-yellow-600 text-xs mt-0.5">ℹ️</span>
              <p className="text-xs text-yellow-800">
                Web search did not return additional data. Showing image analysis only.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Basic Information */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-base font-semibold text-gray-900">Basic Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InlineEditField
            label="Brand"
            value={getFieldValue('brand')}
            confidence={getConfidence('brand')}
            onSave={(v) => updateField('brand', v)}
          />
          <InlineEditField
            label="Model"
            value={getFieldValue('model')}
            confidence={getConfidence('model')}
            onSave={(v) => updateField('model', v)}
          />
          <InlineEditField
            label="Model Year"
            value={getFieldValue('model_year')}
            confidence={getConfidence('model')}
            onSave={(v) => updateField('model_year', v)}
          />
        </div>
      </div>

      {/* Type-Specific Fields */}
      {editedData.item_type === 'bike' && editedData.bike_details && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="text-base font-semibold text-gray-900">Bike Specifications</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InlineEditField
              label="Bike Type"
              value={getFieldValue('bike_details.bike_type')}
              confidence={getConfidence('specifications')}
              onSave={(v) => updateField('bike_details.bike_type', v)}
            />
            <InlineEditField
              label="Frame Size"
              value={getFieldValue('bike_details.frame_size')}
              confidence={getConfidence('specifications')}
              onSave={(v) => updateField('bike_details.frame_size', v)}
            />
            <InlineEditField
              label="Frame Material"
              value={getFieldValue('bike_details.frame_material')}
              confidence={getConfidence('specifications')}
              onSave={(v) => updateField('bike_details.frame_material', v)}
            />
            <InlineEditField
              label="Groupset"
              value={getFieldValue('bike_details.groupset')}
              confidence={getConfidence('specifications')}
              onSave={(v) => updateField('bike_details.groupset', v)}
            />
            <InlineEditField
              label="Wheel Size"
              value={getFieldValue('bike_details.wheel_size')}
              confidence={getConfidence('specifications')}
              onSave={(v) => updateField('bike_details.wheel_size', v)}
            />
            <InlineEditField
              label="Primary Colour"
              value={getFieldValue('bike_details.color_primary')}
              confidence={getConfidence('specifications')}
              onSave={(v) => updateField('bike_details.color_primary', v)}
            />
          </div>
        </div>
      )}

      {/* Condition Assessment */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-base font-semibold text-gray-900">Condition Assessment</h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-900 mb-2 block">
              Condition Rating
            </label>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-gray-900">{editedData.condition_rating}</span>
              <ConfidenceBadge confidence={getConfidence('condition')} size="sm" />
            </div>
          </div>
          
          <InlineEditField
            label="Condition Details"
            value={getFieldValue('condition_details')}
            confidence={getConfidence('condition')}
            onSave={(v) => updateField('condition_details', v)}
            multiline
          />

          {editedData.wear_notes && (
            <InlineEditField
              label="Wear Notes"
              value={getFieldValue('wear_notes')}
              confidence={getConfidence('condition')}
              onSave={(v) => updateField('wear_notes', v)}
              multiline
            />
          )}

          {editedData.visible_issues && editedData.visible_issues.length > 0 && (
            <div className="bg-yellow-50 rounded-md p-4 border border-yellow-200">
              <p className="text-sm font-semibold text-yellow-900 mb-2">Detected Issues:</p>
              <ul className="space-y-1">
                {editedData.visible_issues.map((issue, index) => (
                  <li key={index} className="text-sm text-yellow-800 flex items-start gap-2">
                    <span>•</span>
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Price Suggestion */}
      {editedData.price_estimate && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="text-base font-semibold text-gray-900">
            AI Price Estimate
          </h3>
          <div className="space-y-3">
            <div>
              <p className="text-xl font-bold text-gray-900">
                ${editedData.price_estimate.min_aud.toLocaleString()} - $
                {editedData.price_estimate.max_aud.toLocaleString()} AUD
              </p>
              <ConfidenceBadge confidence={getConfidence('pricing')} size="sm" />
            </div>
            <div className="bg-white rounded-md p-4 border border-gray-200">
              <p className="text-sm text-gray-700">{editedData.price_estimate.reasoning}</p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col md:flex-row gap-3">
        <Button
          onClick={() => onContinue(editedData)}
          className="flex-1 bg-gray-900 hover:bg-gray-800 text-white rounded-md h-11"
        >
          Continue to Listing
        </Button>
        <Button
          onClick={onReanalyze}
          variant="outline"
          className="rounded-md h-11"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Re-analyse
        </Button>
        <Button
          onClick={onSwitchToManual}
          variant="outline"
          className="rounded-md h-11"
        >
          <FileText className="h-4 w-4 mr-2" />
          Switch to Manual
        </Button>
      </div>

      {/* Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
        <p className="text-sm text-gray-700">
          <span className="font-semibold">Tip:</span> You can edit any field inline. Click "Continue" to proceed to the full listing form where you can add more details.
        </p>
      </div>
    </div>
  );
}

