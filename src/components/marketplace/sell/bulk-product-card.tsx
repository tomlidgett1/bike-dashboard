"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Trash2, DollarSign, Package, ChevronDown, Shirt } from "lucide-react";
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
    // description is the product description (from web search)
    description: aiData?.description || '',
    // sellerNotes is seller's notes about condition
    sellerNotes: aiData?.seller_notes || '',
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
    conditionDetails: aiData?.description || '',
    wearNotes: aiData?.wear_notes || '',
    usageEstimate: aiData?.usage_estimate || '',
    price: aiData?.price_min_aud || 0,
    originalRrp: aiData?.price_max_aud || 0,
  });

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
    <div className={cn(
      "bg-white overflow-hidden",
      isMobile ? "rounded-none" : "rounded-md border border-gray-200"
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

