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
    const confidence = editedData.field_confidence as Record<string, number> | undefined;
    return confidence?.[field] || editedData.overall_confidence || 80;
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

      {/* Web Enrichment - Product Description */}
      {editedData.web_enrichment?.product_description && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900">Product Description</h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-md border border-blue-200">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />
              From Web
            </span>
          </div>
          <div className="bg-white rounded-md p-4 border border-gray-200">
            <p className="text-sm text-gray-700 leading-relaxed">
              {editedData.web_enrichment.product_description}
            </p>
          </div>
        </div>
      )}

      {/* Web Enrichment - Technical Specifications */}
      {editedData.web_enrichment?.technical_specs && Object.keys(editedData.web_enrichment.technical_specs).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900">Technical Specifications</h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-md border border-blue-200">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />
              From Web
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(editedData.web_enrichment.technical_specs).map(([key, value]) => (
              <div key={key} className="bg-white rounded-md p-3 border border-gray-200">
                <p className="text-xs font-medium text-gray-500 mb-1">
                  {key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                </p>
                <p className="text-sm font-medium text-gray-900">{value as string}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Web Enrichment - Category Classification */}
      {editedData.web_enrichment?.category_classification && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900">Category Classification</h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-md border border-blue-200">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />
              From Web
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {editedData.web_enrichment.category_classification.level1 && (
              <>
                <span className="font-medium text-gray-900">
                  {editedData.web_enrichment.category_classification.level1}
                </span>
                {editedData.web_enrichment.category_classification.level2 && (
                  <>
                    <span className="text-gray-400">›</span>
                    <span className="font-medium text-gray-900">
                      {editedData.web_enrichment.category_classification.level2}
                    </span>
                  </>
                )}
                {editedData.web_enrichment.category_classification.level3 && (
                  <>
                    <span className="text-gray-400">›</span>
                    <span className="font-medium text-gray-900">
                      {editedData.web_enrichment.category_classification.level3}
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Web Enrichment - Market Pricing */}
      {editedData.web_enrichment?.market_pricing && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900">Market Pricing (Web)</h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-green-700 bg-green-50 rounded-md border border-green-200">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
              Australian Retailers
            </span>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xl font-bold text-gray-900">
                ${editedData.web_enrichment.market_pricing.min_aud?.toLocaleString() || 'N/A'} - $
                {editedData.web_enrichment.market_pricing.max_aud?.toLocaleString() || 'N/A'} AUD
              </p>
            </div>
            {editedData.web_enrichment.market_pricing.sources && editedData.web_enrichment.market_pricing.sources.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-gray-600">Sources:</span>
                {editedData.web_enrichment.market_pricing.sources.map((source, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md">
                    {source}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Web Enrichment - Compatibility Info */}
      {editedData.web_enrichment?.compatibility_info && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900">Compatibility Information</h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-md border border-blue-200">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />
              From Web
            </span>
          </div>
          <div className="bg-white rounded-md p-4 border border-gray-200">
            <p className="text-sm text-gray-700">
              {editedData.web_enrichment.compatibility_info}
            </p>
          </div>
        </div>
      )}

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

      {/* Data Sources Summary */}
      {editedData.data_sources && Object.keys(editedData.data_sources).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h3 className="text-base font-semibold text-gray-900">Data Sources</h3>
          <p className="text-xs text-gray-600">
            How each field was determined
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(editedData.data_sources).map(([field, source]) => (
              <div key={field} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-white border border-gray-200 rounded-md">
                <span className="text-gray-700 capitalize">
                  {field.replace(/_/g, ' ')}:
                </span>
                <span className={cn(
                  "inline-flex items-center gap-1",
                  source === 'image' ? 'text-purple-700' :
                  source === 'web' ? 'text-blue-700' :
                  'text-green-700'
                )}>
                  <span className={cn(
                    "inline-block w-1.5 h-1.5 rounded-full",
                    source === 'image' ? 'bg-purple-500' :
                    source === 'web' ? 'bg-blue-500' :
                    'bg-green-500'
                  )} />
                  {source === 'both' ? 'Image + Web' : source.charAt(0).toUpperCase() + source.slice(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Web Search Sources */}
      {editedData.search_urls && editedData.search_urls.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h3 className="text-base font-semibold text-gray-900">
            Information Sources
          </h3>
          <p className="text-xs text-gray-600">
            Data enriched from web search of cycling retailers and manufacturers
          </p>
          <div className="flex flex-wrap gap-2">
            {editedData.search_urls.slice(0, 5).map((source, index) => (
              <a
                key={index}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
              >
                <span className={cn(
                  "inline-block w-1.5 h-1.5 rounded-full",
                  source.type === 'manufacturer' ? 'bg-blue-500' :
                  source.type === 'retailer' ? 'bg-green-500' :
                  'bg-gray-400'
                )} />
                {new URL(source.url).hostname.replace('www.', '')}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Debug: Full Analysis Data */}
      {process.env.NODE_ENV === 'development' && (
        <details className="bg-gray-50 rounded-xl border border-gray-300 p-5">
          <summary className="text-sm font-semibold text-gray-900 cursor-pointer hover:text-gray-700">
            🔍 Debug: View Full Analysis Data
          </summary>
          <pre className="mt-3 text-xs text-gray-700 overflow-auto max-h-96 bg-white p-4 rounded-md border border-gray-200">
            {JSON.stringify(editedData, null, 2)}
          </pre>
        </details>
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

