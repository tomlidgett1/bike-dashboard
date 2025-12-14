"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useListingForm } from "@/lib/hooks/use-listing-form";
import { UploadMethodChoice } from "./upload-method-choice";
import { SmartUploadFlow } from "./smart-upload-flow";
import { FacebookImportFlow } from "./facebook-import-flow";
import { BulkUploadFlow } from "./bulk-upload-flow";
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
  const mode = searchParams?.get('mode'); // 'smart', 'facebook', or null (default manual)
  const hasAiData = searchParams?.get('ai') === 'true';
  const draftId = searchParams?.get('draftId') || undefined;
  
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
  // Don't show method choice if we have a draftId (loading existing draft)
  const [showMethodChoice, setShowMethodChoice] = React.useState(!mode && !hasAiData && !draftId);

  // Quick listing handler - publish with minimal details
  const handleQuickList = async (quickData: any) => {
    try {
      // Get images and ensure one is marked as primary
      const images = quickData.images || formData.images || [];
      
      // Find primary image URL - look for isPrimary flag or use first image
      // Use cardUrl for faster product card loading!
      let primaryImageUrl: string | undefined;
      if (images.length > 0) {
        const primaryImage = images.find((img: any) => img.isPrimary);
        // Prefer cardUrl (optimized for cards) over url
        primaryImageUrl = primaryImage?.cardUrl || primaryImage?.url || images[0]?.cardUrl || images[0]?.url;
        
        console.log('🖼️ [QUICK LIST] Found primary image:', {
          isPrimary: primaryImage?.isPrimary,
          cardUrl: primaryImage?.cardUrl?.substring(70, 110),
          url: primaryImage?.url?.substring(70, 110),
        });
        
        // Ensure at least one image is marked as primary
        if (!primaryImage && images.length > 0) {
          images[0].isPrimary = true;
        }
      }
      
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
        conditionDetails: quickData.description || quickData.conditionDetails || '', // Product description
        sellerNotes: quickData.sellerNotes || '', // Seller's personal notes
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
        window.location.href = `/marketplace?success=listing_published&id=${listing.id}`;
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
    console.log('🎯 [WIZARD DEBUG] currentStep:', currentStep);
    console.log('🎯 [WIZARD DEBUG] showMethodChoice:', showMethodChoice);
    console.log('🎯 [WIZARD DEBUG] formData:', formData);
  }, [mode, hasAiData, draftId, currentStep, showMethodChoice, formData]);

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
    const storedData = sessionStorage.getItem('smartUploadData');
    if (storedData) {
      try {
        const { formData: importedFormData, imageUrls } = JSON.parse(storedData);
        console.log('🎯 [WIZARD] Found Smart Upload data in sessionStorage:', importedFormData);
        console.log('🖼️ [WIZARD] primaryImageUrl from sessionStorage:', importedFormData.primaryImageUrl);
        console.log('🖼️ [WIZARD] images from sessionStorage:', importedFormData.images);
        console.log('🖼️ [WIZARD] First image isPrimary:', importedFormData.images?.[0]?.isPrimary);
        
        // Clear the sessionStorage data so it doesn't get re-applied
        sessionStorage.removeItem('smartUploadData');
        
        // Update form data with imported data (images are already included in formData)
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
    }
  }, []); // Only run once on mount

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

  // Render current step (now handles different flows)
  const renderStep = () => {
    // Build quick listing data from AI-detected form data
    const quickListingData = {
      title: formData.title || [formData.brand, formData.model].filter(Boolean).join(' ') || undefined,
      description: formData.conditionDetails || formData.wearNotes || undefined,
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

  // Handle Bulk Upload mode
  if (mode === 'bulk') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <BulkUploadFlow
          onComplete={(listingIds) => {
            console.log('🎯 [WIZARD] Bulk upload complete - Created listings:', listingIds);
            // BulkUploadFlow handles navigation to marketplace
          }}
          onSwitchToManual={() => {
            window.history.pushState({}, '', '/marketplace/sell?mode=manual');
            router.push('/marketplace/sell?mode=manual');
          }}
        />
      </div>
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
            const updatedFormData = {
              ...aiFormData,
              images: imageUrls.map((url, index) => ({
                id: `ai-${index}`,
                url,
                order: index,
                isPrimary: index === 0,
              })),
              // Set primary image URL explicitly
              primaryImageUrl: imageUrls[0],
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
            onSelectSmart={() => {
              // No longer navigating - modal handles it
            }}
            onSelectManual={() => {
              setShowMethodChoice(false);
            }}
            onSelectFacebook={() => {
              // No longer navigating - modal handles it
            }}
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
            onSmartUploadComplete={(importedFormData, imageUrls) => {
              console.log('🎯 [WIZARD] Smart Upload data imported from modal:', importedFormData);
              console.log('🎯 [WIZARD] Image URLs:', imageUrls);
              
              // Update form data with imported data (images already included in formData)
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
    </div>
  );
}

