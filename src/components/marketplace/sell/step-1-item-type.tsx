"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bike, Wrench, ShoppingBag, Zap, ChevronDown, ImageIcon, DollarSign, Loader2, MapPin, Upload, X } from "lucide-react";
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
  pickupLocation?: string;
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
  const [listingMode, setListingMode] = React.useState<'quick' | 'comprehensive'>('quick');
  const [quickData, setQuickData] = React.useState<QuickListingData>({});
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [isUploadingPhotos, setIsUploadingPhotos] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingPhotos(true);
    try {
      // Get Supabase session
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('You must be logged in to upload photos');
      }

      const newImages: ListingImage[] = [];
      const listingId = `quick-${Date.now()}`;

      // Upload each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('listingId', listingId);
        formData.append('index', ((quickData.images?.length || 0) + i).toString());

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/upload-to-cloudinary`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: formData,
          }
        );

        if (!response.ok) {
          throw new Error('Upload failed');
        }

        const result = await response.json();
        newImages.push({
          id: `photo-${Date.now()}-${i}`,
          url: result.data.url,
          cardUrl: result.data.cardUrl,
          thumbnailUrl: result.data.thumbnailUrl,
          order: (quickData.images?.length || 0) + i,
          isPrimary: (quickData.images?.length || 0) === 0 && i === 0,
        });
      }

      // Add new images to existing images
      setQuickData({
        ...quickData,
        images: [...(quickData.images || []), ...newImages],
      });
    } catch (error) {
      console.error('Photo upload error:', error);
      alert('Failed to upload photos. Please try again.');
    } finally {
      setIsUploadingPhotos(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePhoto = (indexToRemove: number) => {
    const updatedImages = (quickData.images || []).filter((_, index) => index !== indexToRemove);
    
    // If we removed the primary image, make the first remaining image primary
    if (updatedImages.length > 0 && quickData.images?.[indexToRemove]?.isPrimary) {
      updatedImages[0].isPrimary = true;
    }

    setQuickData({
      ...quickData,
      images: updatedImages,
    });
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

  // With AI data - show tabbed interface
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Your listing is ready!</h2>
        <p className="text-gray-600">
          We've detected your item details. Choose how you'd like to list it.
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit mx-auto">
        <button
          onClick={() => setListingMode('quick')}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors",
            listingMode === 'quick'
              ? "text-gray-800 bg-white shadow-sm"
              : "text-gray-600 hover:bg-gray-200/70"
          )}
        >
          <Zap size={15} />
          Quick List
        </button>
        <button
          onClick={() => setListingMode('comprehensive')}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors",
            listingMode === 'comprehensive'
              ? "text-gray-800 bg-white shadow-sm"
              : "text-gray-600 hover:bg-gray-200/70"
          )}
        >
          <Bike size={15} />
          Comprehensive Listing
        </button>
      </div>

      {/* Content Area */}
      <AnimatePresence mode="wait">
        {listingMode === 'quick' ? (
          <motion.div
            key="quick"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Description Banner */}
            <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-200">
              <Zap className="h-5 w-5 text-gray-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Quick List Your Item</h4>
                <p className="text-xs text-gray-600 mt-0.5">
                  Fill in the essential details and publish instantly. Perfect for getting your listing live fast.
                </p>
              </div>
            </div>

            {/* Main Form Area */}
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
              {/* Left - Form Fields */}
              <div className="space-y-5">
                {/* Title */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-900">Listing Title *</label>
                  <Input
                    value={quickData.title || ''}
                    onChange={(e) => setQuickData({ ...quickData, title: e.target.value })}
                    placeholder="e.g., Trek Domane SL6 Road Bike"
                    className="rounded-md h-11 text-base"
                  />
                </div>

                {/* Brand (Optional) */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-900">Brand <span className="text-gray-500 font-normal">(Optional)</span></label>
                  <Input
                    value={quickData.brand || ''}
                    onChange={(e) => setQuickData({ ...quickData, brand: e.target.value })}
                    placeholder="e.g., Trek, Specialized, Giant"
                    className="rounded-md h-11 text-base"
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-900">Description *</label>
                  <textarea
                    value={quickData.description || ''}
                    onChange={(e) => setQuickData({ ...quickData, description: e.target.value })}
                    placeholder="Describe your item (condition, features, why you're selling...)"
                    rows={4}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
                  />
                </div>

                {/* Price & Condition Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Price */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-900">Price (AUD) *</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        type="number"
                        value={quickData.price || ''}
                        onChange={(e) => setQuickData({ ...quickData, price: parseInt(e.target.value) || undefined })}
                        placeholder="0"
                        className="pl-9 rounded-md h-11 text-base"
                      />
                    </div>
                  </div>

                  {/* Condition */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-900">Condition *</label>
                    <Select 
                      value={quickData.conditionRating} 
                      onValueChange={(value) => setQuickData({ ...quickData, conditionRating: value as ConditionRating })}
                    >
                      <SelectTrigger className="rounded-md h-11">
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

                {/* Pickup Location */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-900">Pickup Location *</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      value={quickData.pickupLocation || ''}
                      onChange={(e) => setQuickData({ ...quickData, pickupLocation: e.target.value })}
                      placeholder="e.g., Sydney CBD, Melbourne East"
                      className="pl-10 rounded-md h-11 text-base"
                    />
                  </div>
                  <p className="text-xs text-gray-500">Enter suburb or area (don't include your full address)</p>
                </div>
              </div>

              {/* Right - Image Preview & Upload */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-gray-900">Photos</label>
                  <span className="text-xs text-gray-500">{quickData.images?.length || 0} uploaded</span>
                </div>
                
                {quickData.images && quickData.images.length > 0 ? (
                  <div className="space-y-3">
                    {/* Primary Image */}
                    <div className="relative aspect-[4/3] rounded-xl overflow-hidden border-2 border-gray-300 bg-gray-50 shadow-sm group">
                      <Image
                        src={quickData.images[0].url}
                        alt="Primary photo"
                        width={400}
                        height={300}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => handleRemovePhoto(0)}
                        className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3.5 w-3.5 text-white" />
                      </button>
                    </div>
                    
                    {/* Thumbnail Grid */}
                    <div className="grid grid-cols-4 gap-2">
                      {quickData.images.slice(1, 9).map((image, index) => (
                        <div key={image.id || index} className="relative aspect-square rounded-md overflow-hidden border border-gray-200 bg-gray-50 group">
                          <Image
                            src={image.url}
                            alt={`Photo ${index + 2}`}
                            width={100}
                            height={100}
                            className="w-full h-full object-cover"
                          />
                          <button
                            onClick={() => handleRemovePhoto(index + 1)}
                            className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-2.5 w-2.5 text-white" />
                          </button>
                        </div>
                      ))}
                      
                      {/* Add More Button */}
                      {quickData.images.length < 10 && (
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingPhotos}
                          className="aspect-square rounded-md bg-gray-50 border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-100 transition-colors flex items-center justify-center"
                        >
                          {isUploadingPhotos ? (
                            <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                          ) : (
                            <Upload className="h-5 w-5 text-gray-400" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingPhotos}
                    className="w-full aspect-[4/3] rounded-xl bg-gray-50 border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-100 transition-colors flex flex-col items-center justify-center gap-2"
                  >
                    {isUploadingPhotos ? (
                      <>
                        <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
                        <p className="text-xs text-gray-500">Uploading...</p>
                      </>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-gray-400" />
                        <p className="text-xs text-gray-600 font-medium">Add Photos</p>
                        <p className="text-xs text-gray-500">Click to upload</p>
                      </>
                    )}
                  </button>
                )}
                
                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* Publish Section */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-6 border-t-2 border-gray-200">
              <div className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full bg-green-500 mt-1.5"></div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Ready to publish</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Your listing will go live immediately
                  </p>
                </div>
              </div>
              <Button
                onClick={handleQuickList}
                disabled={!quickData.title || !quickData.price || !quickData.pickupLocation || isPublishing}
                size="lg"
                className="rounded-md bg-gray-900 hover:bg-gray-800 text-white px-8 h-11 w-full sm:w-auto"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Publish Listing
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="comprehensive"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {/* Comprehensive Listing Content */}
            <div className="space-y-6">
              {/* Description */}
              <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-200">
                <Bike className="h-5 w-5 text-gray-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Create a Comprehensive Listing</h4>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Add detailed specifications, service history, and more information to attract serious buyers and get better offers.
                  </p>
                </div>
              </div>

              {/* Item Type Cards */}
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

