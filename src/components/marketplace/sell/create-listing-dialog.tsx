"use client";

import * as React from "react";
import { ArrowLeft } from '@/components/layout/app-sidebar/dashboard-icons';
import { ListingCountBento } from "./listing-count-bento";
import { ListingMethodBento } from "./listing-method-bento";
import { ListingPhotosPanel, type ListingPhotoDraft } from "./listing-photos-panel";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

// ============================================================
// Desktop "Create Listing" dialog
// One item: count → method → photos (guided | quick upload)
// ============================================================

interface CreateListingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartSingleListing: (mode: "guided" | "form", photoDraft: ListingPhotoDraft) => void;
  onSelectText: () => void;
  onSelectFacebook: () => void;
  onSelectBulk: () => void;
}

type DialogStep = "count" | "method" | "photos";
type ListingMode = "guided" | "form";

const emptyPhotoDraft = (): ListingPhotoDraft => ({ images: [], uploadedImages: [] });

export function CreateListingDialog({
  open,
  onOpenChange,
  onStartSingleListing,
  onSelectText,
  onSelectFacebook,
  onSelectBulk,
}: CreateListingDialogProps) {
  const [step, setStep] = React.useState<DialogStep>("count");
  const [photoDraft, setPhotoDraft] = React.useState<ListingPhotoDraft>(emptyPhotoDraft);
  const [listingMode, setListingMode] = React.useState<ListingMode | null>(null);

  React.useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setStep("count");
        setPhotoDraft(emptyPhotoDraft());
        setListingMode(null);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const choose = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  const goBack = () => {
    if (step === "photos") {
      setPhotoDraft(emptyPhotoDraft());
      setListingMode(null);
      setStep("method");
    } else if (step === "method") {
      setStep("count");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(calc(100vw-2rem),40rem)] gap-0 overflow-hidden rounded-[28px] bg-white p-0 animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out">
        <div className="px-6 pb-4 pt-6">
          <div className="flex items-center gap-2">
            {step !== "count" && (
              <button
                type="button"
                onClick={goBack}
                aria-label="Back"
                className="-ml-2 flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100"
              >
                <ArrowLeft className="h-[18px] w-[18px]" />
              </button>
            )}
            <div>
              <DialogTitle className="text-[19px] font-bold tracking-tight text-gray-900">
                {step === "count" && "Create a listing"}
                {step === "method" && "How do you want to list it?"}
                {step === "photos" && "Add photos"}
              </DialogTitle>
              <p className="mt-0.5 text-[13.5px] text-gray-500">
                {step === "count" && "One item or bulk"}
                {step === "method" && "Pick the method that suits you"}
                {step === "photos" && "We'll recognise what you're selling"}
              </p>
            </div>
          </div>
        </div>

        <div
          key={step}
          className="px-6 pb-6 animate-in fade-in slide-in-from-right-2 duration-200"
        >
          {step === "count" && (
            <ListingCountBento
              onSelectOneItem={() => setStep("method")}
              onSelectBulk={() => choose(onSelectBulk)}
            />
          )}

          {step === "method" && (
            <ListingMethodBento
              onSelectGuided={() => {
                setPhotoDraft(emptyPhotoDraft());
                setListingMode("guided");
                setStep("photos");
              }}
              onSelectQuickUpload={() => {
                setPhotoDraft(emptyPhotoDraft());
                setListingMode("form");
                setStep("photos");
              }}
              onSelectText={() => choose(onSelectText)}
              onSelectFacebook={() => choose(onSelectFacebook)}
            />
          )}

          {step === "photos" && (
            <ListingPhotosPanel
              draft={photoDraft}
              onChange={setPhotoDraft}
              onContinue={() => {
                if (listingMode === "guided") {
                  choose(() => onStartSingleListing("guided", photoDraft));
                } else if (listingMode === "form") {
                  choose(() => onStartSingleListing("form", photoDraft));
                }
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
