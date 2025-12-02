"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, AlertCircle, X, CheckCircle2, ImageIcon } from "lucide-react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { processFacebookImages } from "@/lib/utils/facebook-image-handler";
import { mapFacebookToListing, validateFacebookData, type FacebookScrapedData } from "@/lib/mappers/facebook-to-listing";
import type { ListingImage } from "@/lib/types/listing";

// ============================================================
// Facebook Import Modal
// Popup dialog for importing Facebook Marketplace listings
// ============================================================

type FlowStage = "input" | "scraping" | "processing-images" | "success" | "error";

interface FacebookImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (formData: any, images: ListingImage[]) => void;
}

export function FacebookImportModal({ isOpen, onClose, onComplete }: FacebookImportModalProps) {
  const [stage, setStage] = React.useState<FlowStage>("input");
  const [facebookUrl, setFacebookUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [imageProgress, setImageProgress] = React.useState({ current: 0, total: 0 });

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (isOpen) {
      setStage("input");
      setFacebookUrl("");
      setError(null);
      setImageProgress({ current: 0, total: 0 });
    }
  }, [isOpen]);

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
      console.log('🔗 [FB IMPORT MODAL] Starting scrape for:', facebookUrl);

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
      console.log('✅ [FB IMPORT MODAL] Scrape successful:', result);

      const fbData = result.data as FacebookScrapedData;

      // Validate scraped data
      const validation = validateFacebookData(fbData);
      if (!validation.isValid) {
        throw new Error(
          `Incomplete listing data. Missing: ${validation.missingFields.join(", ")}. Please use manual entry instead.`
        );
      }

      // Process images
      setStage("processing-images");
      console.log('📸 [FB IMPORT MODAL] Processing images...');

      const images = await processFacebookImages(
        fbData.images,
        (current, total) => {
          setImageProgress({ current, total });
        }
      );

      console.log('✅ [FB IMPORT MODAL] Images processed:', images.length);

      // Set first image as primary by default
      const imagesWithPrimary = images.map((img, index) => ({
        ...img,
        isPrimary: index === 0,
      }));

      // Map Facebook data to form data
      const formData = mapFacebookToListing(fbData, facebookUrl);
      formData.images = imagesWithPrimary;
      formData.primaryImageUrl = imagesWithPrimary[0]?.url;

      console.log('🎯 [FB IMPORT MODAL] Form data ready:', formData);

      setStage("success");

      // Brief success state then complete
      setTimeout(() => {
        onComplete(formData, imagesWithPrimary);
        onClose();
      }, 800);

    } catch (err: any) {
      console.error('❌ [FB IMPORT MODAL] Error:', err);
      setError(err.message || "Failed to import listing");
      setStage("error");
    }
  };

  const handleRetry = () => {
    setStage("input");
    setError(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px] rounded-md animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Image src="/facebook.png" alt="Facebook" width={20} height={20} />
            Import from Facebook
          </DialogTitle>
          <DialogDescription>
            Paste a Facebook Marketplace link to auto-fill your listing details.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <AnimatePresence mode="wait">
            {/* Input Stage */}
            {stage === "input" && (
              <motion.form
                key="input"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleSubmit}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Input
                    type="url"
                    placeholder="https://www.facebook.com/marketplace/item/123456789"
                    value={facebookUrl}
                    onChange={(e) => {
                      setFacebookUrl(e.target.value);
                      setError(null);
                    }}
                    className="rounded-md"
                    autoFocus
                  />
                  {error && (
                    <p className="text-sm text-red-600 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {error}
                    </p>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    className="rounded-md"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!facebookUrl}
                    className="rounded-md bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Import Listing
                  </Button>
                </div>
              </motion.form>
            )}

            {/* Scraping Stage */}
            {stage === "scraping" && (
              <motion.div
                key="scraping"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="py-8 text-center space-y-4"
              >
                <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto" />
                <div>
                  <p className="font-medium text-gray-900">Fetching listing details...</p>
                  <p className="text-sm text-gray-500 mt-1">This may take a moment</p>
                </div>
              </motion.div>
            )}

            {/* Processing Images Stage */}
            {stage === "processing-images" && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="py-8 text-center space-y-4"
              >
                <div className="relative">
                  <ImageIcon className="h-10 w-10 text-blue-600 mx-auto" />
                  <motion.div
                    className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                  >
                    <Loader2 className="h-3 w-3 animate-spin text-white" />
                  </motion.div>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Processing images...</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {imageProgress.total > 0 
                      ? `${imageProgress.current} of ${imageProgress.total} images`
                      : "Downloading images from Facebook"
                    }
                  </p>
                </div>
                {imageProgress.total > 0 && (
                  <div className="w-full bg-gray-200 rounded-full h-2 max-w-[200px] mx-auto">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(imageProgress.current / imageProgress.total) * 100}%` }}
                    />
                  </div>
                )}
              </motion.div>
            )}

            {/* Success Stage */}
            {stage === "success" && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="py-8 text-center space-y-4"
              >
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Import successful!</p>
                  <p className="text-sm text-gray-500 mt-1">Preparing your listing...</p>
                </div>
              </motion.div>
            )}

            {/* Error Stage */}
            {stage === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="py-6 space-y-4"
              >
                <div className="bg-red-50 rounded-md p-4 border border-red-200">
                  <div className="flex gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-800">Import failed</p>
                      <p className="text-sm text-red-700 mt-1">{error}</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    className="rounded-md"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleRetry}
                    className="rounded-md"
                  >
                    Try Again
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

