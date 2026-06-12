"use client";

import * as React from "react";
import {
  ChevronRight,
  LayoutList,
  Link2,
  Layers,
  Sparkles,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FacebookImportModal } from "./facebook-import-modal";
import type { ListingImage } from "@/lib/types/listing";

// ============================================================
// Step 0: Upload Method Choice
// ============================================================

interface UploadMethodChoiceProps {
  onFacebookImportComplete?: (formData: any, images: ListingImage[]) => void;
}

export function UploadMethodChoice({ 
  onFacebookImportComplete,
}: UploadMethodChoiceProps) {
  const router = useRouter();
  const [showFacebookModal, setShowFacebookModal] = React.useState(false);

  const handleFacebookComplete = (formData: any, images: ListingImage[]) => {
    setShowFacebookModal(false);
    if (onFacebookImportComplete) {
      onFacebookImportComplete(formData, images);
    }
  };

  return (
    <>
    <div className="mx-auto w-full max-w-[460px]">
      <div className="px-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Sell your bike
        </p>
        <h2 className="mt-1 text-[26px] font-bold leading-tight tracking-tight text-gray-900">
          How would you like to list?
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-gray-500">
          Choose the path that matches how much control you want. Guided and Form both use AI
          recommendations and support full bike specifications.
        </p>
      </div>

      <p className="mt-6 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        Quick upload · one bike
      </p>
      <div className="mt-2 space-y-2">
        <MethodRow
          icon={Wand2}
          title="Guided"
          badge="Simplest"
          description="One field at a time, with AI pre-filling details from your photos."
          onClick={() => router.push("/marketplace/sell?mode=guided")}
        />
        <MethodRow
          icon={LayoutList}
          title="Form"
          description="Everything on one page, still AI-assisted. Best when you know the details."
          onClick={() => router.push("/marketplace/sell?mode=form")}
        />
      </div>

      <p className="mt-6 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        Several at once
      </p>
      <div className="mt-2">
        <MethodRow
          icon={Layers}
          title="Bulk upload"
          description="Upload photos for multiple products and let AI sort them into listings."
          onClick={() => router.push("/marketplace/sell?mode=bulk")}
        />
      </div>

      <div className="mt-6 rounded-md border border-gray-200 bg-white p-3.5">
        <div className="flex items-start gap-2.5">
          <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-gray-100">
            <Sparkles className="h-4 w-4 text-gray-700" />
          </span>
          <p className="text-[12.5px] leading-relaxed text-gray-600">
            Bike listings can include the full component spec sheet buyers see on product
            pages, filled by AI where possible or edited by hand.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowFacebookModal(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-md px-3 py-2.5 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-100"
      >
        <Link2 className="h-4 w-4" />
        Import from Facebook instead
      </button>

      {/* Facebook Import Modal */}
      <FacebookImportModal
        isOpen={showFacebookModal}
        onClose={() => setShowFacebookModal(false)}
        onComplete={handleFacebookComplete}
      />
    </div>
    </>
  );
}

function MethodRow({
  icon: Icon,
  title,
  description,
  badge,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md border border-gray-200 bg-white px-3.5 py-3.5 text-left transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.99]"
    >
      <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-md bg-gray-100">
        <Icon className="h-5 w-5 text-gray-700" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-gray-900">{title}</span>
          {badge && (
            <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
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
