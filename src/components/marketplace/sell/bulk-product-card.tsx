"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Trash2, DollarSign, Package, ChevronDown, Shirt, Eraser, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { CONDITION_RATINGS, type ConditionRating, type ItemType } from "@/lib/types/listing";
import { Switch } from "@/components/ui/switch";

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
  onRemoveBackground?: (imageUrls: string[]) => Promise<string[]>;
}

// Helper: Clean material to single word with capital (e.g., "carbon fiber" -> "Carbon")
const cleanMaterial = (text: string | undefined | null): string => {
  if (!text || typeof text !== 'string') return '';
  const cleaned = text.trim();
  if (!cleaned) return '';
  const firstWord = cleaned.split(/[\s/]+/)[0];
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
};

// Helper: Clean wheel size to single value (e.g., "29\" / 27.5\"" -> "29\"")
const cleanWheelSize = (text: string | undefined | null): string => {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text
    .replace(/^(maybe|possibly|likely|probably|perhaps|approximately|about|around)\s+/gi, '')
    .trim();
  if (cleaned.includes('/')) {
    cleaned = cleaned.split('/')[0].trim();
  }
  return cleaned;
};

// Helper: Clean frame size - leave blank if generic/unknown
const cleanFrameSize = (text: string | undefined | null): string => {
  if (!text || typeof text !== 'string') return '';
  const lower = text.toLowerCase().trim();
  // If AI says "all sizes", "various", "unknown", etc. - leave blank
  if (
    lower.includes('all size') ||
    lower.includes('various') ||
    lower.includes('unknown') ||
    lower.includes('not specified') ||
    lower.includes('n/a') ||
    lower === 'any'
  ) {
    return '';
  }
  return text.trim();
};

// Helper: General text cleaner - return empty string if unknown/uncertain
const cleanAiText = (text: string | undefined | null): string => {
  if (!text || typeof text !== 'string') return '';
  const lower = text.toLowerCase().trim();
  // If AI is uncertain, leave blank
  if (
    lower.includes('unknown') ||
    lower.includes('not specified') ||
    lower.includes('n/a') ||
    lower.includes('cannot determine') ||
    lower.includes('unclear') ||
    lower === 'any' ||
    lower === 'various'
  ) {
    return '';
  }
  return text.trim();
};

export function BulkProductCard({
  groupId,
  imageUrls: initialImageUrls,
  suggestedName,
  aiData,
  onChange,
  onDelete,
  onRemoveBackground,
}: BulkProductCardProps) {
  // Extract nested details from AI response
  const bikeDetails = aiData?.bike_details || {};
  const partDetails = aiData?.part_details || {};
  const apparelDetails = aiData?.apparel_details || {};
  const priceEstimate = aiData?.price_estimate || {};

  const [formData, setFormData] = React.useState({
    itemType: aiData?.item_type || 'bike',
    title: suggestedName || '',
    // description is the product description (from web search)
    description: cleanAiText(aiData?.description),
    // sellerNotes is seller's notes about condition
    sellerNotes: cleanAiText(aiData?.seller_notes),
    brand: cleanAiText(aiData?.brand),
    model: cleanAiText(aiData?.model),
    modelYear: cleanAiText(aiData?.model_year),
    bikeType: cleanAiText(bikeDetails.bike_type),
    frameSize: cleanFrameSize(bikeDetails.frame_size),
    frameMaterial: cleanMaterial(bikeDetails.frame_material),
    groupset: cleanAiText(bikeDetails.groupset),
    wheelSize: cleanWheelSize(bikeDetails.wheel_size),
    suspensionType: cleanAiText(bikeDetails.suspension_type),
    colorPrimary: cleanAiText(bikeDetails.color_primary),
    partTypeDetail: cleanAiText(partDetails.part_category || partDetails.part_type),
    compatibilityNotes: cleanAiText(partDetails.compatibility),
    material: cleanMaterial(partDetails.material),
    size: cleanAiText(apparelDetails.size),
    genderFit: cleanAiText(apparelDetails.gender_fit),
    conditionRating: (aiData?.condition_rating || 'Good') as ConditionRating,
    conditionDetails: cleanAiText(aiData?.condition_notes),
    wearNotes: cleanAiText(aiData?.wear_notes),
    usageEstimate: cleanAiText(aiData?.usage_estimate),
    price: priceEstimate.min_aud ? Math.round((priceEstimate.min_aud + priceEstimate.max_aud) / 2) : 0,
    originalRrp: priceEstimate.max_aud || 0,
  });
  
  const [imageUrls, setImageUrls] = React.useState<string[]>(initialImageUrls);
  const [isRemovingBackground, setIsRemovingBackground] = React.useState(false);
  const [backgroundRemoved, setBackgroundRemoved] = React.useState(false);

  const [primaryImageIndex, setPrimaryImageIndex] = React.useState(0);
  const [showDetails, setShowDetails] = React.useState(true); // Open by default
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

  // Update parent when form changes
  React.useEffect(() => {
    onChange(formData);
  }, [formData]);

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Handle background removal
  const handleRemoveBackground = async () => {
    if (!onRemoveBackground || isRemovingBackground) return;
    
    setIsRemovingBackground(true);
    try {
      const newUrls = await onRemoveBackground(imageUrls);
      setImageUrls(newUrls);
      setBackgroundRemoved(true);
    } catch (error) {
      console.error('Failed to remove background:', error);
    } finally {
      setIsRemovingBackground(false);
    }
  };

  const isLowConfidence = aiData?.overall_confidence < 70;
  const isBike = formData.itemType === 'bike';
  const isPart = formData.itemType === 'part';
  const isApparel = formData.itemType === 'apparel';

  // Debug log to verify component is loading correctly
  React.useEffect(() => {
    console.log('📦 [BULK CARD] Rendered with:', {
      groupId,
      hasOnRemoveBackground: !!onRemoveBackground,
      sellerNotes: formData.sellerNotes,
      isMobile,
    });
  }, [groupId, onRemoveBackground, formData.sellerNotes, isMobile]);

  return (
    <div className={cn(
      "bg-white",
      isMobile ? "rounded-none pb-20" : "rounded-md border border-gray-200 overflow-hidden"
    )}>
      {/* Photo Gallery */}
      <div className={cn("relative bg-gray-100", isMobile ? "aspect-square" : "aspect-[4/3]")}>
        <Image
          src={imageUrls[primaryImageIndex]}
          alt="Product"
          fill
          className="object-contain"
          priority
        />
        
        {/* Confidence Warning */}
        {isLowConfidence && (
          <div className={cn("absolute left-3 right-3", isMobile ? "top-3" : "top-4 left-4 right-4")}>
            <div className={cn(
              "bg-yellow-50 border border-yellow-200 flex items-center gap-2",
              isMobile ? "rounded-lg p-2" : "rounded-md p-3"
            )}>
              <AlertCircle className={cn("text-yellow-600 flex-shrink-0", isMobile ? "h-3.5 w-3.5" : "h-4 w-4")} />
              <p className={cn("font-medium text-yellow-800", isMobile ? "text-[11px]" : "text-xs")}>
                Low confidence - please review
              </p>
            </div>
          </div>
        )}

        {/* Delete Button */}
        {onDelete && (
          <button
            onClick={onDelete}
            className={cn(
              "absolute bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-colors",
              isMobile ? "top-3 right-3 p-2" : "top-4 right-4 p-2"
            )}
          >
            <Trash2 className={cn(isMobile ? "h-4 w-4" : "h-4 w-4")} />
          </button>
        )}
      </div>

      {/* Thumbnail Strip */}
      {imageUrls.length > 1 && (
        <div className={cn(
          "flex gap-2 border-b border-gray-200 overflow-x-auto",
          isMobile ? "p-3" : "p-4"
        )}>
          {imageUrls.map((url, index) => (
            <button
              key={index}
              onClick={() => setPrimaryImageIndex(index)}
              className={cn(
                "relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-colors",
                index === primaryImageIndex
                  ? "border-[#FFC72C]"
                  : "border-gray-200",
                isMobile ? "w-14 h-14" : "w-16 h-16"
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
      <div className={cn(isMobile ? "p-4 space-y-4" : "p-6 space-y-6")}>
        {/* Essential Fields - Always visible */}
        <div className="space-y-3">
          {/* Title */}
          <div>
            <label className={cn("block font-medium text-gray-700 mb-1", isMobile ? "text-xs" : "text-sm")}>
              Title
            </label>
            <Input
              value={formData.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="Product name"
              className={cn("rounded-xl", isMobile ? "h-11 text-base" : "rounded-md")}
            />
          </div>

          {/* Price & Condition Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={cn("block font-medium text-gray-700 mb-1", isMobile ? "text-xs" : "text-sm")}>
                Price (AUD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <Input
                  type="number"
                  value={formData.price}
                  onChange={(e) => updateField('price', parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className={cn("pl-7 rounded-xl", isMobile ? "h-11 text-base" : "rounded-md")}
                  min="0"
                />
              </div>
            </div>
            <div>
              <label className={cn("block font-medium text-gray-700 mb-1", isMobile ? "text-xs" : "text-sm")}>
                Condition
              </label>
              <Select
                value={formData.conditionRating}
                onValueChange={(value) => updateField('conditionRating', value)}
              >
                <SelectTrigger className={cn("rounded-xl", isMobile ? "h-11" : "rounded-md")}>
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
              <label className={cn("block font-medium text-gray-700 mb-1", isMobile ? "text-xs" : "text-sm")}>
                Brand
              </label>
              <Input
                value={formData.brand}
                onChange={(e) => updateField('brand', e.target.value)}
                placeholder="Brand"
                className={cn("rounded-xl", isMobile ? "h-11 text-base" : "rounded-md")}
              />
            </div>
            <div>
              <label className={cn("block font-medium text-gray-700 mb-1", isMobile ? "text-xs" : "text-sm")}>
                Model
              </label>
              <Input
                value={formData.model}
                onChange={(e) => updateField('model', e.target.value)}
                placeholder="Model"
                className={cn("rounded-xl", isMobile ? "h-11 text-base" : "rounded-md")}
              />
            </div>
          </div>

          {/* Product Type */}
          <div>
            <label className={cn("block font-medium text-gray-700 mb-1", isMobile ? "text-xs" : "text-sm")}>
              Type
            </label>
            <Select
              value={formData.itemType}
              onValueChange={(value) => updateField('itemType', value)}
            >
              <SelectTrigger className={cn("rounded-xl", isMobile ? "h-11" : "rounded-md")}>
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
            <label className={cn("block font-medium text-gray-700 mb-1", isMobile ? "text-xs" : "text-sm")}>
              Description
            </label>
            <Textarea
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Describe your product..."
              className={cn("rounded-xl resize-none", isMobile ? "text-base" : "rounded-md")}
              rows={isMobile ? 3 : 4}
            />
          </div>

          {/* Seller Notes */}
          <div className="pt-2 border-t border-gray-100">
            <label className={cn("block font-medium text-gray-700 mb-1", isMobile ? "text-xs" : "text-sm")}>
              Seller Notes
            </label>
            <Textarea
              value={formData.sellerNotes}
              onChange={(e) => updateField('sellerNotes', e.target.value)}
              placeholder="Your notes about condition, wear, why selling..."
              className={cn("rounded-md resize-none border-gray-200", isMobile ? "text-base" : "")}
              rows={isMobile ? 2 : 3}
            />
          </div>

          {/* Background Remover - always show */}
          <div className="flex items-center justify-between py-3 px-3 bg-gray-50 rounded-md border border-gray-200">
            <div className="flex items-center gap-2">
              <Eraser className="h-4 w-4 text-gray-500" />
              <span className={cn("font-medium text-gray-700", isMobile ? "text-xs" : "text-sm")}>
                Remove Background
              </span>
            </div>
            {isRemovingBackground ? (
              <Loader2 className="h-4 w-4 text-gray-500 animate-spin" />
            ) : backgroundRemoved ? (
              <span className="text-xs text-green-600 font-medium">Done ✓</span>
            ) : onRemoveBackground ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRemoveBackground}
                className="h-7 text-xs rounded-md"
              >
                Apply
              </Button>
            ) : (
              <span className="text-xs text-gray-400">Not available</span>
            )}
          </div>
        </div>

        {/* Expandable Details Section */}
        <div>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between py-3 text-left"
          >
            <span className={cn("font-medium text-gray-900", isMobile ? "text-sm" : "text-sm")}>
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
                  {isBike && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={cn("block font-medium text-gray-700 mb-1", isMobile ? "text-xs" : "text-sm")}>
                            Year
                          </label>
                          <Input
                            value={formData.modelYear}
                            onChange={(e) => updateField('modelYear', e.target.value)}
                            placeholder="2023"
                            className={cn("rounded-xl", isMobile ? "h-11 text-base" : "rounded-md")}
                          />
                        </div>
                        <div>
                          <label className={cn("block font-medium text-gray-700 mb-1", isMobile ? "text-xs" : "text-sm")}>
                            Frame Size
                          </label>
                          <Input
                            value={formData.frameSize}
                            onChange={(e) => updateField('frameSize', e.target.value)}
                            placeholder="Medium"
                            className={cn("rounded-xl", isMobile ? "h-11 text-base" : "rounded-md")}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={cn("block font-medium text-gray-700 mb-1", isMobile ? "text-xs" : "text-sm")}>
                            Material
                          </label>
                          <Input
                            value={formData.frameMaterial}
                            onChange={(e) => updateField('frameMaterial', e.target.value)}
                            placeholder="Carbon"
                            className={cn("rounded-xl", isMobile ? "h-11 text-base" : "rounded-md")}
                          />
                        </div>
                        <div>
                          <label className={cn("block font-medium text-gray-700 mb-1", isMobile ? "text-xs" : "text-sm")}>
                            Groupset
                          </label>
                          <Input
                            value={formData.groupset}
                            onChange={(e) => updateField('groupset', e.target.value)}
                            placeholder="Shimano"
                            className={cn("rounded-xl", isMobile ? "h-11 text-base" : "rounded-md")}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={cn("block font-medium text-gray-700 mb-1", isMobile ? "text-xs" : "text-sm")}>
                            Wheels
                          </label>
                          <Input
                            value={formData.wheelSize}
                            onChange={(e) => updateField('wheelSize', e.target.value)}
                            placeholder='29"'
                            className={cn("rounded-xl", isMobile ? "h-11 text-base" : "rounded-md")}
                          />
                        </div>
                        <div>
                          <label className={cn("block font-medium text-gray-700 mb-1", isMobile ? "text-xs" : "text-sm")}>
                            Colour
                          </label>
                          <Input
                            value={formData.colorPrimary}
                            onChange={(e) => updateField('colorPrimary', e.target.value)}
                            placeholder="Black"
                            className={cn("rounded-xl", isMobile ? "h-11 text-base" : "rounded-md")}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Part-Specific Fields */}
                  {isPart && (
                    <>
                      <div>
                        <label className={cn("block font-medium text-gray-700 mb-1", isMobile ? "text-xs" : "text-sm")}>
                          Part Type
                        </label>
                        <Input
                          value={formData.partTypeDetail}
                          onChange={(e) => updateField('partTypeDetail', e.target.value)}
                          placeholder="e.g., Rear Derailleur"
                          className={cn("rounded-xl", isMobile ? "h-11 text-base" : "rounded-md")}
                        />
                      </div>
                      <div>
                        <label className={cn("block font-medium text-gray-700 mb-1", isMobile ? "text-xs" : "text-sm")}>
                          Compatibility
                        </label>
                        <Textarea
                          value={formData.compatibilityNotes}
                          onChange={(e) => updateField('compatibilityNotes', e.target.value)}
                          placeholder="Compatible with..."
                          className={cn("rounded-xl resize-none", isMobile ? "text-base" : "rounded-md")}
                          rows={2}
                        />
                      </div>
                    </>
                  )}

                  {/* Apparel-Specific Fields */}
                  {isApparel && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={cn("block font-medium text-gray-700 mb-1", isMobile ? "text-xs" : "text-sm")}>
                          Size
                        </label>
                        <Input
                          value={formData.size}
                          onChange={(e) => updateField('size', e.target.value)}
                          placeholder="Medium"
                          className={cn("rounded-xl", isMobile ? "h-11 text-base" : "rounded-md")}
                        />
                      </div>
                      <div>
                        <label className={cn("block font-medium text-gray-700 mb-1", isMobile ? "text-xs" : "text-sm")}>
                          Fit
                        </label>
                        <Select
                          value={formData.genderFit}
                          onValueChange={(value) => updateField('genderFit', value)}
                        >
                          <SelectTrigger className={cn("rounded-xl", isMobile ? "h-11" : "rounded-md")}>
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

                  {/* Condition Details */}
                  <div>
                    <label className={cn("block font-medium text-gray-700 mb-1", isMobile ? "text-xs" : "text-sm")}>
                      Condition Notes
                    </label>
                    <Textarea
                      value={formData.conditionDetails}
                      onChange={(e) => updateField('conditionDetails', e.target.value)}
                      placeholder="Any wear or damage..."
                      className={cn("rounded-xl resize-none", isMobile ? "text-base" : "rounded-md")}
                      rows={2}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

