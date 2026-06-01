"use client";

import * as React from "react";
import { Loader2, X, CheckCircle2, XCircle } from "lucide-react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
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
      <Sheet open={isOpen} onOpenChange={(open) => !open && (stage === "input" || stage === "error") && onClose()}>
        <SheetContent 
          side="bottom" 
          className="rounded-t-2xl p-0 overflow-hidden gap-0 max-h-[85vh] flex flex-col"
          showCloseButton={false}
        >
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-8 h-1 bg-muted-foreground/20 rounded-full" />
          </div>

          <div className="px-4 pb-3 pt-1 flex-shrink-0 flex items-center gap-2">
            <Image src="/facebook.png" alt="Facebook" width={14} height={14} className="flex-shrink-0" />
            <p className="text-sm font-semibold text-foreground">Import from Facebook</p>
          </div>

          <Separator className="flex-shrink-0" />

          {/* Input Stage */}
          {stage === "input" && (
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="px-4 py-3 flex-1 overflow-y-auto">
                <p className="text-xs text-muted-foreground mb-2">Paste a Marketplace link to auto-fill details</p>
                <Input
                  type="url"
                  placeholder="facebook.com/marketplace/item/123456789"
                  value={facebookUrl}
                  onChange={(e) => { setFacebookUrl(e.target.value); setError(null); }}
                  className="h-9 text-sm"
                  autoFocus
                />
                {error && <p className="text-xs text-destructive mt-2">{error}</p>}
              </div>

              <Separator className="flex-shrink-0" />
              <div className="px-4 py-3 pb-8 flex-shrink-0 flex gap-2 justify-end">
                <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!facebookUrl} className="h-8 text-xs">
                  Import
                </Button>
              </div>
            </form>
          )}

          {/* Processing States */}
          {(stage === "scraping" || stage === "processing-images") && (
            <div className="px-4 py-10 flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <div className="text-center">
                <p className="text-xs font-medium text-foreground">
                  {stage === "scraping" ? "Fetching listing..." : "Processing images..."}
                </p>
                {stage === "processing-images" && imageProgress.total > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {imageProgress.current} of {imageProgress.total}
                  </p>
                )}
              </div>
              {stage === "processing-images" && imageProgress.total > 0 && (
                <div className="w-40 h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-foreground rounded-full transition-all duration-300"
                    style={{ width: `${(imageProgress.current / imageProgress.total) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Success Stage */}
          {stage === "success" && (
            <div className="px-4 py-10 flex flex-col items-center gap-3">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
              <div className="text-center">
                <p className="text-xs font-medium text-foreground">All done!</p>
                <p className="text-xs text-muted-foreground mt-0.5">Preparing your listing...</p>
              </div>
            </div>
          )}

          {/* Error Stage */}
          {stage === "error" && (
            <div className="px-4 py-8 flex flex-col items-center gap-3">
              <XCircle className="h-7 w-7 text-destructive" />
              <div className="text-center">
                <p className="text-xs font-medium text-foreground mb-0.5">Import failed</p>
                <p className="text-xs text-muted-foreground max-w-[240px]">{error}</p>
              </div>
              <div className="flex gap-2 mt-1">
                <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={handleRetry} className="h-8 text-xs">
                  Try again
                </Button>
              </div>
            </div>
          )}
          
          {/* Safe area padding for iOS */}
          <div className="h-safe-area-inset-bottom flex-shrink-0" />
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop Dialog Render
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Image src="/facebook.png" alt="Facebook" width={14} height={14} />
            Import from Facebook
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Paste a Marketplace link to auto-fill details
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {/* Input Stage */}
        {stage === "input" && (
          <form onSubmit={handleSubmit}>
            <div className="px-4 py-3">
              <Input
                type="url"
                placeholder="facebook.com/marketplace/item/123456789"
                value={facebookUrl}
                onChange={(e) => { setFacebookUrl(e.target.value); setError(null); }}
                className="h-8 text-xs"
                autoFocus
              />
              {error && <p className="text-xs text-destructive mt-2">{error}</p>}
            </div>
            <Separator />
            <div className="px-4 py-3 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!facebookUrl} className="h-8 text-xs">
                Import
              </Button>
            </div>
          </form>
        )}

        {/* Scraping / Processing Images Stage */}
        {(stage === "scraping" || stage === "processing-images") && (
          <div className="px-4 py-8 flex flex-col items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              {stage === "scraping" ? "Fetching listing..." :
                imageProgress.total > 0
                  ? `Uploading ${imageProgress.current}/${imageProgress.total}...`
                  : "Processing images..."}
            </p>
          </div>
        )}

        {/* Success Stage */}
        {stage === "success" && (
          <div className="px-4 py-8 flex flex-col items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <p className="text-xs text-muted-foreground">Done!</p>
          </div>
        )}

        {/* Error Stage */}
        {stage === "error" && (
          <div className="px-4 py-6 flex flex-col items-center gap-2">
            <XCircle className="h-6 w-6 text-destructive" />
            <p className="text-xs font-medium text-foreground">Import failed</p>
            <p className="text-xs text-muted-foreground text-center max-w-[240px]">{error}</p>
            <div className="flex gap-2 mt-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={handleRetry} className="h-8 text-xs">
                Retry
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

