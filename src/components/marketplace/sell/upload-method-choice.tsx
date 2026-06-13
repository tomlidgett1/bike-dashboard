"use client";

import * as React from "react";
import {
  ArrowLeft,
  ChevronRight,
  Layers,
  LayoutList,
  Package,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FacebookImportModal } from "./facebook-import-modal";
import { TextUploadDialog } from "./text-upload-dialog";
import { MobileUploadMethodDialog } from "./mobile-upload-method-dialog";
import type { ListingImage } from "@/lib/types/listing";

// ============================================================
// Step 0: Upload Method Choice (/marketplace/sell with no mode)
// Desktop: inline two-step chooser. Mobile: the bottom sheet.
// ============================================================

interface UploadMethodChoiceProps {
  onFacebookImportComplete?: (formData: any, images: ListingImage[]) => void;
}

type ChoiceStep = "count" | "single" | "multi";

export function UploadMethodChoice({
  onFacebookImportComplete,
}: UploadMethodChoiceProps) {
  const router = useRouter();
  const [step, setStep] = React.useState<ChoiceStep>("count");
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

  // Mobile: never show a page — present the same bottom sheet used everywhere.
  if (isMobile) {
    return (
      <>
        <MobileUploadMethodDialog
          isOpen={sheetOpen && !showFacebookModal && !showTextDialog}
          onClose={() => {
            setSheetOpen(false);
            router.push("/marketplace");
          }}
          onSelectGuided={() => router.push("/marketplace/sell?mode=guided")}
          onSelectForm={() => router.push("/marketplace/sell?mode=form")}
          onSelectText={() => setShowTextDialog(true)}
          onSelectFacebook={() => setShowFacebookModal(true)}
          onSelectBulk={() => router.push("/marketplace/sell?mode=bulk")}
        />
        {sharedModals}
      </>
    );
  }

  if (isMobile === null) {
    // Avoid a flash of the desktop layout before the media query resolves.
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
                onClick={() => setStep("count")}
                aria-label="Back"
                className="-ml-2 flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100"
              >
                <ArrowLeft className="h-[18px] w-[18px]" />
              </button>
            )}
            <div>
              <h2 className="text-[26px] font-bold leading-tight tracking-tight text-gray-900">
                {step === "count" && "Create a listing"}
                {step === "single" && "List one item"}
                {step === "multi" && "List multiple items"}
              </h2>
              <p className="mt-1 text-[15px] leading-relaxed text-gray-500">
                {step === "count" && "What are you selling?"}
                {step === "single" && "Pick how you'd like to list it"}
                {step === "multi" && "Pick how you'd like to list them"}
              </p>
            </div>
          </div>
        </div>

        <div key={step} className="mt-5 space-y-2 animate-in fade-in slide-in-from-right-2 duration-200">
          {step === "count" && (
            <>
              <MethodRow
                icon={Package}
                title="One item"
                description="A bike, part or accessory"
                onClick={() => setStep("single")}
              />
              <MethodRow
                icon={Layers}
                title="Multiple items"
                description="List several things at once"
                onClick={() => setStep("multi")}
              />
            </>
          )}

          {step === "single" && (
            <>
              <MethodRow
                icon={Sparkles}
                title="Quick upload"
                badge="Guided"
                description="Step-by-step questions — AI fills in details from your photos."
                onClick={() => router.push("/marketplace/sell?mode=guided")}
              />
              <MethodRow
                icon={LayoutList}
                title="Fill in a form"
                badge="Fastest"
                description="Everything on one page — quicker if you know the details."
                onClick={() => router.push("/marketplace/sell?mode=form")}
              />
              <MethodRow
                image="/imessage.png"
                title="Text us"
                description="Send photos over iMessage — we build the listing."
                onClick={() => setShowTextDialog(true)}
              />
              <MethodRow
                image="/facebook.png"
                title="Import from Facebook"
                description="Paste your Marketplace link."
                onClick={() => setShowFacebookModal(true)}
              />
            </>
          )}

          {step === "multi" && (
            <>
              <MethodRow
                icon={Sparkles}
                title="Bulk upload"
                badge="Guided"
                description="Upload all your photos — AI sorts them into listings."
                onClick={() => router.push("/marketplace/sell?mode=bulk")}
              />
              <MethodRow
                image="/imessage.png"
                title="Text us"
                description="Send everything over iMessage — we do the rest."
                onClick={() => setShowTextDialog(true)}
              />
            </>
          )}
        </div>
      </div>
      {sharedModals}
    </>
  );
}

function MethodRow({
  icon: Icon,
  image,
  title,
  description,
  badge,
  onClick,
}: {
  icon?: LucideIcon;
  image?: string;
  title: string;
  description: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-3.5 text-left transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.99]"
    >
      <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-gray-100">
        {Icon ? (
          <Icon className="h-5 w-5 text-gray-700" />
        ) : image ? (
          <Image src={image} alt="" width={20} height={20} />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-gray-900">{title}</span>
          {badge && (
            <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-gray-500">
          {description}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-300" />
    </button>
  );
}
