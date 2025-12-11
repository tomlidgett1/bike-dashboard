"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BulkPhotoUploadStep } from "./bulk-photo-upload-step";
import { BulkPhotoGroupingStep } from "./bulk-photo-grouping-step";
import { BulkProductCarousel } from "./bulk-product-carousel";
import { BulkProductCard } from "./bulk-product-card";
import { BulkReviewStep } from "./bulk-review-step";
import { Loader2, CheckCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================================
// Bulk Upload Flow
// Main orchestrator for bulk product upload
// ============================================================

type FlowStage = "upload" | "grouping" | "analysing" | "reviewing" | "final-review" | "publishing" | "success";

interface UploadedPhoto {
  id: string;
  url: string;
  cardUrl: string;
  thumbnailUrl: string;
  mobileCardUrl: string;
  galleryUrl?: string;
  detailUrl?: string;
}

interface PhotoGroup {
  id: string;
  photoIndexes: number[];
  suggestedName: string;
  confidence: number;
}

interface ProductData {
  groupId: string;
  imageUrls: string[];
  suggestedName: string;
  aiData: any;
  formData: any;
  isValid: boolean;
}

interface BulkUploadFlowProps {
  onComplete?: (listingIds: string[]) => void;
  onSwitchToManual?: () => void;
}

export function BulkUploadFlow({ onComplete, onSwitchToManual }: BulkUploadFlowProps) {
  const router = useRouter();
  const [stage, setStage] = React.useState<FlowStage>("upload");
  const [photos, setPhotos] = React.useState<UploadedPhoto[]>([]);
  const [groups, setGroups] = React.useState<PhotoGroup[]>([]);
  const [products, setProducts] = React.useState<ProductData[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [successListingIds, setSuccessListingIds] = React.useState<string[]>([]);
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

  // Upload photos complete
  const handlePhotosUploaded = (uploadedPhotos: UploadedPhoto[]) => {
    console.log('✅ [BULK FLOW] Photos uploaded:', uploadedPhotos.length);
    setPhotos(uploadedPhotos);
    setStage("grouping");
  };

  // Grouping complete
  const handleGroupingComplete = async (photoGroups: PhotoGroup[]) => {
    console.log('✅ [BULK FLOW] Grouping complete:', photoGroups.length, 'products');
    setGroups(photoGroups);
    setStage("analysing");

    // Call AI analysis for all groups (using same endpoint as smart upload)
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('You must be logged in');
      }

      // Analyse each product using the same analyze-listing-ai endpoint
      const analysisPromises = photoGroups.map(async (group) => {
        const imageUrls = group.photoIndexes.map(idx => photos[idx].url);
        
        try {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analyze-listing-ai`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                imageUrls,
                userHints: {},
              }),
            }
          );

          if (!response.ok) {
            throw new Error('Analysis failed');
          }

          const result = await response.json();
          return { groupId: group.id, success: true, analysis: result.analysis };
        } catch (error) {
          console.error(`Failed to analyse group ${group.id}:`, error);
          return { groupId: group.id, success: false, analysis: null };
        }
      });

      const results = await Promise.all(analysisPromises);
      console.log('✅ [BULK FLOW] AI analysis complete:', results);

      // Map results to products
      const analysedProducts: ProductData[] = photoGroups.map(group => {
        const result = results.find(r => r.groupId === group.id);
        const analysis = result?.success ? result.analysis : null;

        // Generate title from AI data
        const titleParts = [
          analysis?.brand,
          analysis?.model,
          analysis?.model_year,
        ].filter(Boolean);
        const generatedTitle = titleParts.length > 0 
          ? titleParts.join(' ')
          : group.suggestedName;

        // Get bike details
        const bikeDetails = analysis?.bike_details || {};
        const partDetails = analysis?.part_details || {};
        const apparelDetails = analysis?.apparel_details || {};
        const priceEstimate = analysis?.price_estimate || {};

        return {
          groupId: group.id,
          imageUrls: group.photoIndexes.map(idx => photos[idx].url),
          suggestedName: generatedTitle,
          aiData: analysis,
          formData: {
            title: generatedTitle,
            description: analysis?.condition_details || '',
            brand: analysis?.brand || '',
            model: analysis?.model || '',
            modelYear: analysis?.model_year || '',
            itemType: analysis?.item_type || 'bike',
            bikeType: bikeDetails.bike_type || '',
            frameSize: bikeDetails.frame_size || '',
            frameMaterial: bikeDetails.frame_material || '',
            groupset: bikeDetails.groupset || '',
            wheelSize: bikeDetails.wheel_size || '',
            suspensionType: bikeDetails.suspension_type || '',
            colorPrimary: bikeDetails.color_primary || '',
            colorSecondary: bikeDetails.color_secondary || '',
            partTypeDetail: partDetails.part_category || '',
            compatibilityNotes: partDetails.compatibility || '',
            material: partDetails.material || '',
            size: apparelDetails.size || '',
            genderFit: apparelDetails.gender_fit || '',
            apparelMaterial: apparelDetails.apparel_material || '',
            conditionRating: analysis?.condition_rating || 'Good',
            conditionDetails: analysis?.condition_details || '',
            wearNotes: analysis?.wear_notes || '',
            usageEstimate: analysis?.usage_estimate || '',
            price: priceEstimate.min_aud ? Math.round((priceEstimate.min_aud + priceEstimate.max_aud) / 2) : 0,
            originalRrp: priceEstimate.max_aud || 0,
          },
          isValid: true, // Will be validated properly in the card
        };
      });

      setProducts(analysedProducts);
      setStage("reviewing");

    } catch (err) {
      console.error('❌ [BULK FLOW] Analysis error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyse products');
      // Continue with empty AI data
      const fallbackProducts: ProductData[] = photoGroups.map(group => ({
        groupId: group.id,
        imageUrls: group.photoIndexes.map(idx => photos[idx].url),
        suggestedName: group.suggestedName,
        aiData: {},
        formData: {},
        isValid: false,
      }));
      setProducts(fallbackProducts);
      setStage("reviewing");
    }
  };

  // Update product data
  const handleProductUpdate = (groupId: string, data: any) => {
    setProducts(prev => prev.map(p => 
      p.groupId === groupId 
        ? { ...p, formData: data, isValid: validateProduct(data) }
        : p
    ));
  };

  // Simple validation
  const validateProduct = (data: any): boolean => {
    return !!(
      data.title && 
      data.title.trim().length > 0 &&
      data.brand && 
      data.model && 
      data.price > 0
    );
  };

  // Carousel complete - go to final review
  const handleCarouselComplete = () => {
    setStage("final-review");
  };

  // Edit product from final review
  const handleEditProduct = (groupId: string) => {
    // Go back to carousel at that product's index
    const index = products.findIndex(p => p.groupId === groupId);
    if (index >= 0) {
      setStage("reviewing");
    }
  };

  // Delete product from final review
  const handleDeleteProduct = (groupId: string) => {
    setProducts(prev => prev.filter(p => p.groupId !== groupId));
  };

  // Publish all listings
  const handlePublishAll = async () => {
    setStage("publishing");

    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      // Build listing data for each product
      const listings = products.map(product => {
        const imageData = product.imageUrls.map((url, index) => ({
          id: `${product.groupId}-${index}`,
          url,
          order: index,
          isPrimary: index === 0,
        }));

        // Map item type to marketplace category
        const categoryMap: { [key: string]: string } = {
          'bike': 'Bicycles',
          'part': 'Parts',
          'apparel': 'Apparel',
        };

        return {
          title: product.formData.title || product.suggestedName,
          description: product.formData.description,
          brand: product.formData.brand,
          model: product.formData.model,
          modelYear: product.formData.modelYear,
          bikeType: product.formData.bikeType,
          frameSize: product.formData.frameSize,
          frameMaterial: product.formData.frameMaterial,
          groupset: product.formData.groupset,
          wheelSize: product.formData.wheelSize,
          suspensionType: product.formData.suspensionType,
          colorPrimary: product.formData.colorPrimary,
          colorSecondary: product.formData.colorSecondary,
          partTypeDetail: product.formData.partTypeDetail,
          compatibilityNotes: product.formData.compatibilityNotes,
          material: product.formData.material,
          size: product.formData.size,
          genderFit: product.formData.genderFit,
          apparelMaterial: product.formData.apparelMaterial,
          conditionRating: product.formData.conditionRating,
          conditionDetails: product.formData.conditionDetails,
          wearNotes: product.formData.wearNotes,
          usageEstimate: product.formData.usageEstimate,
          price: product.formData.price,
          originalRrp: product.formData.originalRrp,
          images: imageData,
          primaryImageUrl: product.imageUrls[0],
          marketplace_category: categoryMap[product.formData.itemType] || 'Bicycles',
          isNegotiable: true,
          shippingAvailable: true,
          pickupLocation: null,
        };
      });

      // Call bulk create API
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('You must be logged in');
      }

      const response = await fetch('/api/marketplace/listings/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ listings }),
      });

      if (!response.ok) {
        throw new Error('Failed to create listings');
      }

      const result = await response.json();
      console.log('✅ [BULK FLOW] Listings created:', result);

      setSuccessListingIds(result.created || []);
      setStage("success");

      // Navigate to marketplace after delay
      setTimeout(() => {
        router.push('/marketplace');
      }, 3000);

    } catch (err) {
      console.error('❌ [BULK FLOW] Publishing error:', err);
      setError(err instanceof Error ? err.message : 'Failed to publish listings');
      setStage("final-review");
    }
  };

  // Render current stage
  if (stage === "upload") {
    return (
      <BulkPhotoUploadStep
        onComplete={handlePhotosUploaded}
        onBack={onSwitchToManual}
      />
    );
  }

  if (stage === "grouping") {
    return (
      <BulkPhotoGroupingStep
        photos={photos}
        onComplete={handleGroupingComplete}
        onBack={() => setStage("upload")}
      />
    );
  }

  if (stage === "analysing") {
    return (
      <div className="min-h-screen bg-gray-50 pt-20 pb-20 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-gray-900 animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Analysing your products...
          </h3>
          <p className="text-sm text-gray-600">
            Yellow Jersey is extracting details from {groups.length} product{groups.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    );
  }

  if (stage === "reviewing") {
    return (
      <BulkProductCarousel
        products={products}
        onUpdate={handleProductUpdate}
        onComplete={handleCarouselComplete}
        onBack={() => setStage("grouping")}
        renderProduct={(product, onChange) => (
          <BulkProductCard
            groupId={product.groupId}
            imageUrls={product.imageUrls}
            suggestedName={product.suggestedName}
            aiData={product.aiData}
            onChange={onChange}
          />
        )}
      />
    );
  }

  if (stage === "final-review" || stage === "publishing") {
    const productSummaries = products.map(p => ({
      groupId: p.groupId,
      imageUrl: p.imageUrls[0],
      thumbnailUrl: p.imageUrls[0],
      title: `${p.formData.brand || ''} ${p.formData.model || ''}`.trim() || p.suggestedName,
      price: p.formData.price || 0,
      itemType: p.formData.itemType || 'bike',
      condition: p.formData.conditionRating || 'Good',
      isValid: p.isValid,
      validationErrors: p.isValid ? [] : ['Missing required fields'],
    }));

    return (
      <BulkReviewStep
        products={productSummaries}
        onEdit={handleEditProduct}
        onDelete={handleDeleteProduct}
        onPublish={handlePublishAll}
        onBack={() => setStage("reviewing")}
        isPublishing={stage === "publishing"}
      />
    );
  }

  if (stage === "success") {
    // Calculate total value
    const totalValue = products.reduce((sum, p) => sum + (p.formData?.price || 0), 0);

    return (
      <div className={cn(
        "min-h-screen bg-gray-50 flex flex-col items-center justify-center",
        isMobile ? "px-6 py-12" : "px-8 py-16"
      )}>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ 
            type: "spring",
            stiffness: 200,
            damping: 20
          }}
          className="text-center"
        >
          {/* Success Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ 
              delay: 0.2,
              type: "spring",
              stiffness: 300,
              damping: 15
            }}
            className="mx-auto mb-6"
          >
            <div className={cn(
              "rounded-full bg-[#FFC72C] flex items-center justify-center",
              isMobile ? "h-20 w-20" : "h-24 w-24"
            )}>
              <CheckCircle className={cn("text-gray-900", isMobile ? "h-10 w-10" : "h-12 w-12")} />
            </div>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className={cn(
              "font-bold text-gray-900 mb-2",
              isMobile ? "text-2xl" : "text-3xl"
            )}
          >
            {successListingIds.length === 1 ? 'Listing Published!' : 'Listings Published!'}
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className={cn("text-gray-600 mb-8", isMobile ? "text-base" : "text-lg")}
          >
            {successListingIds.length} {successListingIds.length === 1 ? 'item is' : 'items are'} now live on the marketplace
          </motion.p>

          {/* Stats */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className={cn(
              "bg-white rounded-2xl border border-gray-200 p-5 mb-8 w-full max-w-sm mx-auto",
              isMobile ? "shadow-sm" : "shadow-md"
            )}
          >
            <div className="flex justify-between items-center">
              <div className="text-left">
                <p className="text-xs text-gray-500 mb-1">Total Items</p>
                <p className="text-2xl font-bold text-gray-900">{successListingIds.length}</p>
              </div>
              <div className="h-10 w-px bg-gray-200" />
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-1">Total Value</p>
                <p className="text-2xl font-bold text-gray-900">${totalValue.toLocaleString()}</p>
              </div>
            </div>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="space-y-3 w-full max-w-sm mx-auto"
          >
            <Button
              onClick={() => router.push('/marketplace')}
              className={cn(
                "w-full bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-semibold rounded-xl",
                isMobile ? "h-12" : "h-11"
              )}
            >
              View on Marketplace
              <ExternalLink className="h-4 w-4 ml-2" />
            </Button>
            <Button
              onClick={() => router.push('/settings/my-listings')}
              variant="outline"
              className={cn(
                "w-full rounded-xl",
                isMobile ? "h-12" : "h-11"
              )}
            >
              Manage My Listings
            </Button>
          </motion.div>

          {/* Auto-redirect notice */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="text-xs text-gray-400 mt-6"
          >
            Redirecting to marketplace in 3 seconds...
          </motion.p>
        </motion.div>
      </div>
    );
  }

  return null;
}

