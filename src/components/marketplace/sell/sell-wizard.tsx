"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useListingForm } from "@/lib/hooks/use-listing-form";
import { UploadMethodChoice } from "./upload-method-choice";
import { SmartUploadFlow } from "./smart-upload-flow";
import { WizardNavigation } from "./wizard-navigation";
import { Step1ItemType } from "./step-1-item-type";
import { Step2ABikeDetails } from "./step-2a-bike-details";
import { Step2BPartDetails } from "./step-2b-part-details";
import { Step2CApparelDetails } from "./step-2c-apparel-details";
import { Step3Condition } from "./step-3-condition";
import { Step4Photos } from "./step-4-photos";
import { Step5History } from "./step-5-history";
import { Step6Pricing } from "./step-6-pricing";
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
  const mode = searchParams?.get('mode'); // 'smart' or null (default manual)
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

  // Debug logging
  React.useEffect(() => {
    console.log('🎯 [WIZARD DEBUG] mode:', mode);
    console.log('🎯 [WIZARD DEBUG] hasAiData:', hasAiData);
    console.log('🎯 [WIZARD DEBUG] draftId:', draftId);
    console.log('🎯 [WIZARD DEBUG] currentStep:', currentStep);
    console.log('🎯 [WIZARD DEBUG] showMethodChoice:', showMethodChoice);
    console.log('🎯 [WIZARD DEBUG] formData:', formData);
  }, [mode, hasAiData, draftId, currentStep, showMethodChoice, formData]);

  // Step labels for progress indicator
  const stepLabels = [
    "Item Type",
    "Details",
    "Condition",
    "Photos",
    "History",
    "Pricing",
    "Review",
  ];

  // Validate current step
  const validateCurrentStep = (): boolean => {
    let result;

    switch (currentStep) {
      case 1:
        result = validateItemType(formData.itemType);
        break;
      case 2:
        if (formData.itemType === "bike") {
          result = validateBikeDetails({
            title: formData.title,
            brand: formData.brand,
            model: formData.model,
            modelYear: formData.modelYear,
            bikeType: formData.bikeType,
            frameSize: formData.frameSize,
            frameMaterial: formData.frameMaterial,
            colorPrimary: formData.colorPrimary,
            colorSecondary: formData.colorSecondary,
            groupset: formData.groupset,
            wheelSize: formData.wheelSize,
            suspensionType: formData.suspensionType,
            bikeWeight: formData.bikeWeight,
            upgradesModifications: formData.upgradesModifications,
          });
        } else if (formData.itemType === "part") {
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
        } else {
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
        }
        break;
      case 3:
        result = validateCondition({
          conditionRating: formData.conditionRating,
          conditionDetails: formData.conditionDetails,
          wearNotes: formData.wearNotes,
          usageEstimate: formData.usageEstimate,
        });
        break;
      case 4:
        result = validatePhotos({
          images: formData.images || [],
          primaryImageUrl: formData.primaryImageUrl,
        });
        break;
      case 5:
        result = validateHistory({
          purchaseLocation: formData.purchaseLocation,
          purchaseDate: formData.purchaseDate,
          originalRrp: formData.originalRrp,
          serviceHistory: formData.serviceHistory,
          upgradesModifications: formData.upgradesModifications,
          reasonForSelling: formData.reasonForSelling,
        });
        break;
      case 6:
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

    setErrors(result.errors);
    return result.isValid;
  };

  const handleNext = () => {
    if (validateCurrentStep()) {
      if (currentStep === 1 && formData.itemType) {
        setItemType(formData.itemType);
      } else {
        nextStep();
      }
      setErrors([]);
    } else {
      // Scroll to first error
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

  // Render current step
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1ItemType
            selectedType={formData.itemType}
            onSelect={(type) => updateFormData({ itemType: type })}
          />
        );

      case 2:
        if (formData.itemType === "bike") {
          return (
            <Step2ABikeDetails
              data={{
                title: formData.title,
                brand: formData.brand,
                model: formData.model,
                modelYear: formData.modelYear,
                bikeType: formData.bikeType,
                frameSize: formData.frameSize,
                frameMaterial: formData.frameMaterial,
                colorPrimary: formData.colorPrimary,
                colorSecondary: formData.colorSecondary,
                groupset: formData.groupset,
                wheelSize: formData.wheelSize,
                suspensionType: formData.suspensionType,
                bikeWeight: formData.bikeWeight,
                upgradesModifications: formData.upgradesModifications,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        } else if (formData.itemType === "part") {
          return (
            <Step2BPartDetails
              data={{
                title: formData.title,
                marketplace_subcategory: formData.marketplace_subcategory,
                partTypeDetail: formData.partTypeDetail,
                brand: formData.brand,
                model: formData.model,
                material: formData.material,
                colorPrimary: formData.colorPrimary,
                weight: formData.weight,
                compatibilityNotes: formData.compatibilityNotes,
              }}
              onChange={(data) => updateFormData(data)}
              errors={errors}
            />
          );
        } else {
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
        }

      case 3:
        return (
          <Step3Condition
            data={{
              conditionRating: formData.conditionRating,
              conditionDetails: formData.conditionDetails,
              wearNotes: formData.wearNotes,
              usageEstimate: formData.usageEstimate,
            }}
            onChange={(data) => updateFormData(data)}
            errors={errors}
          />
        );

      case 4:
        return (
          <Step4Photos
            data={{
              images: formData.images || [],
              primaryImageUrl: formData.primaryImageUrl,
            }}
            onChange={(data) => updateFormData(data)}
            errors={errors}
            itemType={formData.itemType}
          />
        );

      case 5:
        return (
          <Step5History
            data={{
              purchaseLocation: formData.purchaseLocation,
              purchaseDate: formData.purchaseDate,
              originalRrp: formData.originalRrp,
              serviceHistory: formData.serviceHistory,
              upgradesModifications: formData.upgradesModifications,
              reasonForSelling: formData.reasonForSelling,
            }}
            onChange={(data) => updateFormData(data)}
            errors={errors}
          />
        );

      case 6:
        return (
          <Step6Pricing
            data={{
              price: formData.price,
              isNegotiable: formData.isNegotiable,
              pickupLocation: formData.pickupLocation,
              shippingAvailable: formData.shippingAvailable,
              shippingCost: formData.shippingCost,
              includedAccessories: formData.includedAccessories,
              sellerContactPreference: formData.sellerContactPreference,
              sellerPhone: formData.sellerPhone,
              sellerEmail: formData.sellerEmail,
            }}
            onChange={(data) => updateFormData(data)}
            errors={errors}
          />
        );

      case 7:
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
  };

  // Handle Smart Upload mode
  if (mode === 'smart') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-[1920px] mx-auto px-6 py-4 flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">VeloMarket</h1>
            <Button
              variant="ghost"
              onClick={() => router.push('/marketplace')}
              className="rounded-md"
            >
              Back to Marketplace
            </Button>
          </div>
        </header>

        <SmartUploadFlow
          onComplete={(aiFormData, imageUrls) => {
            console.log('🎯 [WIZARD] AI Complete - Form data:', aiFormData);
            console.log('🎯 [WIZARD] AI Complete - Images:', imageUrls);
            
            // Update form data directly (no redirect needed)
            updateFormData({
              ...aiFormData,
              images: imageUrls.map((url, index) => ({
                id: `ai-${index}`,
                url,
                order: index,
                isPrimary: index === 0,
              })),
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
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-[1920px] mx-auto px-6 py-4 flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">VeloMarket</h1>
            <Button
              variant="ghost"
              onClick={() => router.push('/marketplace')}
              className="rounded-md"
            >
              Back to Marketplace
            </Button>
          </div>
        </header>

        <div className="flex-1 py-12 px-6">
          <UploadMethodChoice
            onSelectSmart={() => {
              router.push('/marketplace/sell?mode=smart');
            }}
            onSelectManual={() => {
              setShowMethodChoice(false);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-[1920px] mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">VeloMarket</h1>
          <Button
            variant="ghost"
            onClick={() => router.push('/marketplace')}
            className="rounded-md"
          >
            Back to Marketplace
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className={cn(
        "flex-1 py-8 px-6",
        currentStep !== 7 && "pb-32" // Extra bottom padding for fixed footer, except on review step
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
      {currentStep !== 7 && (
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <WizardNavigation
            currentStep={currentStep}
            totalSteps={7}
            onBack={handleBack}
            onNext={handleNext}
            onSaveDraft={handleSaveDraft}
            isNextDisabled={currentStep === 1 && !formData.itemType}
            nextLabel={currentStep === 6 ? "Review Listing" : "Continue"}
            lastSaved={lastSaved}
          />
        </div>
      )}
    </div>
  );
}

