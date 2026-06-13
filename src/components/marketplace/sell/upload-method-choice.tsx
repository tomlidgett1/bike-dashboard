"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { FacebookImportModal } from "./facebook-import-modal";
import { TextUploadDialog } from "./text-upload-dialog";
import { MobileUploadMethodDialog } from "./mobile-upload-method-dialog";
import { ListingCountBento } from "./listing-count-bento";
import { ListingLayoutBento } from "./listing-layout-bento";
import { ListingPhotosPanel, type ListingPhotoDraft } from "./listing-photos-panel";
import { stashSingleItemPhotoDraft } from "./single-item-photo-draft";
import type { ListingImage } from "@/lib/types/listing";

// ============================================================
// Step 0: Upload Method Choice (/marketplace/sell with no mode)
// One item: count → photos → guided | quick upload
// Bulk: opens bulk flow (photos first there too)
// ============================================================

interface UploadMethodChoiceProps {
  onFacebookImportComplete?: (formData: any, images: ListingImage[]) => void;
}

type ChoiceStep = "count" | "photos" | "layout";

const emptyPhotoDraft = (): ListingPhotoDraft => ({ images: [], uploadedImages: [] });

export function UploadMethodChoice({
  onFacebookImportComplete,
}: UploadMethodChoiceProps) {
  const router = useRouter();
  const [step, setStep] = React.useState<ChoiceStep>("count");
  const [photoDraft, setPhotoDraft] = React.useState<ListingPhotoDraft>(emptyPhotoDraft);
  const [showFacebookModal, setShowFacebookModal] = React.useState(false);
  const [showTextDialog, setShowTextDialog] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState<boolean | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(true);

  React.useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const handleFacebookComplete = (formData: any, images: ListingImage[]) => {
    setShowFacebookModal(false);
    onFacebookImportComplete?.(formData, images);
  };

  const openSingleFlow = (mode: "guided" | "form") => {
    stashSingleItemPhotoDraft(photoDraft);
    router.push(`/marketplace/sell?mode=${mode}`);
  };

  const goBack = () => {
    if (step === "layout") setStep("photos");
    else if (step === "photos") {
      setPhotoDraft(emptyPhotoDraft());
      setStep("count");
    }
  };

  const sharedModals = (
    <>
      <FacebookImportModal
        isOpen={showFacebookModal}
        onClose={() => setShowFacebookModal(false)}
        onComplete={handleFacebookComplete}
      />
      <TextUploadDialog
        isOpen={showTextDialog}
        onClose={() => setShowTextDialog(false)}
      />
    </>
  );

  if (isMobile) {
    return (
      <>
        <MobileUploadMethodDialog
          isOpen={sheetOpen && !showFacebookModal && !showTextDialog}
          onClose={() => {
            setSheetOpen(false);
            router.push("/marketplace");
          }}
          onSelectGuided={(draft) => {
            stashSingleItemPhotoDraft(draft);
            router.push("/marketplace/sell?mode=guided");
          }}
          onSelectQuickUpload={(draft) => {
            stashSingleItemPhotoDraft(draft);
            router.push("/marketplace/sell?mode=form");
          }}
          onSelectText={() => setShowTextDialog(true)}
          onSelectFacebook={() => setShowFacebookModal(true)}
          onSelectBulk={() => router.push("/marketplace/sell?mode=bulk")}
        />
        {sharedModals}
      </>
    );
  }

  if (isMobile === null) {
    return null;
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[460px]">
        <div className="px-1">
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
              <h2 className="text-[26px] font-bold leading-tight tracking-tight text-gray-900">
                {step === "count" && "Create a listing"}
                {step === "photos" && "Add photos"}
                {step === "layout" && "How do you want to list it?"}
              </h2>
              <p className="mt-1 text-[15px] leading-relaxed text-gray-500">
                {step === "count" && "One item or bulk"}
                {step === "photos" && "We'll recognise what you're selling"}
                {step === "layout" && "Same photos — pick a layout"}
              </p>
            </div>
          </div>
        </div>

        <div key={step} className="mt-5 animate-in fade-in slide-in-from-right-2 duration-200">
          {step === "count" && (
            <ListingCountBento
              onSelectOneItem={() => {
                setPhotoDraft(emptyPhotoDraft());
                setStep("photos");
              }}
              onSelectBulk={() => router.push("/marketplace/sell?mode=bulk")}
              onSelectText={() => setShowTextDialog(true)}
              onSelectFacebook={() => setShowFacebookModal(true)}
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
              onSelectGuided={() => openSingleFlow("guided")}
              onSelectQuickUpload={() => openSingleFlow("form")}
            />
          )}
        </div>
      </div>
      {sharedModals}
    </>
  );
}
