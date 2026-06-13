"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { LayoutList, Wand2 } from "lucide-react";
import { useListingForm } from "@/lib/hooks/use-listing-form";
import { UploadMethodChoice } from "./upload-method-choice";
import { SmartUploadFlow } from "./smart-upload-flow";
import { FacebookImportFlow } from "./facebook-import-flow";
import { BulkUploadSheet } from "./bulk-upload-sheet";
import { QuickUploadSheet } from "./quick-upload-sheet";
import { readSingleItemPhotoDraft } from "./single-item-photo-draft";
import { WizardNavigation } from "./wizard-navigation";
import { Step1ItemType } from "./step-1-item-type";
// New granular step components
import { Step2BasicInfo } from "./step-2-basic-info";
import { Step3FrameDetails } from "./step-3-frame-details";
import { Step3Specifications } from "./step-3-specifications";
import { Step4Components } from "./step-4-components";
import { Step4Compatibility } from "./step-4-compatibility";
import { Step5ConditionRating } from "./step-5-condition-rating";
import { Step6ConditionDetails } from "./step-6-condition-details";
import { Step7Photos } from "./step-7-photos";
import { Step8PurchaseHistory } from "./step-8-purchase-history";
import { Step9ServiceUpgrades } from "./step-9-service-upgrades";
import { Step10Pricing } from "./step-10-pricing";
import { Step11Delivery } from "./step-11-delivery";
import { Step12Contact } from "./step-12-contact";
// Legacy components for parts/apparel (will use new components where applicable)
import { Step2BPartDetails } from "./step-2b-part-details";
import { Step2CApparelDetails } from "./step-2c-apparel-details";
import { Step7Review } from "./step-7-review";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { useAuthModal } from "@/components/providers/auth-modal-provider";
import { buildListingFormDataFromAnalysis } from "@/lib/marketplace/listing-analysis-form-data";
import { AiRedoDialog } from "@/app/marketplace/sell-redesign/_components/ai-redo-dialog";
import {
  validateItemType,
  validateBikeDetails,
  validatePartDetails,
  validateApparelDetails,
  validateCondition,
  validatePhotos,
  validateHistory,
  validatePricing,
  ValidationError,
} from "@/lib/validation/listing-validation";

// ============================================================
// Main Sell Wizard Component
// ============================================================

export function SellWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams?.get('mode'); // guided, form, smart, facebook, bulk, or null
  const hasAiData = searchParams?.get('ai') === 'true';
  const draftId = searchParams?.get('draftId') || undefined;
  const textUploadToken = searchParams?.get('textUploadToken') || undefined;
  const { user, loading: authLoading } = useAuth();
  const { openAuthModal } = useAuthModal();
  
  const {
    formData,
    currentStep,
    lastSaved,
    updateFormData,
    setItemType,
    nextStep,
    previousStep,
    goToStep,
    saveDraft,
    clearDraft,
  } = useListingForm(undefined, draftId);

  const [errors, setErrors] = React.useState<ValidationError[]>([]);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [textUploadLoading, setTextUploadLoading] = React.useState(false);
  const [textUploadError, setTextUploadError] = React.useState<string | null>(null);
  const [redoOpen, setRedoOpen] = React.useState(false);
  const [redoing, setRedoing] = React.useState(false);
  const [redoError, setRedoError] = React.useState<string | null>(null);
  const loadedTextUploadTokenRef = React.useRef<string | null>(null);
  // Don't show method choice if we have a draftId (loading existing draft)
  const [showMethodChoice, setShowMethodChoice] = React.useState(!mode && !hasAiData && !draftId);

  // Re-evaluate when the mode param changes via client navigation
  // (e.g. closing the quick upload sheet returns to /marketplace/sell).
  React.useEffect(() => {
    setShowMethodChoice(!mode && !hasAiData && !draftId);
  }, [mode, hasAiData, draftId]);

  // Quick listing handler - publish with minimal details
  const handleQuickList = async (quickData: any) => {
    try {
      // Get images - already reordered and with correct order/isPrimary from step-1
      const rawImages = quickData.images || formData.images || [];
      
      // SAFEGUARD: Ensure isPrimary is correctly set based on order field
      // The image with order=0 should be isPrimary=true, all others isPrimary=false
      const images = rawImages.map((img: any) => ({
        ...img,
        isPrimary: img.order === 0,  // Explicitly set based on order
      }));
      
      console.log('🔍 [QUICK LIST] ====== QUICK LIST HANDLER (WIZARD) ======');
      console.log('🔍 [QUICK LIST] RAW images before safeguard:', rawImages.map((img: any, idx: number) => ({
        idx,
        id: img.id,
        order: img.order,
        isPrimary: img.isPrimary,
      })));
      console.log('🔍 [QUICK LIST] FIXED images after safeguard:', images.map((img: any, idx: number) => ({
        idx,
        id: img.id,
        order: img.order,
        isPrimary: img.isPrimary,
      })));
      
      // Use primaryImageUrl from quickData (set by step-1) or calculate from images
      let primaryImageUrl: string | undefined = quickData.primaryImageUrl;
      
      if (!primaryImageUrl && images.length > 0) {
        // Fallback: Find primary image URL from images array (order=0)
        const primaryImage = images.find((img: any) => img.order === 0) || images[0];
        primaryImageUrl = primaryImage?.cardUrl || primaryImage?.url;
      }
      
      console.log('🔍 [QUICK LIST] quickData.primaryImageUrl:', quickData.primaryImageUrl);
      console.log('🔍 [QUICK LIST] Final primaryImageUrl:', primaryImageUrl);
      console.log('🔍 [QUICK LIST] Images count:', images.length);
      console.log('🔍 [QUICK LIST] Images source:', quickData.images ? 'quickData.images' : 'formData.images');
      images.forEach((img: any, idx: number) => {
        console.log(`🔍 [QUICK LIST] images[${idx}]:`, {
          id: img.id,
          order: img.order,
          isPrimary: img.isPrimary,
          'typeof isPrimary': typeof img.isPrimary,
          cardUrl: img.cardUrl?.substring(70, 130),
        });
      });
      
      // Count primary images
      const primaryCount = images.filter((img: any) => img.isPrimary === true).length;
      console.log('🔍 [QUICK LIST] Count of images with isPrimary===true:', primaryCount);
      
      // Find the primary image
      const primaryImage = images.find((img: any) => img.isPrimary === true);
      console.log('🔍 [QUICK LIST] Primary image found:', primaryImage ? {
        id: primaryImage.id,
        order: primaryImage.order,
        cardUrl: primaryImage.cardUrl?.substring(70, 130),
      } : 'NONE!');
      
      // Build the listing data for quick publish
      // Map itemType to marketplace_category
      // IMPORTANT: Determine category based on which fields are filled
      let itemType = quickData.itemType || formData.itemType;
      
      // Fallback: Infer from filled fields if itemType not set
      if (!itemType) {
        if (quickData.frameSize || quickData.groupset || quickData.wheelSize || quickData.frameMaterial) {
          itemType = 'bike';
        } else if (quickData.partTypeDetail || quickData.compatibilityNotes) {
          itemType = 'part';
        } else if (quickData.size || quickData.genderFit || quickData.apparelMaterial) {
          itemType = 'apparel';
        } else {
          itemType = 'bike'; // Ultimate fallback
        }
      }
      
      const categoryMap = {
        'bike': 'Bicycles',
        'part': 'Parts',
        'apparel': 'Apparel'
      } as const;
      const marketplace_category = categoryMap[itemType as keyof typeof categoryMap];
      
      const listingData = {
        // Basic required fields
        title: quickData.title || [quickData.brand, quickData.model].filter(Boolean).join(' '),
        description: quickData.title || [quickData.brand, quickData.model].filter(Boolean).join(' '), // Legacy field - stores title
        productDescription: quickData.productDescription || '', // AI-generated product description (features, specs)
        sellerNotes: quickData.sellerNotes || '', // Seller's personal notes about condition, wear, why selling
        price: quickData.price,
        conditionRating: quickData.conditionRating || 'Good',
        
        // Item type and marketplace category
        itemType: itemType,
        marketplace_category: marketplace_category,
        
        // Images - ensure primary is set
        images: images,
        primaryImageUrl: primaryImageUrl,
        
        // Set listing status to active
        listingStatus: 'active',
        publishedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        
        // Optional fields
        brand: quickData.brand,
        model: quickData.model,
        modelYear: quickData.modelYear,
        pickupLocation: quickData.pickupLocation,
        
        // Bike-specific fields
        frameSize: quickData.frameSize,
        frameMaterial: quickData.frameMaterial,
        bikeType: quickData.bikeType,
        groupset: quickData.groupset,
        wheelSize: quickData.wheelSize,
        suspensionType: quickData.suspensionType,
        colorPrimary: quickData.colorPrimary,
        colorSecondary: quickData.colorSecondary,
        bikeWeight: quickData.bikeWeight,
        
        // Part-specific fields
        partTypeDetail: quickData.partTypeDetail,
        material: quickData.material,
        weight: quickData.weight,
        compatibilityNotes: quickData.compatibilityNotes,
        
        // Apparel-specific fields
        size: quickData.size,
        genderFit: quickData.genderFit,
        apparelMaterial: quickData.apparelMaterial,
        
        // Shipping options
        shippingAvailable: quickData.shippingAvailable || false,
        shippingCost: quickData.shippingAvailable ? (quickData.shippingCost || 0) : null,
        pickupOnly: !quickData.shippingAvailable && quickData.pickupAvailable !== false,
      };

      console.log('🚀 [QUICK LIST] Publishing with data:', listingData);
      console.log('🖼️ [QUICK LIST] primaryImageUrl being published:', primaryImageUrl);
      console.log('🖼️ [QUICK LIST] images being published:', images);
      console.log('🖼️ [QUICK LIST] Primary image found:', images.find((img: any) => img.isPrimary));

      const response = await fetch('/api/marketplace/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(listingData),
      });

      if (response.ok) {
        const { listing } = await response.json();
        window.location.href = `/marketplace/product/${listing.id}?fromUpload=true`;
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create listing');
      }
    } catch (err: any) {
      console.error('❌ [QUICK LIST] Error:', err);
      alert(err.message || 'Failed to publish listing. Please try again.');
    }
  };

  // Debug logging
  React.useEffect(() => {
    console.log('🎯 [WIZARD DEBUG] mode:', mode);
    console.log('🎯 [WIZARD DEBUG] hasAiData:', hasAiData);
    console.log('🎯 [WIZARD DEBUG] draftId:', draftId);
    console.log('🎯 [WIZARD DEBUG] textUploadToken:', textUploadToken);
    console.log('🎯 [WIZARD DEBUG] currentStep:', currentStep);
    console.log('🎯 [WIZARD DEBUG] showMethodChoice:', showMethodChoice);
    console.log('🎯 [WIZARD DEBUG] formData:', formData);
  }, [mode, hasAiData, draftId, textUploadToken, currentStep, showMethodChoice, formData]);

  // Check for Facebook import data from sessionStorage (from header modal)
  React.useEffect(() => {
    const storedData = sessionStorage.getItem('facebookImportData');
    if (storedData) {
      try {
        const { formData: importedFormData, images } = JSON.parse(storedData);
        console.log('🎯 [WIZARD] Found Facebook import data in sessionStorage:', importedFormData);
        
        // Clear the sessionStorage data so it doesn't get re-applied
        sessionStorage.removeItem('facebookImportData');
        
        // Update form data with imported data
        updateFormData({
          ...importedFormData,
        });
        
        // Navigate to step 1 (Item Type) so user starts from beginning
        goToStep(1);
        
        // Don't show method choice
        setShowMethodChoice(false);
      } catch (error) {
        console.error('🎯 [WIZARD] Error parsing Facebook import data:', error);
        sessionStorage.removeItem('facebookImportData');
      }
    }
  }, []); // Only run once on mount

  // Check for Smart Upload data from sessionStorage (from header modal)
  React.useEffect(() => {
    console.log('🔍 [WIZARD] ====== CHECKING SESSION STORAGE ======');
    const storedData = sessionStorage.getItem('smartUploadData');
    console.log('🔍 [WIZARD] sessionStorage.smartUploadData exists:', !!storedData);
    
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData);
        const { formData: importedFormData, imageUrls } = parsed;
        
        // Detailed logging for debugging
        console.log('🔍 [WIZARD] ====== READING FROM SESSION STORAGE ======');
        console.log('🔍 [WIZARD] RAW parsed data keys:', Object.keys(parsed));
        console.log('🔍 [WIZARD] importedFormData keys:', Object.keys(importedFormData || {}));
        console.log('🔍 [WIZARD] importedFormData.brand:', importedFormData?.brand);
        console.log('🔍 [WIZARD] importedFormData.model:', importedFormData?.model);
        console.log('🔍 [WIZARD] importedFormData.itemType:', importedFormData?.itemType);
        console.log('🔍 [WIZARD] importedFormData.conditionRating:', importedFormData?.conditionRating);
        console.log('🔍 [WIZARD] importedFormData.bikeType:', importedFormData?.bikeType);
        console.log('🔍 [WIZARD] importedFormData.frameSize:', importedFormData?.frameSize);
        console.log('🔍 [WIZARD] importedFormData.images count:', importedFormData?.images?.length);
        importedFormData?.images?.forEach((img: any, idx: number) => {
          console.log(`🔍 [WIZARD] images[${idx}]:`, {
            id: img.id,
            order: img.order,
            isPrimary: img.isPrimary,
            cardUrl: img.cardUrl,
            url: img.url?.substring(0, 80),
          });
        });
        console.log('🔍 [WIZARD] importedFormData.primaryImageUrl:', importedFormData?.primaryImageUrl);
        console.log('🔍 [WIZARD] imageUrls:', imageUrls);
        
        // Clear the sessionStorage data so it doesn't get re-applied
        sessionStorage.removeItem('smartUploadData');
        
        // Update form data with imported data (images are already included in formData)
        console.log('🔍 [WIZARD] Calling updateFormData with:', importedFormData);
        updateFormData({
          ...importedFormData,
        });
        
        // Navigate to step 1 (Item Type) so user starts from beginning
        goToStep(1);
        
        // Don't show method choice
        setShowMethodChoice(false);
      } catch (error) {
        console.error('🎯 [WIZARD] Error parsing Smart Upload data:', error);
        sessionStorage.removeItem('smartUploadData');
      }
    } else {
      console.log('🔍 [WIZARD] No smartUploadData in sessionStorage');
    }
  }, []); // Only run once on mount

  React.useEffect(() => {
    if (!textUploadToken) return;
    if (mode !== 'manual-legacy') return;
    if (authLoading) return;

    if (!user) {
      openAuthModal({ mode: "signin" });
      return;
    }

    if (loadedTextUploadTokenRef.current === textUploadToken) return;

    let cancelled = false;

    const loadTextUploadSession = async () => {
      setTextUploadLoading(true);
      setTextUploadError(null);

      try {
        const response = await fetch(
          `/api/marketplace/text-upload/sessions/${encodeURIComponent(textUploadToken)}`,
          { cache: "no-store" },
        );
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data?.formData) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "Could not load this text upload.",
          );
        }

        if (cancelled) return;

        loadedTextUploadTokenRef.current = textUploadToken;
        sessionStorage.removeItem("smartUploadData");
        updateFormData({ ...data.formData });
        goToStep(1);
        setShowMethodChoice(false);
      } catch (error) {
        if (!cancelled) {
          setTextUploadError(
            error instanceof Error
              ? error.message
              : "Could not load this text upload.",
          );
        }
      } finally {
        if (!cancelled) {
          setTextUploadLoading(false);
        }
      }
    };

    void loadTextUploadSession();

    return () => {
      cancelled = true;
    };
  }, [authLoading, goToStep, mode, openAuthModal, textUploadToken, updateFormData, user]);

  // Get total steps based on item type
  const getTotalSteps = () => {
    if (formData.itemType === "bike") return 13;
    if (formData.itemType === "part") return 11;
    if (formData.itemType === "apparel") return 11;
    return 13; // Default to bike flow
  };

  // Step labels for progress indicator (bikes - 13 steps)
  const bikeStepLabels = [
    "Item Type",      // 1
    "Basic Info",     // 2
    "Frame",          // 3
    "Components",     // 4
    "Condition",      // 5
    "Details",        // 6
    "Photos",         // 7
    "Purchase",       // 8
    "Service",        // 9
    "Pricing",        // 10
    "Delivery",       // 11
    "Contact",        // 12
    "Review",         // 13
  ];

  // Step labels for parts (11 steps)
  const partStepLabels = [
    "Item Type",      // 1
    "Basic Info",     // 2
    "Specifications", // 3
    "Compatibility",  // 4
    "Condition",      // 5
    "Details",        // 6
    "Photos",         // 7
    "Purchase",       // 8
    "Pricing",        // 9
    "Delivery",       // 10
    "Contact",        // 11
    "Review",         // 12 (maps to step 11 for parts)
  ];

  // Step labels for apparel (11 steps)
  const apparelStepLabels = [
    "Item Type",      // 1
    "Basic Info",     // 2
    "Sizing",         // 3
    "Details",        // 4
    "Condition",      // 5
    "Wear",           // 6
    "Photos",         // 7
    "Purchase",       // 8
    "Pricing",        // 9
    "Delivery",       // 10
    "Contact",        // 11
    "Review",         // 12 (maps to step 11 for apparel)
  ];

  const getStepLabels = () => {
    if (formData.itemType === "bike") return bikeStepLabels;
    if (formData.itemType === "part") return partStepLabels;
    if (formData.itemType === "apparel") return apparelStepLabels;
    return bikeStepLabels;
  };

  // Validate current step (now more granular)
  const validateCurrentStep = (): boolean => {
    let result;

    // Bike flow validation (13 steps)
    if (formData.itemType === "bike") {
    switch (currentStep) {
      case 1:
        result = validateItemType(formData.itemType);
        break;
        case 2: // Basic Info
          result = {
            isValid: !!(formData.brand && formData.model && formData.bikeType),
            errors: [
              ...(!formData.brand ? [{ field: "brand", message: "Brand is required" }] : []),
              ...(!formData.model ? [{ field: "model", message: "Model is required" }] : []),
              ...(!formData.bikeType ? [{ field: "bikeType", message: "Bike type is required" }] : []),
            ],
          };
          break;
        case 3: // Frame Details
          result = {
            isValid: !!(formData.frameSize && formData.frameMaterial),
            errors: [
              ...(!formData.frameSize ? [{ field: "frameSize", message: "Frame size is required" }] : []),
              ...(!formData.frameMaterial ? [{ field: "frameMaterial", message: "Frame material is required" }] : []),
            ],
          };
          break;
        case 4: // Components - optional, always valid
          result = { isValid: true, errors: [] };
          break;
        case 5: // Condition Rating
          result = {
            isValid: !!(formData.conditionRating && formData.conditionDetails && formData.conditionDetails.length >= 20),
            errors: [
              ...(!formData.conditionRating ? [{ field: "conditionRating", message: "Condition rating is required" }] : []),
              ...(!formData.conditionDetails ? [{ field: "conditionDetails", message: "Condition details are required" }] : []),
              ...(formData.conditionDetails && formData.conditionDetails.length < 20 ? [{ field: "conditionDetails", message: "Condition details must be at least 20 characters" }] : []),
            ],
          };
          break;
        case 6: // Condition Details - optional, always valid
          result = { isValid: true, errors: [] };
          break;
        case 7: // Photos
          console.log('🎯 [VALIDATION] Step 7 Photos (Bikes) - images count:', formData.images?.length || 0);
          console.log('🎯 [VALIDATION] Step 7 Photos (Bikes) - images:', formData.images);
          result = validatePhotos({
            images: formData.images || [],
            primaryImageUrl: formData.primaryImageUrl,
          });
          console.log('🎯 [VALIDATION] Step 7 Photos (Bikes) - result:', result);
          break;
        case 8: // Purchase History - optional, always valid
          result = validateHistory({
            purchaseLocation: formData.purchaseLocation,
            purchaseDate: formData.purchaseDate,
            originalRrp: formData.originalRrp,
            serviceHistory: formData.serviceHistory,
            upgradesModifications: formData.upgradesModifications,
          });
          break;
        case 9: // Service & Upgrades - optional, always valid
          result = { isValid: true, errors: [] };
          break;
        case 10: // Pricing
          result = {
            isValid: !!(formData.price && formData.price > 0),
            errors: [
              ...(!formData.price || formData.price <= 0 ? [{ field: "price", message: "Price is required" }] : []),
            ],
          };
          break;
        case 11: // Delivery
          result = {
            isValid: !!formData.pickupLocation,
            errors: [
              ...(!formData.pickupLocation ? [{ field: "pickupLocation", message: "Pickup location is required" }] : []),
            ],
          };
          break;
        case 12: // Contact
          result = validatePricing({
            price: formData.price,
            isNegotiable: formData.isNegotiable,
            pickupLocation: formData.pickupLocation,
            shippingAvailable: formData.shippingAvailable,
            shippingCost: formData.shippingCost,
            includedAccessories: formData.includedAccessories,
            sellerContactPreference: formData.sellerContactPreference,
            sellerPhone: formData.sellerPhone,
            sellerEmail: formData.sellerEmail,
          });
          break;
        default:
          result = { isValid: true, errors: [] };
      }
    } 
    // Part flow validation (11 steps, maps differently)
    else if (formData.itemType === "part") {
      switch (currentStep) {
        case 1:
          result = validateItemType(formData.itemType);
          break;
        case 2: // Basic Info for parts (using legacy component)
          result = validatePartDetails({
            title: formData.title,
            marketplace_subcategory: formData.marketplace_subcategory,
            partTypeDetail: formData.partTypeDetail,
            brand: formData.brand,
            model: formData.model,
            material: formData.material,
            colorPrimary: formData.colorPrimary,
            weight: formData.weight,
            compatibilityNotes: formData.compatibilityNotes,
          });
          break;
        case 3: // Specifications - optional
          result = { isValid: true, errors: [] };
          break;
        case 4: // Compatibility - optional
          result = { isValid: true, errors: [] };
          break;
        case 5: // Condition Rating
          result = {
            isValid: !!(formData.conditionRating && formData.conditionDetails && formData.conditionDetails.length >= 20),
            errors: [
              ...(!formData.conditionRating ? [{ field: "conditionRating", message: "Condition rating is required" }] : []),
              ...(!formData.conditionDetails ? [{ field: "conditionDetails", message: "Condition details are required" }] : []),
            ],
          };
          break;
        case 6: // Condition Details - optional
          result = { isValid: true, errors: [] };
          break;
        case 7: // Photos
          console.log('🎯 [VALIDATION] Step 7 Photos (Parts) - images count:', formData.images?.length || 0);
          result = validatePhotos({
            images: formData.images || [],
            primaryImageUrl: formData.primaryImageUrl,
          });
          console.log('🎯 [VALIDATION] Step 7 Photos (Parts) - result:', result);
          break;
        case 8: // Purchase History - optional
          result = { isValid: true, errors: [] };
          break;
        case 9: // Pricing (skip service for parts)
          result = {
            isValid: !!formData.price,
            errors: [
              ...(!formData.price ? [{ field: "price", message: "Price is required" }] : []),
            ],
          };
          break;
        case 10: // Delivery
          result = {
            isValid: !!formData.pickupLocation,
            errors: [
              ...(!formData.pickupLocation ? [{ field: "pickupLocation", message: "Pickup location is required" }] : []),
            ],
          };
          break;
        case 11: // Contact
          result = validatePricing({
            price: formData.price,
            isNegotiable: formData.isNegotiable,
            pickupLocation: formData.pickupLocation,
            shippingAvailable: formData.shippingAvailable,
            shippingCost: formData.shippingCost,
            includedAccessories: formData.includedAccessories,
            sellerContactPreference: formData.sellerContactPreference,
            sellerPhone: formData.sellerPhone,
            sellerEmail: formData.sellerEmail,
          });
          break;
        default:
          result = { isValid: true, errors: [] };
      }
    }
    // Apparel flow validation (11 steps, uses legacy component for now)
    else {
      switch (currentStep) {
        case 1:
          result = validateItemType(formData.itemType);
          break;
        case 2: // Basic Info for apparel (using legacy component)
          result = validateApparelDetails({
            title: formData.title,
            marketplace_subcategory: formData.marketplace_subcategory,
            brand: formData.brand,
            model: formData.model,
            size: formData.size,
            genderFit: formData.genderFit,
            colorPrimary: formData.colorPrimary,
            apparelMaterial: formData.apparelMaterial,
          });
          break;
        case 3: // Sizing - covered in step 2
        case 4: // Details - covered in step 2
          result = { isValid: true, errors: [] };
          break;
        case 5: // Condition Rating
          result = {
            isValid: !!(formData.conditionRating && formData.conditionDetails),
            errors: [
              ...(!formData.conditionRating ? [{ field: "conditionRating", message: "Condition rating is required" }] : []),
              ...(!formData.conditionDetails ? [{ field: "conditionDetails", message: "Condition details are required" }] : []),
            ],
          };
        break;
        case 6: // Wear - optional
          result = { isValid: true, errors: [] };
        break;
        case 7: // Photos
          console.log('🎯 [VALIDATION] Step 7 Photos (Apparel) - images count:', formData.images?.length || 0);
        result = validatePhotos({
          images: formData.images || [],
          primaryImageUrl: formData.primaryImageUrl,
        });
          console.log('🎯 [VALIDATION] Step 7 Photos (Apparel) - result:', result);
          break;
        case 8: // Purchase - optional
          result = { isValid: true, errors: [] };
          break;
        case 9: // Pricing
          result = {
            isValid: !!formData.price,
            errors: [
              ...(!formData.price ? [{ field: "price", message: "Price is required" }] : []),
            ],
          };
        break;
        case 10: // Delivery
          result = {
            isValid: !!formData.pickupLocation,
            errors: [
              ...(!formData.pickupLocation ? [{ field: "pickupLocation", message: "Pickup location is required" }] : []),
            ],
          };
        break;
        case 11: // Contact
        result = validatePricing({
          price: formData.price,
          isNegotiable: formData.isNegotiable,
          pickupLocation: formData.pickupLocation,
          shippingAvailable: formData.shippingAvailable,
          shippingCost: formData.shippingCost,
          includedAccessories: formData.includedAccessories,
          sellerContactPreference: formData.sellerContactPreference,
          sellerPhone: formData.sellerPhone,
          sellerEmail: formData.sellerEmail,
        });
        break;
      default:
        result = { isValid: true, errors: [] };
      }
    }

    setErrors(result.errors);
    return result.isValid;
  };

  const handleNext = () => {
    console.log('🎯 [WIZARD] handleNext called, currentStep:', currentStep);
    console.log('🎯 [WIZARD] itemType:', formData.itemType);
    
    const isValid = validateCurrentStep();
    console.log('🎯 [WIZARD] Validation result:', isValid);
    
    if (isValid) {
      if (currentStep === 1 && formData.itemType) {
        setItemType(formData.itemType);
      } else {
        // For apparel, steps 2-4 all show the same component
        // So skip from step 2 directly to step 5
        if (formData.itemType === "apparel" && currentStep === 2) {
          console.log('🎯 [WIZARD] Skipping apparel steps 3-4, going to step 5');
          goToStep(5);
        } else {
          console.log('🎯 [WIZARD] Advancing to next step from', currentStep, 'to', currentStep + 1);
        nextStep();
          console.log('🎯 [WIZARD] nextStep() called');
        }
      }
      setErrors([]);
      // Scroll to top of page so user sees new step
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      // Scroll to first error
      console.log('🎯 [WIZARD] Validation failed, scrolling to top');
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleBack = () => {
    previousStep();
    setErrors([]);
  };

  const handleSaveDraft = async () => {
    saveDraft();
    alert("Draft saved! You can continue editing later.");
  };

  const handlePublish = async () => {
    setIsPublishing(true);

    try {
      // TODO: Implement API call to create listing
      const response = await fetch("/api/marketplace/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          listingStatus: "active",
          publishedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
        }),
      });

      if (response.ok) {
        const { listing } = await response.json();
        clearDraft();
        router.push(`/marketplace?success=listing_published&id=${listing.id}`);
      } else {
        throw new Error("Failed to publish listing");
      }
    } catch (error) {
      console.error("Error publishing listing:", error);
      alert("Failed to publish listing. Please try again.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleRedoAiDetails = async (hint: string) => {
    type WizardImage = {
      url?: unknown;
      cardUrl?: unknown;
      mobileCardUrl?: unknown;
      thumbnailUrl?: unknown;
      galleryUrl?: unknown;
      detailUrl?: unknown;
    };
    const images: WizardImage[] = Array.isArray(formData.images)
      ? (formData.images as WizardImage[])
      : [];
    const imageUrls = images
      .map((image) => image.url)
      .filter((url: unknown): url is string => typeof url === "string" && url.length > 0);

    if (imageUrls.length === 0) return;

    setRedoing(true);
    setRedoError(null);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) throw new Error("You must be logged in to use AI analysis");

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analyze-listing-ai`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            imageUrls,
            userHints: {
              itemType: formData.itemType,
              text: `The previous AI result was for the wrong product. The seller says this item is: ${hint}`,
            },
          }),
        },
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.analysis) {
        throw new Error(
          typeof data?.error === "string" ? data.error : "AI analysis failed",
        );
      }

      const uploadedImages = images.map((image, index) => ({
        url: typeof image.url === "string" ? image.url : imageUrls[index],
        cardUrl: typeof image.cardUrl === "string" ? image.cardUrl : undefined,
        mobileCardUrl: typeof image.mobileCardUrl === "string" ? image.mobileCardUrl : undefined,
        thumbnailUrl: typeof image.thumbnailUrl === "string" ? image.thumbnailUrl : undefined,
        galleryUrl: typeof image.galleryUrl === "string" ? image.galleryUrl : undefined,
        detailUrl: typeof image.detailUrl === "string" ? image.detailUrl : undefined,
      }));

      updateFormData(
        buildListingFormDataFromAnalysis(data.analysis, imageUrls, uploadedImages),
      );
      goToStep(1);
      setRedoOpen(false);
    } catch (error) {
      setRedoError(error instanceof Error ? error.message : "Could not redo the AI details.");
    } finally {
      setRedoing(false);
    }
  };

  // Render current step (now handles different flows)
  const renderStep = () => {
    // Build quick listing data from AI-detected form data
    const quickListingData = {
      title: formData.title || [formData.brand, formData.model].filter(Boolean).join(' ') || undefined,
      productDescription: formData.productDescription || undefined,
      sellerNotes: formData.sellerNotes || undefined,
      wearNotes: formData.wearNotes || undefined,
      usageEstimate: formData.usageEstimate || undefined,
      price: formData.price,
      conditionRating: formData.conditionRating,
      images: formData.images,
      itemType: formData.itemType,
      brand: formData.brand,
      model: formData.model,
      modelYear: formData.modelYear,
      pickupLocation: formData.pickupLocation,
      
      // Bike-specific fields
      frameSize: formData.frameSize,
      frameMaterial: formData.frameMaterial,
      bikeType: formData.bikeType,
      groupset: formData.groupset,
      wheelSize: formData.wheelSize,
      suspensionType: formData.suspensionType,
      colorPrimary: formData.colorPrimary,
      colorSecondary: formData.colorSecondary,
      bikeWeight: formData.bikeWeight,
      
      // Part-specific fields
      partTypeDetail: formData.partTypeDetail,
      material: formData.material,
      weight: formData.weight,
      compatibilityNotes: formData.compatibilityNotes,
      
      // Apparel-specific fields
      size: formData.size,
      genderFit: formData.genderFit,
      apparelMaterial: formData.apparelMaterial,
      
      // Metadata from AI
      structuredMetadata: formData.structuredMetadata,
      searchUrls: formData.searchUrls,
      fieldConfidence: formData.fieldConfidence,
    };

    // Bike flow (13 steps)
    if (formData.itemType === "bike") {
    switch (currentStep) {
      case 1:
        return (
          <Step1ItemType
            selectedType={formData.itemType}
            onSelect={(type) => updateFormData({ itemType: type })}
            quickListingData={quickListingData}
            onQuickList={handleQuickList}
          />
        );
        case 2: // Basic Info
          return (
            <Step2BasicInfo
              data={{
                title: formData.title,
                brand: formData.brand,
                model: formData.model,
                modelYear: formData.modelYear,
                bikeType: formData.bikeType,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 3: // Frame Details
          return (
            <Step3FrameDetails
              data={{
                frameSize: formData.frameSize,
                frameMaterial: formData.frameMaterial,
                colorPrimary: formData.colorPrimary,
                colorSecondary: formData.colorSecondary,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 4: // Components
          return (
            <Step4Components
              data={{
                groupset: formData.groupset,
                wheelSize: formData.wheelSize,
                suspensionType: formData.suspensionType,
                bikeWeight: formData.bikeWeight,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 5: // Condition Rating
          return (
            <Step5ConditionRating
              data={{
                conditionRating: formData.conditionRating,
                conditionDetails: formData.conditionDetails,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 6: // Condition Details
          return (
            <Step6ConditionDetails
              data={{
                wearNotes: formData.wearNotes,
                usageEstimate: formData.usageEstimate,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 7: // Photos
          return (
            <Step7Photos
              data={{
                images: formData.images || [],
                primaryImageUrl: formData.primaryImageUrl,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
              itemType={formData.itemType}
            />
          );
        case 8: // Purchase History
          return (
            <Step8PurchaseHistory
              data={{
                purchaseLocation: formData.purchaseLocation,
                purchaseDate: formData.purchaseDate,
                originalRrp: formData.originalRrp,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 9: // Service & Upgrades
          return (
            <Step9ServiceUpgrades
              data={{
                serviceHistory: formData.serviceHistory,
                upgradesModifications: formData.upgradesModifications,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 10: // Pricing
          return (
            <Step10Pricing
              data={{
                price: formData.price,
                isNegotiable: formData.isNegotiable,
                reasonForSelling: formData.reasonForSelling,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 11: // Delivery
          return (
            <Step11Delivery
              data={{
                pickupLocation: formData.pickupLocation,
                shippingAvailable: formData.shippingAvailable,
                shippingCost: formData.shippingCost,
                shippingRestrictions: formData.shippingRestrictions,
                includedAccessories: formData.includedAccessories,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 12: // Contact
          return (
            <Step12Contact
              data={{
                sellerContactPreference: formData.sellerContactPreference,
                sellerPhone: formData.sellerPhone,
                sellerEmail: formData.sellerEmail,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 13: // Review
          return (
            <Step7Review
              data={formData}
              onEdit={goToStep}
              onPublish={handlePublish}
              onSaveDraft={handleSaveDraft}
              isPublishing={isPublishing}
            />
          );
        default:
          return null;
      }
    }
    
    // Part flow (11 steps) - uses mix of new and legacy components
    if (formData.itemType === "part") {
      switch (currentStep) {
        case 1:
          return (
            <Step1ItemType
              selectedType={formData.itemType}
              onSelect={(type) => updateFormData({ itemType: type })}
              quickListingData={quickListingData}
              onQuickList={handleQuickList}
            />
          );
        case 2: // Basic Info (legacy component for now)
          return (
            <Step2BPartDetails
              data={{
                title: formData.title,
                marketplace_subcategory: formData.marketplace_subcategory,
                partTypeDetail: formData.partTypeDetail,
                brand: formData.brand,
                model: formData.model,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 3: // Specifications
          return (
            <Step3Specifications
              data={{
                material: formData.material,
                colorPrimary: formData.colorPrimary,
                weight: formData.weight,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 4: // Compatibility
          return (
            <Step4Compatibility
              data={{
                compatibilityNotes: formData.compatibilityNotes,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 5: // Condition Rating
          return (
            <Step5ConditionRating
              data={{
                conditionRating: formData.conditionRating,
                conditionDetails: formData.conditionDetails,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 6: // Condition Details
          return (
            <Step6ConditionDetails
              data={{
                wearNotes: formData.wearNotes,
                usageEstimate: formData.usageEstimate,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 7: // Photos
          return (
            <Step7Photos
              data={{
                images: formData.images || [],
                primaryImageUrl: formData.primaryImageUrl,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
              itemType={formData.itemType}
            />
          );
        case 8: // Purchase History
          return (
            <Step8PurchaseHistory
              data={{
                purchaseLocation: formData.purchaseLocation,
                purchaseDate: formData.purchaseDate,
                originalRrp: formData.originalRrp,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 9: // Pricing (no service step for parts)
          return (
            <Step10Pricing
              data={{
                price: formData.price,
                isNegotiable: formData.isNegotiable,
                reasonForSelling: formData.reasonForSelling,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 10: // Delivery
          return (
            <Step11Delivery
              data={{
                pickupLocation: formData.pickupLocation,
                shippingAvailable: formData.shippingAvailable,
                shippingCost: formData.shippingCost,
                shippingRestrictions: formData.shippingRestrictions,
                includedAccessories: formData.includedAccessories,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 11: // Contact
          return (
            <Step12Contact
              data={{
                sellerContactPreference: formData.sellerContactPreference,
                sellerPhone: formData.sellerPhone,
                sellerEmail: formData.sellerEmail,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 12: // Review
          return (
            <Step7Review
              data={formData}
              onEdit={goToStep}
              onPublish={handlePublish}
              onSaveDraft={handleSaveDraft}
              isPublishing={isPublishing}
            />
          );
        default:
          return null;
      }
    }
    
    // Apparel flow (11 steps) - uses legacy component for now
    if (formData.itemType === "apparel") {
      switch (currentStep) {
        case 1:
          return (
            <Step1ItemType
              selectedType={formData.itemType}
              onSelect={(type) => updateFormData({ itemType: type })}
              quickListingData={quickListingData}
              onQuickList={handleQuickList}
            />
          );
        case 2: // All basic details in legacy component
        case 3: // (Sizing - covered in step 2)
        case 4: // (Details - covered in step 2)
          return (
            <Step2CApparelDetails
              data={{
                title: formData.title,
                marketplace_subcategory: formData.marketplace_subcategory,
                brand: formData.brand,
                model: formData.model,
                size: formData.size,
                genderFit: formData.genderFit,
                colorPrimary: formData.colorPrimary,
                apparelMaterial: formData.apparelMaterial,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 5: // Condition Rating
        return (
            <Step5ConditionRating
            data={{
              conditionRating: formData.conditionRating,
              conditionDetails: formData.conditionDetails,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 6: // Condition Details
          return (
            <Step6ConditionDetails
              data={{
              wearNotes: formData.wearNotes,
              usageEstimate: formData.usageEstimate,
            }}
            onChange={(data) => updateFormData(data)}
            errors={errors}
          />
        );
        case 7: // Photos
        return (
            <Step7Photos
            data={{
              images: formData.images || [],
              primaryImageUrl: formData.primaryImageUrl,
            }}
            onChange={(data) => updateFormData(data)}
            errors={errors}
            itemType={formData.itemType}
          />
        );
        case 8: // Purchase History
        return (
            <Step8PurchaseHistory
            data={{
              purchaseLocation: formData.purchaseLocation,
              purchaseDate: formData.purchaseDate,
              originalRrp: formData.originalRrp,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 9: // Pricing
          return (
            <Step10Pricing
              data={{
                price: formData.price,
                isNegotiable: formData.isNegotiable,
              reasonForSelling: formData.reasonForSelling,
            }}
            onChange={(data) => updateFormData(data)}
            errors={errors}
          />
        );
        case 10: // Delivery
        return (
            <Step11Delivery
            data={{
              pickupLocation: formData.pickupLocation,
              shippingAvailable: formData.shippingAvailable,
              shippingCost: formData.shippingCost,
                shippingRestrictions: formData.shippingRestrictions,
              includedAccessories: formData.includedAccessories,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        case 11: // Contact
          return (
            <Step12Contact
              data={{
              sellerContactPreference: formData.sellerContactPreference,
              sellerPhone: formData.sellerPhone,
              sellerEmail: formData.sellerEmail,
            }}
            onChange={(data) => updateFormData(data)}
            errors={errors}
          />
        );
        case 12: // Review
        return (
          <Step7Review
            data={formData}
            onEdit={goToStep}
            onPublish={handlePublish}
            onSaveDraft={handleSaveDraft}
            isPublishing={isPublishing}
          />
        );
      default:
        return null;
    }
    }

    // Default: Item Type selection
    return (
      <Step1ItemType
        selectedType={formData.itemType}
        onSelect={(type) => updateFormData({ itemType: type })}
        quickListingData={quickListingData}
        onQuickList={handleQuickList}
      />
    );
  };

  if (textUploadToken && (authLoading || textUploadLoading)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
      </div>
    );
  }

  if (textUploadToken && !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">Log in to finish your listing</h1>
          <p className="mt-2 text-sm text-gray-600">
            Create an account or sign in so we can attach this upload to you.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => openAuthModal({ mode: "signin" })}>
              Log in
            </Button>
            <Button variant="outline" onClick={() => openAuthModal({ mode: "signup" })}>
              Create account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (textUploadError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">Text upload unavailable</h1>
          <p className="mt-2 text-sm text-gray-600">{textUploadError}</p>
          <Button className="mt-5" onClick={() => router.push("/marketplace/sell")}>
            Start a new listing
          </Button>
        </div>
      </div>
    );
  }

  if (
    textUploadToken &&
    mode !== "bulk" &&
    mode !== "guided" &&
    mode !== "form"
  ) {
    return (
      <TextUploadFlowChoice
        onSelect={(selectedMode) =>
          router.push(
            `/marketplace/sell?mode=${selectedMode}&textUploadToken=${encodeURIComponent(textUploadToken)}`,
          )
        }
      />
    );
  }

  // Handle Bulk Upload mode (including iMessage / Nest text upload links)
  if (mode === 'bulk') {
    return (
      <BulkUploadSheet
        isOpen
        textUploadToken={textUploadToken}
        onClose={() => router.push("/marketplace/sell")}
        onComplete={(listingIds) => {
          console.log(
            "🎯 [WIZARD] Bulk upload complete - Created listings:",
            listingIds,
          );
        }}
      />
    );
  }

  // Handle guided or quick upload (form) after photos in the entry flow.
  const photoDraftForSheet = React.useMemo(
    () => (mode === "guided" || mode === "form" ? readSingleItemPhotoDraft() : null),
    [mode],
  );

  if (mode === "guided" || mode === "form") {
    return (
      <QuickUploadSheet
        isOpen
        mode={mode}
        textUploadToken={textUploadToken}
        photoDraft={photoDraftForSheet}
        onClose={() => router.push("/marketplace/sell")}
      />
    );
  }

  // Handle Smart Upload mode
  if (mode === 'smart') {
    return (
      <div className="sm:pt-16 min-h-screen bg-gray-50 flex flex-col">
        <SmartUploadFlow
          onComplete={(aiFormData, imageUrls) => {
            console.log('🎯 [WIZARD] AI Complete - Form data:', aiFormData);
            console.log('🎯 [WIZARD] AI Complete - Images:', imageUrls);
            console.log('🚴 [WIZARD] Bike details received:', {
              frameSize: aiFormData.frameSize,
              frameMaterial: aiFormData.frameMaterial,
              bikeType: aiFormData.bikeType,
              groupset: aiFormData.groupset,
              wheelSize: aiFormData.wheelSize,
            });
            
            // Update form data directly (no redirect needed)
            // Preserve images from aiFormData if they have cardUrl (from SmartUploadFlow)
            // Otherwise create new images array from URLs
            const images = aiFormData.images && aiFormData.images.length > 0 && aiFormData.images[0]?.cardUrl
              ? aiFormData.images
              : imageUrls.map((url, index) => ({
                  id: `ai-${index}`,
                  url,
                  order: index,
                  isPrimary: index === 0,
                }));
            
            const primaryImage = images.find((img: any) => img.isPrimary) || images[0];
            const updatedFormData = {
              ...aiFormData,
              images,
              // Set primary image URL explicitly (use cardUrl for faster loading)
              primaryImageUrl: primaryImage?.cardUrl || primaryImage?.url || imageUrls[0],
            };
            
            console.log('🚴 [WIZARD] Updated form data to pass:', {
              frameSize: updatedFormData.frameSize,
              frameMaterial: updatedFormData.frameMaterial,
              bikeType: updatedFormData.bikeType,
              groupset: updatedFormData.groupset,
              wheelSize: updatedFormData.wheelSize,
            });
            
            updateFormData(updatedFormData);
            
            console.log('🎯 [WIZARD] Form data updated, navigating to step 1');
            
            // Navigate to step 1 (Item Type) so user starts from beginning
            goToStep(1);
            
            // Don't show method choice again
            setShowMethodChoice(false);
            
            // Change URL without reload
            window.history.pushState({}, '', '/marketplace/sell?mode=manual&ai=true');
          }}
          onSwitchToManual={() => {
            window.history.pushState({}, '', '/marketplace/sell?mode=manual');
            setShowMethodChoice(false);
          }}
        />
      </div>
    );
  }

  // Show Facebook import flow if mode=facebook
  if (mode === 'facebook') {
    return (
      <div className="pt-16">
        <FacebookImportFlow
          onComplete={(importedFormData, imageUrls) => {
            console.log('🎯 [WIZARD] Facebook data imported:', importedFormData);
            console.log('🎯 [WIZARD] Image URLs:', imageUrls);
            
            // Update form data with imported data
            updateFormData({
              ...importedFormData,
            });
            
            console.log('🎯 [WIZARD] Form data updated, navigating to step 1');
            
            // Navigate to step 1 (Item Type) so user starts from beginning
            goToStep(1);
            
            // Don't show method choice again
            setShowMethodChoice(false);
            
            // Change URL without reload
            window.history.pushState({}, '', '/marketplace/sell?mode=manual&ai=true');
          }}
          onSwitchToManual={() => {
            window.history.pushState({}, '', '/marketplace/sell?mode=manual');
            setShowMethodChoice(false);
          }}
        />
      </div>
    );
  }

  // Show method choice (Step 0) - but not if coming from AI or loading a draft
  if (showMethodChoice && currentStep === 1 && !hasAiData && !draftId) {
    return (
      <div className="pt-16 min-h-screen bg-gray-50 flex flex-col">
        <div className="flex-1 py-12 px-6">
          <UploadMethodChoice
            onFacebookImportComplete={(importedFormData, images) => {
              console.log('🎯 [WIZARD] Facebook data imported from modal:', importedFormData);
              console.log('🎯 [WIZARD] Images:', images);
              
              // Update form data with imported data
              updateFormData({
                ...importedFormData,
              });
              
              console.log('🎯 [WIZARD] Form data updated, navigating to step 1');
              
              // Navigate to step 1 (Item Type) so user starts from beginning
              goToStep(1);
              
              // Don't show method choice again
              setShowMethodChoice(false);
              
              // Change URL without reload
              window.history.pushState({}, '', '/marketplace/sell?mode=manual&ai=true');
            }}
          />
        </div>
      </div>
    );
  }

  // Check if we're in quick listing mobile mode (step 1 with AI data on mobile)
  const isQuickListingMobile = currentStep === 1 && hasAiData;

  return (
    <div className={cn(
      "min-h-screen bg-gray-50 flex flex-col",
      // No top padding on mobile for quick listing, standard padding otherwise
      isQuickListingMobile ? "sm:pt-16" : "pt-16"
    )}>
      {/* Main Content */}
      <div className={cn(
        "flex-1",
        // No padding on mobile for quick listing (edge-to-edge), standard padding otherwise
        isQuickListingMobile ? "sm:py-8 sm:px-6" : "py-8 px-6",
        currentStep !== getTotalSteps() && !isQuickListingMobile && "pb-32" // Extra bottom padding for fixed footer, except on review step and quick listing
      )}>
        {hasAiData && Array.isArray(formData.images) && formData.images.length > 0 && (
          <div className="mx-auto mb-4 max-w-2xl rounded-md border border-gray-200 bg-white p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-gray-900">AI filled this listing</p>
                <p className="mt-0.5 truncate text-[12px] text-gray-500">
                  {(formData.title as string) ||
                    [formData.brand, formData.model].filter(Boolean).join(" ") ||
                    "Review the generated details"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRedoOpen(true)}
                className="flex-shrink-0 rounded-md bg-gray-100 px-2.5 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-200"
              >
                Wrong product?
              </button>
            </div>
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation Footer - Fixed at bottom */}
      {/* Hide navigation when in quick listing mode (step 1 with AI data) */}
      {currentStep !== getTotalSteps() && !isQuickListingMobile && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-[200px] z-40">
          <WizardNavigation
            currentStep={currentStep}
            totalSteps={getTotalSteps()}
            onBack={handleBack}
            onNext={handleNext}
            onSaveDraft={handleSaveDraft}
            isNextDisabled={currentStep === 1 && !formData.itemType}
            nextLabel={currentStep === getTotalSteps() - 1 ? "Review Listing" : "Continue"}
            lastSaved={lastSaved}
          />
        </div>
      )}
      <AiRedoDialog
        open={redoOpen}
        isSubmitting={redoing}
        error={redoError}
        onClose={() => setRedoOpen(false)}
        onSubmit={handleRedoAiDetails}
      />
    </div>
  );
}

function TextUploadFlowChoice({
  onSelect,
}: {
  onSelect: (mode: "guided" | "form") => void;
}) {
  return (
    <div className="min-h-screen bg-gray-50 px-4 pt-20">
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-md bg-gray-100">
            <Wand2 className="h-6 w-6 text-gray-700" />
          </div>
          <h1 className="mt-4 text-center text-[22px] font-bold tracking-tight text-gray-900">
            Finish your text upload
          </h1>
          <p className="mt-2 text-center text-[14px] leading-relaxed text-gray-500">
            We&apos;ve loaded the photos and AI details. Choose how you&apos;d like to review the
            listing before publishing.
          </p>
          <div className="mt-5 grid gap-2">
            <button
              type="button"
              onClick={() => onSelect("guided")}
              className="flex w-full items-center gap-3 rounded-md border border-gray-200 bg-white p-3.5 text-left transition-colors hover:bg-gray-50"
            >
              <span className="grid h-10 w-10 place-items-center rounded-md bg-gray-100">
                <Wand2 className="h-5 w-5 text-gray-700" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-gray-900">Guided</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-gray-500">
                  Review one detail at a time.
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onSelect("form")}
              className="flex w-full items-center gap-3 rounded-md border border-gray-200 bg-white p-3.5 text-left transition-colors hover:bg-gray-50"
            >
              <span className="grid h-10 w-10 place-items-center rounded-md bg-gray-100">
                <LayoutList className="h-5 w-5 text-gray-700" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-gray-900">Quick upload</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-gray-500">
                  Every field on one page.
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
