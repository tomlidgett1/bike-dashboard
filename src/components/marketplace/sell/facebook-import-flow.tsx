"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link2, Loader2, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { processFacebookImages } from "@/lib/utils/facebook-image-handler";
import { mapFacebookToListing, validateFacebookData, type FacebookScrapedData } from "@/lib/mappers/facebook-to-listing";
import type { ListingImage } from "@/lib/types/listing";

// ============================================================
// Facebook Import Flow Container
// ============================================================

type FlowStage = "input" | "scraping" | "processing-images" | "preview" | "error";

interface FacebookImportFlowProps {
  onComplete: (formData: any, imageUrls: string[]) => void;
  onSwitchToManual: () => void;
}

export function FacebookImportFlow({ onComplete, onSwitchToManual }: FacebookImportFlowProps) {
  const [stage, setStage] = React.useState<FlowStage>("input");
  const [facebookUrl, setFacebookUrl] = React.useState("");
  const [scrapedData, setScrapedData] = React.useState<FacebookScrapedData | null>(null);
  const [processedImages, setProcessedImages] = React.useState<ListingImage[]>([]);
  const [imageProgress, setImageProgress] = React.useState({ current: 0, total: 0 });
  const [error, setError] = React.useState<string | null>(null);
  const [selectedImages, setSelectedImages] = React.useState<string[]>([]);
  const [primaryImageId, setPrimaryImageId] = React.useState<string | null>(null);
  const [isQuickListing, setIsQuickListing] = React.useState(false);

  // Validate Facebook Marketplace URL
  const isValidUrl = (url: string): boolean => {
    const fbUrlPattern = /facebook\.com\/marketplace\/item\/\d+/;
    return fbUrlPattern.test(url);
  };

  // Handle URL submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!facebookUrl || !isValidUrl(facebookUrl)) {
      setError("Please enter a valid Facebook Marketplace URL (e.g., facebook.com/marketplace/item/123456789)");
      return;
    }

    setError(null);
    setStage("scraping");

    try {
      console.log('🔗 [FB IMPORT] Starting scrape for:', facebookUrl);

      // Get Supabase session token
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('You must be logged in to import listings');
      }

      // Call Supabase Edge Function to scrape
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/scrape-facebook-listing`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            facebookUrl,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to scrape Facebook listing");
      }

      const result = await response.json();
      console.log('✅ [FB IMPORT] Scrape successful:', result);

      const fbData = result.data as FacebookScrapedData;

      // Validate scraped data
      const validation = validateFacebookData(fbData);
      if (!validation.isValid) {
        throw new Error(
          `Incomplete listing data. Missing: ${validation.missingFields.join(", ")}. Please use manual entry instead.`
        );
      }

      setScrapedData(fbData);

      // Process images
      setStage("processing-images");
      console.log('📸 [FB IMPORT] Processing images...');

      const images = await processFacebookImages(
        fbData.images,
        (current, total) => {
          setImageProgress({ current, total });
        }
      );

      console.log('✅ [FB IMPORT] Images processed:', images.length);

      setProcessedImages(images);
      // Select all images by default
      setSelectedImages(images.map(img => img.id));
      // Set first image as primary by default
      setPrimaryImageId(images[0]?.id || null);
      setStage("preview");

    } catch (err: any) {
      console.error('❌ [FB IMPORT] Error:', err);
      setError(err.message || "Failed to import listing");
      setStage("error");
    }
  };

  // Handle continue to wizard or quick list
  const handleContinue = async (quickList: boolean = false) => {
    if (!scrapedData) return;

    console.log(`🎯 [FB IMPORT] ${quickList ? 'Quick List' : 'Continue'} clicked`);

    // Filter selected images and update primary status
    const selectedImagesList = processedImages
      .filter(img => selectedImages.includes(img.id))
      .map(img => ({
        ...img,
        isPrimary: img.id === primaryImageId,
      }));

    console.log('🎯 [FB IMPORT] Primary Image ID:', primaryImageId);
    console.log('🎯 [FB IMPORT] Selected Images List (with isPrimary):', selectedImagesList);
    console.log('🎯 [FB IMPORT] Images with isPrimary=true:', selectedImagesList.filter(img => img.isPrimary));

    if (selectedImagesList.length === 0) {
      setError("Please select at least one image");
      return;
    }

    // Map Facebook data to form data
    const formData = mapFacebookToListing(scrapedData, facebookUrl);

    // Add selected images
    formData.images = selectedImagesList;
    const primaryImage = selectedImagesList.find(img => img.isPrimary);
    formData.primaryImageUrl = primaryImage?.url;

    console.log('🎯 [FB IMPORT] Selected images list:', selectedImagesList);
    console.log('🎯 [FB IMPORT] Primary image:', primaryImage);
    console.log('🎯 [FB IMPORT] Primary image URL:', formData.primaryImageUrl);
    console.log('🎯 [FB IMPORT] Mapped form data:', formData);

    if (quickList) {
      // Quick list - create listing immediately
      setIsQuickListing(true);
      try {
        const response = await fetch("/api/marketplace/listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...formData,
            listingStatus: "active",
            publishedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        });

        if (response.ok) {
          const { listing } = await response.json();
          window.location.href = `/marketplace?success=listing_published&id=${listing.id}`;
        } else {
          throw new Error("Failed to create listing");
        }
      } catch (err: any) {
        console.error('❌ [FB IMPORT] Quick list error:', err);
        setError(err.message || "Failed to create listing. Please try again.");
        setIsQuickListing(false);
      }
    } else {
      // Continue to full wizard
      onComplete(formData, selectedImagesList.map(img => img.url));
    }
  };

  const toggleImageSelection = (imageId: string) => {
    setSelectedImages(prev => {
      if (prev.includes(imageId)) {
        // Deselect
        const newSelection = prev.filter(id => id !== imageId);
        // If this was primary, set a new primary
        if (primaryImageId === imageId && newSelection.length > 0) {
          setPrimaryImageId(newSelection[0]);
        }
        return newSelection;
      } else {
        // Select
        return [...prev, imageId];
      }
    });
  };

  const setPrimaryImage = (imageId: string) => {
    // Ensure the image is selected
    if (!selectedImages.includes(imageId)) {
      setSelectedImages(prev => [...prev, imageId]);
    }
    setPrimaryImageId(imageId);
  };

  const handleRetry = () => {
    setStage("input");
    setFacebookUrl("");
    setScrapedData(null);
    setProcessedImages([]);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-6">
      <AnimatePresence mode="wait">
        <motion.div
          key={stage}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          {/* Input Stage */}
          {stage === "input" && (
            <div className="max-w-2xl mx-auto">
              <Card className="p-8 rounded-md bg-white">
                <div className="space-y-6">
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
                      <Link2 className="h-8 w-8 text-blue-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">Import from Facebook</h2>
                    <p className="text-sm text-gray-600">
                      Paste a Facebook Marketplace listing URL to automatically extract all details
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="facebook-url" className="block text-sm font-medium text-gray-700 mb-2">
                        Facebook Marketplace URL
                      </label>
                      <Input
                        id="facebook-url"
                        type="text"
                        placeholder="https://www.facebook.com/marketplace/item/123456789"
                        value={facebookUrl}
                        onChange={(e) => setFacebookUrl(e.target.value)}
                        className="rounded-md"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Example: facebook.com/marketplace/item/123456789012345
                      </p>
                    </div>

                    {error && (
                      <div className="bg-white border-2 border-red-200 rounded-md p-4 flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm text-gray-900 font-medium">Error</p>
                          <p className="text-sm text-gray-700 mt-1">{error}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <Button
                        type="submit"
                        disabled={!facebookUrl}
                        className="flex-1 rounded-md"
                      >
                        Import Listing
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={onSwitchToManual}
                        className="rounded-md"
                      >
                        Manual Entry
                      </Button>
                    </div>
                  </form>
                </div>
              </Card>
            </div>
          )}

          {/* Scraping Stage */}
          {stage === "scraping" && (
            <div className="max-w-2xl mx-auto">
              <Card className="p-8 rounded-md bg-white text-center">
                <div className="space-y-4">
                  <Loader2 className="h-12 w-12 text-blue-600 animate-spin mx-auto" />
                  <h3 className="text-xl font-bold text-gray-900">Scraping Facebook Listing</h3>
                  <p className="text-sm text-gray-600">
                    Extracting title, price, description, and images...
                  </p>
                  <p className="text-xs text-gray-500">This may take 10-30 seconds</p>
                </div>
              </Card>
            </div>
          )}

          {/* Processing Images Stage */}
          {stage === "processing-images" && (
            <div className="max-w-2xl mx-auto">
              <Card className="p-8 rounded-md bg-white text-center">
                <div className="space-y-4">
                  <Loader2 className="h-12 w-12 text-blue-600 animate-spin mx-auto" />
                  <h3 className="text-xl font-bold text-gray-900">Processing Images</h3>
                  <p className="text-sm text-gray-600">
                    Downloading and uploading images to Yellow Jersey...
                  </p>
                  {imageProgress.total > 0 && (
                    <div className="space-y-2">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${(imageProgress.current / imageProgress.total) * 100}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-gray-500">
                        {imageProgress.current} of {imageProgress.total} images
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* Preview Stage */}
          {stage === "preview" && scrapedData && (
            <div className="max-w-5xl mx-auto">
              <Card className="p-8 rounded-md bg-white">
                <div className="space-y-8">
                  {/* Header */}
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Review Your Import</h2>
                    <p className="text-sm text-gray-600 mt-1">Select images and verify details</p>
                  </div>

                  {/* Images Selection */}
                  {processedImages.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-gray-900">
                          Images ({selectedImages.length} selected)
                        </h3>
                        <p className="text-xs text-gray-500">
                          Click to select/deselect • Double-click to set as primary
                        </p>
                      </div>
                      <div className="grid grid-cols-4 gap-4">
                        {processedImages.map((img) => {
                          const isSelected = selectedImages.includes(img.id);
                          const isPrimary = primaryImageId === img.id;
                          
                          return (
                            <div
                              key={img.id}
                              onClick={() => toggleImageSelection(img.id)}
                              onDoubleClick={() => setPrimaryImage(img.id)}
                              className={cn(
                                "relative aspect-square rounded-md overflow-hidden cursor-pointer transition-all",
                                isSelected 
                                  ? "ring-2 ring-gray-900 opacity-100" 
                                  : "ring-1 ring-gray-200 opacity-40 hover:opacity-70"
                              )}
                            >
                              <img
                                src={img.url}
                                alt={`Image ${img.order + 1}`}
                                className="w-full h-full object-cover"
                              />
                              {isPrimary && isSelected && (
                                <div className="absolute top-2 left-2 bg-gray-900 text-white text-xs px-2 py-1 rounded-md font-medium">
                                  Primary
                                </div>
                              )}
                              {isSelected && (
                                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-900 flex items-center justify-center">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Details Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1.5">Title</p>
                        <p className="text-base font-semibold text-gray-900">{scrapedData.title}</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1.5">Price</p>
                          <p className="text-base font-semibold text-gray-900">
                            ${scrapedData.price > 0 ? scrapedData.price.toLocaleString() : 'Not specified'}
                          </p>
                        </div>
                        
                        {scrapedData.condition && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-1.5">Condition</p>
                            <p className="text-sm text-gray-900">{scrapedData.condition}</p>
                          </div>
                        )}
                      </div>

                      {scrapedData.location && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1.5">Location</p>
                          <p className="text-sm text-gray-900">{scrapedData.location}</p>
                        </div>
                      )}
                    </div>

                    {scrapedData.description && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1.5">Description</p>
                        <div className="bg-gray-50 rounded-md p-4 border border-gray-200">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                            {scrapedData.description}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4 border-t">
                    <Button
                      onClick={() => handleContinue(true)}
                      disabled={isQuickListing || selectedImages.length === 0}
                      className="flex-1 rounded-md bg-gray-900 hover:bg-gray-800"
                    >
                      {isQuickListing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating Listing...
                        </>
                      ) : (
                        'Quick List'
                      )}
                    </Button>
                    <Button
                      onClick={() => handleContinue(false)}
                      disabled={isQuickListing || selectedImages.length === 0}
                      variant="outline"
                      className="flex-1 rounded-md"
                    >
                      Detailed Listing
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleRetry}
                      disabled={isQuickListing}
                      className="rounded-md"
                    >
                      Import Another
                    </Button>
                  </div>

                  {error && (
                    <div className="bg-white border-2 border-red-200 rounded-md p-3 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-gray-900">{error}</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* Error Stage */}
          {stage === "error" && (
            <div className="max-w-2xl mx-auto">
              <Card className="p-8 rounded-md bg-white border-2 border-red-200">
                <div className="space-y-4 text-center">
                  <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                    <AlertCircle className="h-8 w-8 text-red-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Import Failed</h3>
                  <p className="text-sm text-gray-700">{error}</p>
                  
                  <div className="bg-white border border-gray-200 rounded-md p-4 text-left">
                    <p className="text-xs font-medium text-gray-900 mb-2">Common Issues:</p>
                    <ul className="text-xs text-gray-600 space-y-1">
                      <li>• The listing may be private or deleted</li>
                      <li>• The URL format might be incorrect</li>
                      <li>• Facebook may be blocking automated access</li>
                    </ul>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button
                      onClick={handleRetry}
                      className="flex-1 rounded-md"
                    >
                      Try Again
                    </Button>
                    <Button
                      variant="outline"
                      onClick={onSwitchToManual}
                      className="flex-1 rounded-md"
                    >
                      Use Manual Entry
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

