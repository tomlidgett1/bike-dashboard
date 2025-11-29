"use client";

import * as React from "react";
import { RefreshCw, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ListingAnalysisResult } from "@/lib/ai/schemas";
import { InlineEditField } from "./inline-edit-field";
import { ConfidenceBadge } from "./confidence-badge";
import { cn } from "@/lib/utils";

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
    return editedData.field_confidence?.[field] || editedData.overall_confidence || 80;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-3">
        <h2 className="text-2xl font-bold text-gray-900">Review Detected Information</h2>
        <p className="text-gray-600">
          Check the details below and edit anything that needs adjustment
        </p>
        <ConfidenceBadge confidence={editedData.overall_confidence} size="md" />
      </div>

      {/* Detected Product */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-base font-bold text-gray-900 mb-1">
          {editedData.model_year} {editedData.brand} {editedData.model}
        </h3>
        <p className="text-sm text-gray-600">
          {editedData.item_type === 'bike' && editedData.bike_details?.bike_type || ''}
          {editedData.item_type === 'part' && editedData.part_details?.category || ''}
          {editedData.item_type === 'apparel' && editedData.apparel_details?.category || ''}
        </p>
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
            Suggested Pricing
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

