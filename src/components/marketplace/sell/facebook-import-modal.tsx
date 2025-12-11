"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X, CheckCircle2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
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

  // Prevent body scroll when modal is open on mobile
  React.useEffect(() => {
    if (isOpen && isMobile) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, isMobile]);

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

  // Mobile Bottom Sheet Render
  if (isMobile) {
    return (
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/40 z-[100]"
              onClick={stage === "input" || stage === "error" ? onClose : undefined}
            />
            
            {/* Bottom Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ 
                type: "spring",
                damping: 30,
                stiffness: 400,
              }}
              className="fixed bottom-0 left-0 right-0 z-[101] bg-white rounded-t-2xl max-h-[85vh] overflow-hidden flex flex-col"
            >
              {/* Handle Bar */}
              <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>

              <AnimatePresence mode="wait">
            {/* Input Stage */}
            {stage === "input" && (
              <motion.form
                key="input"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onSubmit={handleSubmit}
                className="flex flex-col flex-1 overflow-hidden"
              >
                {/* Header */}
                <div className="px-5 pb-4 flex-shrink-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Image src="/facebook.png" alt="Facebook" width={20} height={20} />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">Import from Facebook</h2>
                  </div>
                  <p className="text-xs text-gray-500 ml-10">Paste a Marketplace link to auto-fill details</p>
                </div>

                {/* Content */}
                <div className="px-5 flex-1 overflow-y-auto">
                  <div className="space-y-2">
                    <Input
                      type="url"
                      placeholder="facebook.com/marketplace/item/123456789"
                      value={facebookUrl}
                      onChange={(e) => {
                        setFacebookUrl(e.target.value);
                        setError(null);
                      }}
                      className="rounded-xl h-12 text-base border-gray-200 focus-visible:ring-0 focus-visible:outline-none focus:outline-none"
                      autoFocus
                    />
                    {error && (
                      <p className="text-xs text-red-500">{error}</p>
                    )}
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="px-4 pb-8 pt-3 border-t border-gray-100 flex-shrink-0 bg-white">
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onClose}
                      className="flex-1 h-12 rounded-xl border-gray-200"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={!facebookUrl}
                      className="flex-1 h-12 rounded-xl bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-semibold disabled:opacity-40"
                    >
                      Import
                    </Button>
                  </div>
                </div>
              </motion.form>
            )}

            {/* Processing States */}
            {(stage === "scraping" || stage === "processing-images") && (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-5 py-12 flex flex-col items-center"
              >
                {/* Animated progress indicator */}
                <div className="relative mb-6">
                  <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
                    <Image 
                      src="/facebook.png" 
                      alt="Processing" 
                      width={28} 
                      height={28}
                    />
                  </div>
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-transparent border-t-gray-900"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                </div>
                
                <p className="text-base font-medium text-gray-900 mb-1">
                  {stage === "scraping" && "Fetching listing..."}
                  {stage === "processing-images" && "Processing images..."}
                </p>
                <p className="text-sm text-gray-500">
                  {stage === "processing-images" && imageProgress.total > 0 && (
                    `${imageProgress.current} of ${imageProgress.total}`
                  )}
                  {stage === "scraping" && "This won't take long"}
                </p>
                
                {/* Progress bar for image processing */}
                {stage === "processing-images" && imageProgress.total > 0 && (
                  <div className="w-48 h-1.5 bg-gray-200 rounded-full mt-4 overflow-hidden">
                    <motion.div
                      className="h-full bg-[#FFC72C] rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${(imageProgress.current / imageProgress.total) * 100}%` }}
                      transition={{ duration: 0.3 }}
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
                exit={{ opacity: 0 }}
                className="px-5 py-12 flex flex-col items-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 15, stiffness: 300 }}
                  className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-4"
                >
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </motion.div>
                <p className="text-base font-medium text-gray-900">All done!</p>
                <p className="text-sm text-gray-500 mt-1">Preparing your listing...</p>
              </motion.div>
            )}

            {/* Error Stage */}
            {stage === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-5 py-8 flex flex-col items-center"
              >
                <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
                  <X className="h-8 w-8 text-red-600" />
                </div>
                <p className="text-base font-medium text-gray-900 mb-1">Import failed</p>
                <p className="text-sm text-gray-500 text-center mb-6 max-w-[240px]">{error}</p>
                
                <div className="flex gap-3 w-full max-w-xs">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    className="flex-1 h-12 rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleRetry}
                    className="flex-1 h-12 rounded-xl bg-gray-900 hover:bg-gray-800"
                  >
                    Try Again
                  </Button>
                </div>
              </motion.div>
            )}
              </AnimatePresence>
              
              {/* Safe area padding for iOS */}
              <div className="h-safe-area-inset-bottom flex-shrink-0" />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  // Desktop Dialog Render
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px] rounded-md animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-medium">
            <Image src="/facebook.png" alt="Facebook" width={18} height={18} />
            Import from Facebook
          </DialogTitle>
          <DialogDescription className="text-sm">
            Paste a Marketplace link to auto-fill details
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          <AnimatePresence mode="wait">
            {/* Input Stage */}
            {stage === "input" && (
              <motion.form
                key="input"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onSubmit={handleSubmit}
                className="space-y-3"
              >
                <div className="space-y-2">
                  <Input
                    type="url"
                    placeholder="facebook.com/marketplace/item/123456789"
                    value={facebookUrl}
                    onChange={(e) => {
                      setFacebookUrl(e.target.value);
                      setError(null);
                    }}
                    className="rounded-md text-sm"
                    autoFocus
                  />
                  {error && (
                    <p className="text-xs text-red-500">{error}</p>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="text-gray-500"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!facebookUrl}
                    className="rounded-md bg-gray-900 hover:bg-gray-800 text-white"
                  >
                    Import
                  </Button>
                </div>
              </motion.form>
            )}

            {/* Scraping Stage */}
            {stage === "scraping" && (
              <motion.div
                key="scraping"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-12"
              >
                <Loader2 className="h-6 w-6 animate-spin text-gray-400 mb-3" />
                <p className="text-gray-600 text-sm">Fetching listing...</p>
              </motion.div>
            )}

            {/* Processing Images Stage */}
            {stage === "processing-images" && (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-12"
              >
                <Loader2 className="h-6 w-6 animate-spin text-gray-400 mb-3" />
                <p className="text-gray-600 text-sm">
                  {imageProgress.total > 0 
                    ? `Uploading ${imageProgress.current}/${imageProgress.total}...`
                    : "Processing images..."
                  }
                </p>
              </motion.div>
            )}

            {/* Success Stage */}
            {stage === "success" && (
              <motion.div
                key="success"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-12"
              >
                <CheckCircle2 className="h-6 w-6 text-green-500 mb-3" />
                <p className="text-gray-600 text-sm">Done!</p>
              </motion.div>
            )}

            {/* Error Stage */}
            {stage === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-12"
              >
                <X className="h-6 w-6 text-red-500 mb-3" />
                <p className="text-gray-600 text-sm mb-1">Import failed</p>
                <p className="text-gray-400 text-xs mb-4 text-center max-w-[280px]">{error}</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="text-gray-500"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleRetry}
                    className="rounded-md"
                  >
                    Retry
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

