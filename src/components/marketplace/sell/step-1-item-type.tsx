"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bike, Wrench, ShoppingBag, Zap, ChevronDown, ImageIcon, DollarSign, Loader2, MapPin, Upload, X, Save, Camera, Package, Shirt, Star } from "lucide-react";
import { ItemType, ListingImage, ConditionRating } from "@/lib/types/listing";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  description?: string; // Product description (features, specs, what it is)
  price?: number;
  conditionRating?: ConditionRating;
  images?: ListingImage[];
  primaryImageUrl?: string; // URL of the primary/cover image
  itemType?: ItemType;
  brand?: string;
  model?: string;
  modelYear?: string;
  pickupLocation?: string;
  conditionDetails?: string; // Product description (legacy - same as description)
  sellerNotes?: string; // Seller's personal notes about condition, wear, why selling
  wearNotes?: string;
  usageEstimate?: string;
  searchUrls?: any[];
  structuredMetadata?: any;
  fieldConfidence?: any;
  
  // Bike-specific fields
  frameSize?: string;
  frameMaterial?: string;
  bikeType?: string;
  groupset?: string;
  wheelSize?: string;
  suspensionType?: string;
  colorPrimary?: string;
  colorSecondary?: string;
  bikeWeight?: string;
  
  // Part-specific fields
  partTypeDetail?: string;
  compatibilityNotes?: string;
  material?: string;
  weight?: string;
  
  // Apparel-specific fields
  size?: string;
  genderFit?: string;
  apparelMaterial?: string;
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

// ============================================================
// Category-Specific Field Components
// ============================================================

const BikeSpecificFields = ({ data, onChange }: { data: QuickListingData; onChange: (data: QuickListingData) => void }) => (
  <div className="space-y-4 mt-5 pt-5 border-t border-gray-200">
    <h3 className="text-sm font-semibold text-gray-900">Bicycle Details</h3>
    
    {/* Row 1: Frame Size & Material */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-900">Frame Size <span className="text-gray-500 font-normal">(Optional)</span></label>
        <Input
          value={data.frameSize || ''}
          onChange={(e) => onChange({ ...data, frameSize: e.target.value })}
          placeholder="e.g., 54cm, Medium, Large"
          className="rounded-md h-11 text-base"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-900">Frame Material <span className="text-gray-500 font-normal">(Optional)</span></label>
        <Input
          value={data.frameMaterial || ''}
          onChange={(e) => onChange({ ...data, frameMaterial: e.target.value })}
          placeholder="e.g., Carbon, Aluminium, Steel"
          className="rounded-md h-11 text-base"
        />
      </div>
    </div>

    {/* Row 2: Bike Type & Groupset */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-900">Bike Type <span className="text-gray-500 font-normal">(Optional)</span></label>
        <Select value={data.bikeType} onValueChange={(value) => onChange({ ...data, bikeType: value })}>
          <SelectTrigger className="rounded-md h-11">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Road">Road</SelectItem>
            <SelectItem value="Mountain">Mountain</SelectItem>
            <SelectItem value="Gravel">Gravel</SelectItem>
            <SelectItem value="Hybrid">Hybrid</SelectItem>
            <SelectItem value="Cyclocross">Cyclocross</SelectItem>
            <SelectItem value="Track">Track</SelectItem>
            <SelectItem value="BMX">BMX</SelectItem>
            <SelectItem value="Kids">Kids</SelectItem>
            <SelectItem value="Electric">Electric</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-900">Groupset <span className="text-gray-500 font-normal">(Optional)</span></label>
        <Input
          value={data.groupset || ''}
          onChange={(e) => onChange({ ...data, groupset: e.target.value })}
          placeholder="e.g., Shimano 105, SRAM Force"
          className="rounded-md h-11 text-base"
        />
      </div>
    </div>

      {/* Row 3: Wheel Size & Suspension */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-900">Wheel Size <span className="text-gray-500 font-normal">(Optional)</span></label>
          <Select value={data.wheelSize} onValueChange={(value) => onChange({ ...data, wheelSize: value })}>
            <SelectTrigger className="rounded-md h-11">
              <SelectValue placeholder="Select wheel size" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="700c">700c (Road)</SelectItem>
              <SelectItem value="650b">650b (27.5&quot;)</SelectItem>
              <SelectItem value="29&quot;">29&quot; (29er)</SelectItem>
              <SelectItem value="27.5&quot;">27.5&quot;</SelectItem>
              <SelectItem value="26&quot;">26&quot;</SelectItem>
              <SelectItem value="24&quot;">24&quot; (Kids)</SelectItem>
              <SelectItem value="20&quot;">20&quot; (BMX/Kids)</SelectItem>
              <SelectItem value="16&quot;">16&quot; (Kids)</SelectItem>
              <SelectItem value="12&quot;">12&quot; (Kids)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-900">Suspension <span className="text-gray-500 font-normal">(Optional)</span></label>
        <Select value={data.suspensionType} onValueChange={(value) => onChange({ ...data, suspensionType: value })}>
          <SelectTrigger className="rounded-md h-11">
            <SelectValue placeholder="Select suspension" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="None">None / Rigid</SelectItem>
            <SelectItem value="Front">Front Suspension</SelectItem>
            <SelectItem value="Full">Full Suspension</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    {/* Row 4: Colours */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-900">Primary Colour <span className="text-gray-500 font-normal">(Optional)</span></label>
        <Input
          value={data.colorPrimary || ''}
          onChange={(e) => onChange({ ...data, colorPrimary: e.target.value })}
          placeholder="e.g., Black, Red, Blue"
          className="rounded-md h-11 text-base"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-900">Secondary Colour <span className="text-gray-500 font-normal">(Optional)</span></label>
        <Input
          value={data.colorSecondary || ''}
          onChange={(e) => onChange({ ...data, colorSecondary: e.target.value })}
          placeholder="e.g., White, Silver"
          className="rounded-md h-11 text-base"
        />
      </div>
    </div>
  </div>
);

const PartSpecificFields = ({ data, onChange }: { data: QuickListingData; onChange: (data: QuickListingData) => void }) => (
  <div className="space-y-4 mt-5 pt-5 border-t border-gray-200">
    <h3 className="text-sm font-semibold text-gray-900">Part Details</h3>
    
    {/* Row 1: Part Type & Material */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-900">Part Type <span className="text-gray-500 font-normal">(Optional)</span></label>
        <Input
          value={data.partTypeDetail || ''}
          onChange={(e) => onChange({ ...data, partTypeDetail: e.target.value })}
          placeholder="e.g., Rear Derailleur, Crankset"
          className="rounded-md h-11 text-base"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-900">Material <span className="text-gray-500 font-normal">(Optional)</span></label>
        <Input
          value={data.material || ''}
          onChange={(e) => onChange({ ...data, material: e.target.value })}
          placeholder="e.g., Carbon, Aluminium, Steel"
          className="rounded-md h-11 text-base"
        />
      </div>
    </div>

    {/* Row 2: Weight */}
    <div className="space-y-2">
      <label className="text-sm font-semibold text-gray-900">Weight <span className="text-gray-500 font-normal">(Optional)</span></label>
      <div className="relative">
        <Input
          value={data.weight || ''}
          onChange={(e) => onChange({ ...data, weight: e.target.value })}
          placeholder="e.g., 250g, 1.2kg"
          className="rounded-md h-11 text-base pr-10"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">g</span>
      </div>
    </div>

    {/* Row 3: Compatibility */}
    <div className="space-y-2">
      <label className="text-sm font-semibold text-gray-900">Compatibility Notes <span className="text-gray-500 font-normal">(Optional)</span></label>
      <textarea
        value={data.compatibilityNotes || ''}
        onChange={(e) => onChange({ ...data, compatibilityNotes: e.target.value })}
        placeholder="e.g., Compatible with Shimano 11-speed, fits 68mm bottom bracket"
        rows={3}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
      />
    </div>
  </div>
);

const ApparelSpecificFields = ({ data, onChange }: { data: QuickListingData; onChange: (data: QuickListingData) => void }) => (
  <div className="space-y-4 mt-5 pt-5 border-t border-gray-200">
    <h3 className="text-sm font-semibold text-gray-900">Apparel Details</h3>
    
    {/* Row 1: Size & Gender Fit */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-900">Size <span className="text-gray-500 font-normal">(Optional)</span></label>
        <Select value={data.size} onValueChange={(value) => onChange({ ...data, size: value })}>
          <SelectTrigger className="rounded-md h-11">
            <SelectValue placeholder="Select size" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="XS">XS</SelectItem>
            <SelectItem value="S">S</SelectItem>
            <SelectItem value="M">M</SelectItem>
            <SelectItem value="L">L</SelectItem>
            <SelectItem value="XL">XL</SelectItem>
            <SelectItem value="XXL">XXL</SelectItem>
            <SelectItem value="XXXL">XXXL</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-500">For shoes, use the input field below to enter the size</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-900">Gender Fit <span className="text-gray-500 font-normal">(Optional)</span></label>
        <Select value={data.genderFit} onValueChange={(value) => onChange({ ...data, genderFit: value })}>
          <SelectTrigger className="rounded-md h-11">
            <SelectValue placeholder="Select fit" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Men's">Men&apos;s</SelectItem>
            <SelectItem value="Women's">Women&apos;s</SelectItem>
            <SelectItem value="Unisex">Unisex</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    {/* Row 2: Material */}
    <div className="space-y-2">
      <label className="text-sm font-semibold text-gray-900">Material <span className="text-gray-500 font-normal">(Optional)</span></label>
      <Input
        value={data.apparelMaterial || ''}
        onChange={(e) => onChange({ ...data, apparelMaterial: e.target.value })}
        placeholder="e.g., Merino Wool, Polyester, Gore-Tex"
        className="rounded-md h-11 text-base"
      />
    </div>
  </div>
);

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
  const [isMobile, setIsMobile] = React.useState(false);
  const [primaryImageIndex, setPrimaryImageIndex] = React.useState(0);
  const [showDetails, setShowDetails] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  // Track if we've already initialized from AI data to prevent overwriting user edits
  const hasInitializedFromAiRef = React.useRef(false);

  // Detect if on mobile
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Helper function to clean AI-generated text to be more professional
  const cleanAiText = (text: string | undefined | null): string | undefined => {
    if (!text) return undefined;
    
    // Remove uncertainty phrases
    let cleaned = text
      .replace(/^(maybe|possibly|likely|probably|perhaps|approximately|about|around)\s+/gi, '')
      .replace(/\s+(or so|ish|roughly)\s*$/gi, '')
      .replace(/\s+or\s+/gi, '/') // Convert "Small or Medium" to "Small/Medium"
      .trim();
    
    // Capitalize first letter of each word (for materials, colors, etc.)
    cleaned = cleaned
      .split(' ')
      .map(word => {
        // Handle hyphenated words and slashes
        if (word.includes('-') || word.includes('/')) {
          return word.split(/[-/]/).map(part => 
            part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
          ).join(word.includes('-') ? '-' : '/');
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
    
    return cleaned || undefined;
  };

  // Initialize quick data from props - ONLY ONCE when AI data first arrives
  // This prevents user edits from being overwritten by the original AI values
  React.useEffect(() => {
    // Skip if we've already initialized from AI data
    if (hasInitializedFromAiRef.current) {
      console.log('🎯 [QUICK LIST INIT] Skipping - already initialized from AI data');
      return;
    }
    
    // Check if we have actual meaningful AI data (not just empty props)
    // This is important because the component may render before the wizard loads sessionStorage data
    const hasMeaningfulData = quickListingData && (
      quickListingData.images?.length || 
      quickListingData.brand || 
      quickListingData.model ||
      quickListingData.title
    );
    
    if (!hasMeaningfulData) {
      console.log('🎯 [QUICK LIST INIT] Skipping - no meaningful AI data yet');
      return;
    }
    
    if (quickListingData) {
      // Mark as initialized so we don't overwrite user edits later
      hasInitializedFromAiRef.current = true;
      
      // Generate title from brand/model if not provided
      const generatedTitle = quickListingData.title || 
        [quickListingData.brand, quickListingData.model].filter(Boolean).join(' ') ||
        '';
      
      const metadata = quickListingData.structuredMetadata;
      
      console.log('🎯 [QUICK LIST INIT] ============ START ============');
      console.log('🎯 [QUICK LIST INIT] quickListingData:', quickListingData);
      console.log('🎯 [QUICK LIST INIT] metadata:', metadata);
      console.log('🎯 [QUICK LIST INIT] Direct bike fields from quickListingData:', {
        frameSize: quickListingData.frameSize,
        frameMaterial: quickListingData.frameMaterial,
        bikeType: quickListingData.bikeType,
        groupset: quickListingData.groupset,
        wheelSize: quickListingData.wheelSize,
        colorPrimary: quickListingData.colorPrimary,
        suspensionType: quickListingData.suspensionType,
      });
      console.log('🎯 [QUICK LIST INIT] Metadata bike fields:', {
        frameSize: metadata?.bike?.frame_size,
        frameMaterial: metadata?.bike?.frame_material,
        bikeType: metadata?.bike?.bike_type,
        groupset: metadata?.bike?.groupset,
        wheelSize: metadata?.bike?.wheel_size,
      });
      
      const initialQuickData = {
        ...quickListingData,
        title: generatedTitle,
        brand: quickListingData.brand,
        model: quickListingData.model,
        
        // Extract bike fields - try direct fields first (from smart upload), then from metadata
        frameSize: cleanAiText(quickListingData.frameSize || metadata?.bike?.frame_size),
        frameMaterial: cleanAiText(quickListingData.frameMaterial || metadata?.bike?.frame_material),
        bikeType: cleanAiText(quickListingData.bikeType || metadata?.bike?.bike_type),
        groupset: cleanAiText(quickListingData.groupset || metadata?.bike?.groupset),
        wheelSize: cleanAiText(quickListingData.wheelSize || metadata?.bike?.wheel_size),
        suspensionType: cleanAiText(quickListingData.suspensionType || metadata?.bike?.suspension_type),
        colorPrimary: cleanAiText(quickListingData.colorPrimary || metadata?.bike?.color_primary),
        colorSecondary: cleanAiText(quickListingData.colorSecondary || metadata?.bike?.color_secondary),
        bikeWeight: cleanAiText(quickListingData.bikeWeight || metadata?.bike?.bike_weight),
        
        // Extract part fields - try direct fields first (from smart upload), then from metadata
        partTypeDetail: cleanAiText(quickListingData.partTypeDetail || metadata?.part?.part_type_detail),
        material: cleanAiText(quickListingData.material || metadata?.part?.material),
        weight: cleanAiText(quickListingData.weight || metadata?.part?.weight),
        compatibilityNotes: quickListingData.compatibilityNotes || metadata?.part?.compatibility_notes,
        
        // Extract apparel fields - try direct fields first (from smart upload), then from metadata
        size: cleanAiText(quickListingData.size || metadata?.apparel?.size),
        genderFit: cleanAiText(quickListingData.genderFit || metadata?.apparel?.gender_fit),
        apparelMaterial: cleanAiText(quickListingData.apparelMaterial || metadata?.apparel?.apparel_material),
      };
      
      console.log('🎯 [QUICK LIST INIT] Cleaned bike fields for setQuickData:', {
        frameSize: initialQuickData.frameSize,
        frameMaterial: initialQuickData.frameMaterial,
        bikeType: initialQuickData.bikeType,
        groupset: initialQuickData.groupset,
        wheelSize: initialQuickData.wheelSize,
        colorPrimary: initialQuickData.colorPrimary,
        suspensionType: initialQuickData.suspensionType,
      });
      
      setQuickData(initialQuickData);
      
      // Find and set the correct primary image index
      if (quickListingData.images && quickListingData.images.length > 0) {
        const primaryIdx = quickListingData.images.findIndex((img: any) => img.isPrimary);
        if (primaryIdx > 0) {
          setPrimaryImageIndex(primaryIdx);
          console.log('🖼️ [QUICK LIST INIT] Set primaryImageIndex to:', primaryIdx);
        }
      }
      
      console.log('🎯 [QUICK LIST INIT] setQuickData completed');
      console.log('🎯 [QUICK LIST INIT] ============ END ============');
    }
  }, [quickListingData]);

  const hasAiData = quickListingData && (quickListingData.images?.length || quickListingData.brand || quickListingData.model);

  const handleQuickList = async () => {
    if (!onQuickList) return;
    setIsPublishing(true);
    try {
      console.log('🔍 [STEP1] ====== HANDLE QUICK LIST START ======');
      console.log('🔍 [STEP1] primaryImageIndex state:', primaryImageIndex);
      console.log('🔍 [STEP1] quickData:', JSON.stringify({
        title: quickData.title,
        brand: quickData.brand,
        imagesCount: quickData.images?.length,
      }));
      console.log('🔍 [STEP1] quickData.images count:', quickData.images?.length);
      console.log('🔍 [STEP1] quickData.images full array:', JSON.stringify(quickData.images?.map((img, idx) => ({
        idx,
        id: img.id,
        order: img.order,
        isPrimary: img.isPrimary,
        cardUrl: img.cardUrl?.substring(70, 130),
      }))));
      
      // Log original images before any processing
      quickData.images?.forEach((img, idx) => {
        console.log(`🔍 [STEP1] ORIGINAL images[${idx}]:`, {
          id: img.id,
          order: img.order,
          isPrimary: img.isPrimary,
          'typeof isPrimary': typeof img.isPrimary,
          cardUrl: img.cardUrl?.substring(70, 130),
        });
      });
      
      // Reorder images: move primary to front and update order fields
      const images = quickData.images || [];
      let reorderedImages = [...images]; // Create a copy
      
      if (images.length > 0 && primaryImageIndex !== 0) {
        // Move the selected primary image to the front
        const primaryImage = images[primaryImageIndex];
        const otherImages = images.filter((_, i) => i !== primaryImageIndex);
        reorderedImages = [primaryImage, ...otherImages];
        console.log('🔍 [STEP1] Reordered images - moved index', primaryImageIndex, 'to front');
        console.log('🔍 [STEP1] Primary image cardUrl:', primaryImage?.cardUrl?.substring(0, 60));
      } else {
        console.log('🔍 [STEP1] No reordering needed - primaryImageIndex:', primaryImageIndex);
      }
      
      // Update order and isPrimary for all images - ENSURE isPrimary is explicitly boolean
      const updatedImages = reorderedImages.map((img, index) => ({
        ...img,
        order: index,
        isPrimary: index === 0 ? true : false, // Explicit boolean assignment
      }));
      
      console.log('🔍 [STEP1] ====== UPDATED IMAGES (to be sent) ======');
      updatedImages.forEach((img, idx) => {
        console.log(`🔍 [STEP1] UPDATED images[${idx}]:`, {
          id: img.id,
          order: img.order,
          isPrimary: img.isPrimary,
          'typeof isPrimary': typeof img.isPrimary,
          cardUrl: img.cardUrl?.substring(0, 60),
        });
      });
      
      // Get the primary image URL (now always at index 0)
      const primaryImageUrl = updatedImages[0]?.cardUrl || updatedImages[0]?.url;
      console.log('🔍 [STEP1] primaryImageUrl:', primaryImageUrl?.substring(0, 80));
      
      // Verify only one image has isPrimary = true
      const primaryCount = updatedImages.filter(img => img.isPrimary === true).length;
      console.log('🔍 [STEP1] Count of images with isPrimary=true:', primaryCount);
      
      await onQuickList({
        ...quickData,
        images: updatedImages,
        primaryImageUrl: primaryImageUrl,
      });
      
      console.log('🔍 [STEP1] ====== HANDLE QUICK LIST END ======');
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
    
    // Update primaryImageIndex to stay in sync
    if (indexToRemove === primaryImageIndex) {
      // If we removed the primary image, reset to first image
      setPrimaryImageIndex(0);
    } else if (indexToRemove < primaryImageIndex) {
      // If we removed an image before the primary, adjust the index
      setPrimaryImageIndex(primaryImageIndex - 1);
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

  // With AI data - show mobile-optimized or desktop layout
  // Mobile view - card-style layout
  if (isMobile && listingMode === 'quick') {
    const isBike = quickData.itemType === 'bike';
    const isPart = quickData.itemType === 'part';
    const isApparel = quickData.itemType === 'apparel';

    return (
      <div className="min-h-screen bg-gray-50 pb-32">
        {/* Photo Gallery */}
        <div className="relative aspect-square bg-gray-100">
          {quickData.images && quickData.images.length > 0 ? (
            <Image
              src={quickData.images[primaryImageIndex]?.url || quickData.images[0].url}
              alt="Product"
              fill
              className="object-contain"
              priority
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3">
              <Camera className="h-12 w-12 text-gray-300" />
              <p className="text-sm text-gray-400">No photos yet</p>
            </div>
          )}
          
          {/* Photo count badge */}
          {quickData.images && quickData.images.length > 0 && (
            <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5">
              <span className="text-xs font-medium text-white">{quickData.images.length} photos</span>
            </div>
          )}
          
          {/* Cover photo indicator */}
          {quickData.images && quickData.images.length > 0 && (
            <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-1 bg-[#FFC72C] rounded-md">
              <Star className="h-3 w-3 text-gray-900 fill-gray-900" />
              <span className="text-xs font-semibold text-gray-900">Cover</span>
            </div>
          )}
        </div>

        {/* Thumbnail Strip */}
        {quickData.images && quickData.images.length > 1 && (
          <div className="flex gap-2 p-3 border-b border-gray-200 overflow-x-auto bg-white">
            {quickData.images.map((image, index) => (
              <button
                key={image.id || index}
                onClick={() => setPrimaryImageIndex(index)}
                className={cn(
                  "relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors",
                  index === primaryImageIndex
                    ? "border-[#FFC72C] ring-2 ring-[#FFC72C]/30"
                    : "border-gray-200"
                )}
              >
                <Image
                  src={image.url}
                  alt={`Photo ${index + 1}`}
                  fill
                  className="object-cover"
                />
                {/* Cover photo indicator */}
                {index === primaryImageIndex && (
                  <div className="absolute bottom-0 left-0 right-0 bg-[#FFC72C] py-0.5">
                    <span className="text-[8px] font-semibold text-gray-900 block text-center">COVER</span>
                  </div>
                )}
              </button>
            ))}
            {/* Add more button */}
            {quickData.images.length < 10 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingPhotos}
                className="flex-shrink-0 w-14 h-14 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center"
              >
                {isUploadingPhotos ? (
                  <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                ) : (
                  <Upload className="h-5 w-5 text-gray-400" />
                )}
              </button>
            )}
          </div>
        )}
        
        {/* Hint text for cover photo selection */}
        {quickData.images && quickData.images.length > 1 && (
          <p className="text-[10px] text-gray-400 text-center -mt-1 pb-2 bg-white">
            Tap any photo to set as cover
          </p>
        )}

        {/* Form Fields */}
        <div className="p-4 space-y-4 bg-white">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
            <Input
              value={quickData.title || ''}
              onChange={(e) => setQuickData({ ...quickData, title: e.target.value })}
              className={cn(
                "rounded-xl h-11 text-base",
                !quickData.title && "border-red-500 focus:border-red-500 focus:ring-red-500"
              )}
              placeholder="Product name"
            />
          </div>

          {/* Price & Condition Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Price (AUD) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <Input
                  type="number"
                  value={quickData.price || ''}
                  onChange={(e) => setQuickData({ ...quickData, price: parseInt(e.target.value) || undefined })}
                  className={cn(
                    "pl-7 rounded-xl h-11 text-base",
                    !quickData.price && "border-red-500 focus:border-red-500 focus:ring-red-500"
                  )}
                  placeholder="0"
                  min="0"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Condition *</label>
              <Select
                value={quickData.conditionRating}
                onValueChange={(value) => setQuickData({ ...quickData, conditionRating: value as ConditionRating })}
              >
                <SelectTrigger className={cn(
                  "rounded-xl h-11",
                  !quickData.conditionRating && "border-red-500 focus:border-red-500 focus:ring-red-500"
                )}>
                  <SelectValue placeholder="Select..." />
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

          {/* Brand & Model Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Brand</label>
              <Input
                value={quickData.brand || ''}
                onChange={(e) => setQuickData({ ...quickData, brand: e.target.value })}
                className="rounded-xl h-11 text-base"
                placeholder="Brand"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Model</label>
              <Input
                value={quickData.model || ''}
                onChange={(e) => setQuickData({ ...quickData, model: e.target.value })}
                className="rounded-xl h-11 text-base"
                placeholder="Model"
              />
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
            <Select
              value={quickData.itemType || 'bike'}
              onValueChange={(value) => setQuickData({ ...quickData, itemType: value as ItemType })}
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

          {/* Location */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Location *</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={quickData.pickupLocation || ''}
                onChange={(e) => setQuickData({ ...quickData, pickupLocation: e.target.value })}
                className={cn(
                  "pl-10 rounded-xl h-11 text-base",
                  !quickData.pickupLocation && "border-red-500 focus:border-red-500 focus:ring-red-500"
                )}
                placeholder="Suburb or area"
              />
            </div>
          </div>

          {/* Description - Product description */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description *</label>
            <Textarea
              value={quickData.description || ''}
              onChange={(e) => setQuickData({ ...quickData, description: e.target.value, conditionDetails: e.target.value })}
              className={cn(
                "rounded-xl resize-none text-base",
                !quickData.description && "border-red-500 focus:border-red-500 focus:ring-red-500"
              )}
              rows={3}
              placeholder="Product description - features, specs, what it is..."
            />
          </div>

          {/* Notes - Seller notes */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes <span className="text-gray-400">(Optional)</span></label>
            <Textarea
              value={quickData.sellerNotes || ''}
              onChange={(e) => setQuickData({ ...quickData, sellerNotes: e.target.value })}
              className="rounded-xl resize-none text-base"
              rows={2}
              placeholder="Your notes - condition, wear, why selling..."
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
                    {isBike && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Frame Size</label>
                            <Input
                              value={quickData.frameSize || ''}
                              onChange={(e) => setQuickData({ ...quickData, frameSize: e.target.value })}
                              className="rounded-xl h-11 text-base"
                              placeholder="Medium"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Material</label>
                            <Input
                              value={quickData.frameMaterial || ''}
                              onChange={(e) => setQuickData({ ...quickData, frameMaterial: e.target.value })}
                              className="rounded-xl h-11 text-base"
                              placeholder="Carbon"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Groupset</label>
                            <Input
                              value={quickData.groupset || ''}
                              onChange={(e) => setQuickData({ ...quickData, groupset: e.target.value })}
                              className="rounded-xl h-11 text-base"
                              placeholder="Shimano"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Wheels</label>
                            <Input
                              value={quickData.wheelSize || ''}
                              onChange={(e) => setQuickData({ ...quickData, wheelSize: e.target.value })}
                              className="rounded-xl h-11 text-base"
                              placeholder='29"'
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Colour</label>
                          <Input
                            value={quickData.colorPrimary || ''}
                            onChange={(e) => setQuickData({ ...quickData, colorPrimary: e.target.value })}
                            className="rounded-xl h-11 text-base"
                            placeholder="Black"
                          />
                        </div>
                      </>
                    )}

                    {/* Part-Specific Fields */}
                    {isPart && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Part Type</label>
                          <Input
                            value={quickData.partTypeDetail || ''}
                            onChange={(e) => setQuickData({ ...quickData, partTypeDetail: e.target.value })}
                            className="rounded-xl h-11 text-base"
                            placeholder="e.g., Rear Derailleur"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Compatibility</label>
                          <Textarea
                            value={quickData.compatibilityNotes || ''}
                            onChange={(e) => setQuickData({ ...quickData, compatibilityNotes: e.target.value })}
                            className="rounded-xl resize-none text-base"
                            rows={2}
                            placeholder="Compatible with..."
                          />
                        </div>
                      </>
                    )}

                    {/* Apparel-Specific Fields */}
                    {isApparel && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Size</label>
                          <Input
                            value={quickData.size || ''}
                            onChange={(e) => setQuickData({ ...quickData, size: e.target.value })}
                            className="rounded-xl h-11 text-base"
                            placeholder="Medium"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Fit</label>
                          <Select
                            value={quickData.genderFit || ''}
                            onValueChange={(value) => setQuickData({ ...quickData, genderFit: value })}
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
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handlePhotoUpload}
          className="hidden"
        />

        {/* Fixed Bottom Actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-40">
          <Button
            onClick={handleQuickList}
            disabled={!quickData.title || !quickData.price || !quickData.pickupLocation || !quickData.conditionRating || !quickData.description || isPublishing}
            className="w-full rounded-xl h-12 bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-semibold disabled:opacity-40"
          >
            {isPublishing ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <Zap className="h-5 w-5 mr-2" />
                Publish Listing
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Desktop view - show tabbed interface
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
            "flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap",
            listingMode === 'quick'
              ? "text-gray-800 bg-white shadow-sm"
              : "text-gray-600 hover:bg-gray-200/70"
          )}
        >
          <Zap className="h-3.5 w-3.5 sm:h-[15px] sm:w-[15px]" />
          <span className="hidden xs:inline">Quick List</span>
          <span className="xs:hidden">Quick</span>
        </button>
        <button
          onClick={() => setListingMode('comprehensive')}
          className={cn(
            "flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap",
            listingMode === 'comprehensive'
              ? "text-gray-800 bg-white shadow-sm"
              : "text-gray-600 hover:bg-gray-200/70"
          )}
        >
          <Bike className="h-3.5 w-3.5 sm:h-[15px] sm:w-[15px]" />
          <span className="hidden xs:inline">Comprehensive Listing</span>
          <span className="xs:hidden">Complete</span>
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

            {/* Item Type Selector */}
            <div className="bg-white rounded-md border border-gray-200 p-4 lg:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Item Category</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Change if AI detected the wrong type</p>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setQuickData({ ...quickData, itemType: 'bike' })}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-md border-2 transition-all",
                    quickData.itemType === 'bike'
                      ? "border-gray-900 bg-gray-50"
                      : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  <Bike className={cn("h-6 w-6", quickData.itemType === 'bike' ? "text-gray-900" : "text-gray-400")} />
                  <span className={cn("text-sm font-medium", quickData.itemType === 'bike' ? "text-gray-900" : "text-gray-600")}>
                    Bicycle
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setQuickData({ ...quickData, itemType: 'part' })}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-md border-2 transition-all",
                    quickData.itemType === 'part'
                      ? "border-gray-900 bg-gray-50"
                      : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  <Wrench className={cn("h-6 w-6", quickData.itemType === 'part' ? "text-gray-900" : "text-gray-400")} />
                  <span className={cn("text-sm font-medium", quickData.itemType === 'part' ? "text-gray-900" : "text-gray-600")}>
                    Part
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setQuickData({ ...quickData, itemType: 'apparel' })}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-md border-2 transition-all",
                    quickData.itemType === 'apparel'
                      ? "border-gray-900 bg-gray-50"
                      : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  <ShoppingBag className={cn("h-6 w-6", quickData.itemType === 'apparel' ? "text-gray-900" : "text-gray-400")} />
                  <span className={cn("text-sm font-medium", quickData.itemType === 'apparel' ? "text-gray-900" : "text-gray-600")}>
                    Apparel
                  </span>
                </button>
              </div>
            </div>

            {/* Main Form Area - White box on desktop only */}
            <div className="lg:bg-white lg:rounded-md lg:border lg:border-gray-200 lg:p-6">
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
                    className={cn(
                      "rounded-md h-11 text-base",
                      !quickData.title && "border-red-500 focus:border-red-500 focus:ring-red-500"
                    )}
                  />
                </div>

                {/* Brand & Model Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Brand */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-900">Brand <span className="text-gray-500 font-normal">(Optional)</span></label>
                    <Input
                      value={quickData.brand || ''}
                      onChange={(e) => setQuickData({ ...quickData, brand: e.target.value })}
                      placeholder="e.g., Trek, Specialized"
                      className="rounded-md h-11 text-base"
                    />
                  </div>

                  {/* Model */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-900">Model <span className="text-gray-500 font-normal">(Optional)</span></label>
                    <Input
                      value={quickData.model || ''}
                      onChange={(e) => setQuickData({ ...quickData, model: e.target.value })}
                      placeholder="e.g., Domane SL6"
                      className="rounded-md h-11 text-base"
                    />
                  </div>
                </div>

                {/* Category-Specific Fields */}
                {quickData.itemType === 'bike' && (
                  <BikeSpecificFields data={quickData} onChange={setQuickData} />
                )}

                {quickData.itemType === 'part' && (
                  <PartSpecificFields data={quickData} onChange={setQuickData} />
                )}

                {quickData.itemType === 'apparel' && (
                  <ApparelSpecificFields data={quickData} onChange={setQuickData} />
                )}

                {/* Description - Product description */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-900">Description *</label>
                  <textarea
                    value={quickData.description || ''}
                    onChange={(e) => setQuickData({ ...quickData, description: e.target.value, conditionDetails: e.target.value })}
                    placeholder="Product description - features, specs, what it is..."
                    rows={4}
                    className={cn(
                      "w-full px-3 py-2.5 border rounded-md text-sm focus:outline-none focus:ring-2 resize-none",
                      !quickData.description
                        ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                        : "border-gray-300 focus:ring-gray-900 focus:border-transparent"
                    )}
                  />
                </div>

                {/* Notes - Seller notes */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-900">Notes <span className="text-gray-400 font-normal">(Optional)</span></label>
                  <textarea
                    value={quickData.sellerNotes || ''}
                    onChange={(e) => setQuickData({ ...quickData, sellerNotes: e.target.value })}
                    placeholder="Your notes - condition, wear, why selling..."
                    rows={2}
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
                        className={cn(
                          "pl-9 rounded-md h-11 text-base",
                          !quickData.price && "border-red-500 focus:border-red-500 focus:ring-red-500"
                        )}
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
                      <SelectTrigger className={cn(
                        "rounded-md h-11",
                        !quickData.conditionRating && "border-red-500 focus:border-red-500 focus:ring-red-500"
                      )}>
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
                      className={cn(
                        "pl-10 rounded-md h-11 text-base",
                        !quickData.pickupLocation && "border-red-500 focus:border-red-500 focus:ring-red-500"
                      )}
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
                    <div className="relative aspect-[4/3] rounded-xl overflow-hidden border-2 border-[#FFC72C] bg-gray-50 shadow-sm group">
                      <Image
                        src={quickData.images[primaryImageIndex]?.url || quickData.images[0].url}
                        alt="Cover photo"
                        width={400}
                        height={300}
                        className="w-full h-full object-cover"
                      />
                      {/* Cover badge */}
                      <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 bg-[#FFC72C] rounded-md">
                        <Star className="h-3 w-3 text-gray-900 fill-gray-900" />
                        <span className="text-xs font-semibold text-gray-900">Cover Photo</span>
                      </div>
                      <button
                        onClick={() => handleRemovePhoto(primaryImageIndex)}
                        className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3.5 w-3.5 text-white" />
                      </button>
                    </div>
                    
                    {/* Thumbnail Grid - All images for selection */}
                    <div className="space-y-1.5">
                      <p className="text-xs text-gray-500">Click any image to set as cover photo</p>
                      <div className="grid grid-cols-4 gap-2">
                        {quickData.images.map((image, index) => (
                          <div 
                            key={image.id || index} 
                            className={cn(
                              "relative aspect-square rounded-md overflow-hidden bg-gray-50 group cursor-pointer transition-all",
                              index === primaryImageIndex
                                ? "ring-2 ring-[#FFC72C] ring-offset-1"
                                : "border border-gray-200 hover:border-gray-400"
                            )}
                            onClick={() => setPrimaryImageIndex(index)}
                          >
                            <Image
                              src={image.url}
                              alt={`Photo ${index + 1}`}
                              width={100}
                              height={100}
                              className="w-full h-full object-cover"
                            />
                            {/* Cover indicator on thumbnail */}
                            {index === primaryImageIndex && (
                              <div className="absolute bottom-0 left-0 right-0 bg-[#FFC72C] py-0.5">
                                <span className="text-[8px] font-semibold text-gray-900 block text-center">COVER</span>
                              </div>
                            )}
                            {/* Set as cover button on hover for non-primary */}
                            {index !== primaryImageIndex && (
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="text-[9px] font-medium text-white bg-white/20 px-1.5 py-0.5 rounded">Set Cover</span>
                              </div>
                            )}
                            {/* Delete button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemovePhoto(index);
                              }}
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
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  onClick={handleQuickList}
                  disabled={!quickData.title || !quickData.price || !quickData.pickupLocation || !quickData.conditionRating || !quickData.description || isPublishing}
                  size="lg"
                  className="rounded-md bg-gray-900 hover:bg-gray-800 text-white px-6 h-11 flex-1 sm:flex-none"
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

