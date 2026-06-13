"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { ListingCountBento } from "./listing-count-bento";
import { ListingLayoutBento } from "./listing-layout-bento";
import { ListingPhotosPanel, type ListingPhotoDraft } from "./listing-photos-panel";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

// ============================================================
// Desktop "Create Listing" dialog
// One item: count → photos → guided | quick upload
// ============================================================

interface CreateListingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartSingleListing: (mode: "guided" | "form", photoDraft: ListingPhotoDraft) => void;
  onSelectText: () => void;
  onSelectFacebook: () => void;
  onSelectBulk: () => void;
}

type DialogStep = "count" | "photos" | "layout";

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

  React.useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setStep("count");
        setPhotoDraft(emptyPhotoDraft());
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const choose = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  const goBack = () => {
    if (step === "layout") setStep("photos");
    else if (step === "photos") {
      setPhotoDraft(emptyPhotoDraft());
      setStep("count");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] gap-0 rounded-md bg-white p-0">
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
                {step === "photos" && "Add photos"}
                {step === "layout" && "How do you want to list it?"}
              </DialogTitle>
              <p className="mt-0.5 text-[13.5px] text-gray-500">
                {step === "count" && "One item or bulk"}
                {step === "photos" && "We'll recognise what you're selling"}
                {step === "layout" && "Same photos — pick a layout"}
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
              onSelectOneItem={() => {
                setPhotoDraft(emptyPhotoDraft());
                setStep("photos");
              }}
              onSelectBulk={() => choose(onSelectBulk)}
              onSelectText={() => choose(onSelectText)}
              onSelectFacebook={() => choose(onSelectFacebook)}
            />
          )}

          {step === "photos" && (
            <ListingPhotosPanel
              draft={photoDraft}
              onChange={setPhotoDraft}
              onContinue={() => setStep("layout")}
            />
          )}

          {step === "layout" && (
            <ListingLayoutBento
              onSelectGuided={() => choose(() => onStartSingleListing("guided", photoDraft))}
              onSelectQuickUpload={() => choose(() => onStartSingleListing("form", photoDraft))}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
