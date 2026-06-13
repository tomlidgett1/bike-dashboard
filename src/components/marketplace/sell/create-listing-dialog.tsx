"use client";

import * as React from "react";
import {
  ArrowLeft,
  Layers,
  LayoutList,
  Package,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

// ============================================================
// Desktop "Create Listing" dialog
// Step 1: one item vs multiple items. Step 2: how to list.
// ============================================================

interface CreateListingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectGuided: () => void;
  onSelectForm: () => void;
  onSelectText: () => void;
  onSelectFacebook: () => void;
  onSelectBulk: () => void;
}

type DialogStep = "count" | "single" | "multi";

function CountCard({
  icon,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-1 flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white px-6 py-8 text-center transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-[0_8px_24px_rgba(17,17,17,0.08)]"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 transition-colors group-hover:bg-[#ffde59]/30">
        {icon}
      </div>
      <div>
        <p className="text-[17px] font-bold tracking-tight text-gray-900">{label}</p>
        <p className="mt-1 text-[13.5px] leading-snug text-gray-500">{description}</p>
      </div>
    </button>
  );
}

function MethodCard({
  icon,
  label,
  description,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2.5 rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-[0_6px_20px_rgba(17,17,17,0.07)]"
    >
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
          {icon}
        </div>
        {badge && (
          <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {badge}
          </span>
        )}
      </div>
      <div>
        <p className="text-[14.5px] font-semibold text-gray-900">{label}</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-gray-500">{description}</p>
      </div>
    </button>
  );
}

export function CreateListingDialog({
  open,
  onOpenChange,
  onSelectGuided,
  onSelectForm,
  onSelectText,
  onSelectFacebook,
  onSelectBulk,
}: CreateListingDialogProps) {
  const [step, setStep] = React.useState<DialogStep>("count");

  React.useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => setStep("count"), 250);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const choose = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] gap-0 rounded-2xl bg-white p-0">
        <div className="px-6 pb-4 pt-6">
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
              <DialogTitle className="text-[19px] font-bold tracking-tight text-gray-900">
                {step === "count" && "Create a listing"}
                {step === "single" && "List one item"}
                {step === "multi" && "List multiple items"}
              </DialogTitle>
              <p className="mt-0.5 text-[13.5px] text-gray-500">
                {step === "count" && "What are you selling?"}
                {step === "single" && "Pick how you'd like to list it"}
                {step === "multi" && "Pick how you'd like to list them"}
              </p>
            </div>
          </div>
        </div>

        <div
          key={step}
          className="px-6 pb-6 animate-in fade-in slide-in-from-right-2 duration-200"
        >
          {step === "count" && (
            <div className="flex gap-3">
              <CountCard
                icon={<Package className="h-7 w-7 text-gray-700" />}
                label="One item"
                description="A bike, part or accessory"
                onClick={() => setStep("single")}
              />
              <CountCard
                icon={<Layers className="h-7 w-7 text-gray-700" />}
                label="Multiple items"
                description="List several at once"
                onClick={() => setStep("multi")}
              />
            </div>
          )}

          {step === "single" && (
            <div className="grid grid-cols-2 gap-3">
              <MethodCard
                icon={<Sparkles className="h-5 w-5 text-gray-700" />}
                label="Quick upload"
                badge="Guided"
                description="Step-by-step questions — AI fills in details from your photos"
                onClick={() => choose(onSelectGuided)}
              />
              <MethodCard
                icon={<LayoutList className="h-5 w-5 text-gray-700" />}
                label="Fill in a form"
                badge="Fastest"
                description="Everything on one page — quicker if you know the details"
                onClick={() => choose(onSelectForm)}
              />
              <MethodCard
                icon={<Image src="/imessage.png" alt="" width={20} height={20} />}
                label="Text us"
                description="Send photos over iMessage — we build it"
                onClick={() => choose(onSelectText)}
              />
              <MethodCard
                icon={<Image src="/facebook.png" alt="" width={20} height={20} />}
                label="Import from Facebook"
                description="Paste your Marketplace link"
                onClick={() => choose(onSelectFacebook)}
              />
            </div>
          )}

          {step === "multi" && (
            <div className="grid grid-cols-2 gap-3">
              <MethodCard
                icon={<Sparkles className="h-5 w-5 text-gray-700" />}
                label="Bulk upload"
                badge="Guided"
                description="Upload all your photos — AI sorts them into listings"
                onClick={() => choose(onSelectBulk)}
              />
              <MethodCard
                icon={<Image src="/imessage.png" alt="" width={20} height={20} />}
                label="Text us"
                description="Send everything over iMessage — we do the rest"
                onClick={() => choose(onSelectText)}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
