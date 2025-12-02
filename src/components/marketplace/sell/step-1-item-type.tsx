"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bike, Wrench, ShoppingBag, Zap, ChevronDown, ImageIcon, DollarSign, Loader2 } from "lucide-react";
import { ItemType, ListingImage, ConditionRating } from "@/lib/types/listing";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Image from "next/image";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ============================================================
// Step 1: Item Type Selection with Quick Listing
// ============================================================

interface QuickListingData {
  title?: string;
  description?: string;
  price?: number;
  conditionRating?: ConditionRating;
  images?: ListingImage[];
  itemType?: ItemType;
  brand?: string;
  model?: string;
}

interface Step1ItemTypeProps {
  selectedType?: ItemType;
  onSelect: (type: ItemType) => void;
  // Quick listing props
  quickListingData?: QuickListingData;
  onQuickList?: (data: QuickListingData) => void;
  isQuickListing?: boolean;
}

const CONDITION_OPTIONS: { value: ConditionRating; label: string }[] = [
  { value: "New", label: "New" },
  { value: "Like New", label: "Like New" },
  { value: "Excellent", label: "Excellent" },
  { value: "Good", label: "Good" },
  { value: "Fair", label: "Fair" },
  { value: "Well Used", label: "Well Used" },
];

export function Step1ItemType({ 
  selectedType, 
  onSelect,
  quickListingData,
  onQuickList,
  isQuickListing = false
}: Step1ItemTypeProps) {
  const [showComprehensive, setShowComprehensive] = React.useState(false);
  const [quickData, setQuickData] = React.useState<QuickListingData>({});
  const [isPublishing, setIsPublishing] = React.useState(false);

  // Initialize quick data from props
  React.useEffect(() => {
    if (quickListingData) {
      // Generate title from brand/model if not provided
      const generatedTitle = quickListingData.title || 
        [quickListingData.brand, quickListingData.model].filter(Boolean).join(' ') ||
        '';
      
      setQuickData({
        ...quickListingData,
        title: generatedTitle,
      });
    }
  }, [quickListingData]);

  const hasAiData = quickListingData && (quickListingData.images?.length || quickListingData.brand || quickListingData.model);

  const handleQuickList = async () => {
    if (!onQuickList) return;
    setIsPublishing(true);
    try {
      await onQuickList(quickData);
    } finally {
      setIsPublishing(false);
    }
  };

  // If no AI data, show just the item type selection
  if (!hasAiData) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-gray-900">What are you selling?</h2>
          <p className="text-gray-600">
            Choose the type of item you want to list on the marketplace
          </p>
        </div>

        {/* Item Type Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ItemTypeCard
            type="bike"
            icon={Bike}
            title="Complete Bikes"
            description="Full bicycles of any type - road, mountain, gravel, and more"
            examples={["Road bikes", "Mountain bikes", "E-bikes", "Kids bikes"]}
            isSelected={selectedType === "bike"}
            onSelect={() => onSelect("bike")}
          />

          <ItemTypeCard
            type="part"
            icon={Wrench}
            title="Parts & Components"
            description="Frames, wheels, groupsets, and all cycling components"
            examples={["Frames", "Wheelsets", "Groupsets", "Drivetrain"]}
            isSelected={selectedType === "part"}
            onSelect={() => onSelect("part")}
          />

          <ItemTypeCard
            type="apparel"
            icon={ShoppingBag}
            title="Apparel & Accessories"
            description="Clothing, shoes, helmets, and cycling accessories"
            examples={["Jerseys", "Shoes", "Helmets", "Computers"]}
            isSelected={selectedType === "apparel"}
            onSelect={() => onSelect("apparel")}
          />
        </div>

        {/* Info Box */}
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">💡 Tip:</span> Each item type has a customised
            form to capture all the relevant details for your listing.
          </p>
        </div>
      </div>
    );
  }

  // With AI data - show quick listing option
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Your listing is ready!</h2>
        <p className="text-gray-600">
          We've detected your item details. Review and list instantly, or add more details.
        </p>
      </div>

      {/* Quick Listing Card */}
      <Card className="p-6 rounded-md border-2 border-gray-900 bg-white">
        <div className="space-y-6">
          {/* Quick List Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Quick Listing</h3>
              <p className="text-sm text-gray-600">List your item in seconds</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
            {/* Left - Form Fields */}
            <div className="space-y-4">
              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Title</label>
                <Input
                  value={quickData.title || ''}
                  onChange={(e) => setQuickData({ ...quickData, title: e.target.value })}
                  placeholder="e.g., Trek Domane SL6 Road Bike"
                  className="rounded-md"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={quickData.description || ''}
                  onChange={(e) => setQuickData({ ...quickData, description: e.target.value })}
                  placeholder="Describe your item (condition, features, why you're selling...)"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
                />
              </div>

              {/* Price & Condition Row */}
              <div className="grid grid-cols-2 gap-4">
                {/* Price */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Price</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      type="number"
                      value={quickData.price || ''}
                      onChange={(e) => setQuickData({ ...quickData, price: parseInt(e.target.value) || undefined })}
                      placeholder="0"
                      className="pl-9 rounded-md"
                    />
                  </div>
                </div>

                {/* Condition */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Condition</label>
                  <Select 
                    value={quickData.conditionRating} 
                    onValueChange={(value) => setQuickData({ ...quickData, conditionRating: value as ConditionRating })}
                  >
                    <SelectTrigger className="rounded-md">
                      <SelectValue placeholder="Select condition" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDITION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Right - Image Preview */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700">Photos</label>
              {quickData.images && quickData.images.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {quickData.images.slice(0, 6).map((image, index) => (
                    <div key={image.id || index} className="aspect-square rounded-md overflow-hidden border border-gray-200 bg-gray-100">
                      <Image
                        src={image.url}
                        alt={`Photo ${index + 1}`}
                        width={100}
                        height={100}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                  {quickData.images.length > 6 && (
                    <div className="aspect-square rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-600">+{quickData.images.length - 6}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="aspect-video rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-gray-400" />
                </div>
              )}
            </div>
          </div>

          {/* Quick List Button */}
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleQuickList}
              disabled={!quickData.title || !quickData.price || isPublishing}
              className="rounded-md bg-gray-900 hover:bg-gray-800 text-white px-8"
            >
              {isPublishing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  List Now
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="px-4 bg-gray-50 text-sm text-gray-500">or add more details</span>
        </div>
      </div>

      {/* Comprehensive Listing Toggle */}
      <button
        onClick={() => setShowComprehensive(!showComprehensive)}
        className="w-full flex items-center justify-between p-4 bg-white rounded-md border border-gray-200 hover:border-gray-300 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            {quickData.itemType === 'bike' ? (
              <Bike className="h-5 w-5 text-gray-600" />
            ) : quickData.itemType === 'part' ? (
              <Wrench className="h-5 w-5 text-gray-600" />
            ) : quickData.itemType === 'apparel' ? (
              <ShoppingBag className="h-5 w-5 text-gray-600" />
            ) : (
              <Bike className="h-5 w-5 text-gray-600" />
            )}
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">Create Comprehensive Listing</h3>
            <p className="text-sm text-gray-600">Add specifications, service history, and more</p>
          </div>
        </div>
        <ChevronDown className={cn(
          "h-5 w-5 text-gray-400 transition-transform",
          showComprehensive && "rotate-180"
        )} />
      </button>

      {/* Comprehensive Options */}
      <AnimatePresence>
        {showComprehensive && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ItemTypeCard
                type="bike"
                icon={Bike}
                title="Complete Bikes"
                description="Add frame details, components, service history"
                examples={["Frame specs", "Groupset", "Service records"]}
                isSelected={selectedType === "bike"}
                onSelect={() => onSelect("bike")}
                compact
              />

              <ItemTypeCard
                type="part"
                icon={Wrench}
                title="Parts & Components"
                description="Add compatibility, specifications"
                examples={["Compatibility", "Weight", "Material"]}
                isSelected={selectedType === "part"}
                onSelect={() => onSelect("part")}
                compact
              />

              <ItemTypeCard
                type="apparel"
                icon={ShoppingBag}
                title="Apparel & Accessories"
                description="Add sizing, materials, fit details"
                examples={["Size", "Material", "Fit type"]}
                isSelected={selectedType === "apparel"}
                onSelect={() => onSelect("apparel")}
                compact
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Item Type Card
// ============================================================

interface ItemTypeCardProps {
  type: ItemType;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  examples: string[];
  isSelected: boolean;
  onSelect: () => void;
  compact?: boolean;
}

function ItemTypeCard({
  icon: Icon,
  title,
  description,
  examples,
  isSelected,
  onSelect,
  compact = false,
}: ItemTypeCardProps) {
  if (compact) {
    return (
      <motion.button
        type="button"
        onClick={onSelect}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className="text-left"
      >
        <Card
          className={cn(
            "h-full p-4 rounded-md border-2 transition-all cursor-pointer",
            isSelected
              ? "border-gray-900 bg-gray-50"
              : "border-gray-200 bg-white hover:border-gray-300"
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                isSelected ? "bg-gray-900" : "bg-gray-100"
              )}
            >
              <Icon className={cn("h-5 w-5", isSelected ? "text-white" : "text-gray-600")} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{title}</h3>
              <p className="text-xs text-gray-600 mt-0.5">{description}</p>
            </div>
          </div>
        </Card>
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="text-left"
    >
      <Card
        className={cn(
          "h-full p-6 rounded-md border-2 transition-all cursor-pointer",
          isSelected
            ? "border-gray-900 bg-gray-50 shadow-md"
            : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
        )}
      >
        <div className="space-y-4">
          {/* Icon */}
          <div
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
              isSelected ? "bg-gray-900" : "bg-gray-100"
            )}
          >
            <Icon className={cn("h-6 w-6", isSelected ? "text-white" : "text-gray-600")} />
          </div>

          {/* Title & Description */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-600">{description}</p>
          </div>

          {/* Examples */}
          <div className="pt-2 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-500 mb-2">Examples:</p>
            <ul className="space-y-1">
              {examples.map((example, index) => (
                <li key={index} className="text-xs text-gray-600 flex items-center gap-1">
                  <span className="text-gray-400">•</span>
                  {example}
                </li>
              ))}
            </ul>
          </div>

          {/* Selected Indicator */}
          {isSelected && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="pt-2"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-900 text-white text-xs font-medium rounded-md">
                ✓ Selected
              </div>
            </motion.div>
          )}
        </div>
      </Card>
    </motion.button>
  );
}

