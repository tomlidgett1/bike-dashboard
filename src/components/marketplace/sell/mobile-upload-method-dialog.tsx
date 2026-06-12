"use client";

import * as React from "react";
import {
  ChevronRight,
  Layers,
  LayoutList,
  Sparkles,
  Wand2,
} from "lucide-react";
import Image from "next/image";
import { Separator } from "@/components/ui/separator";
import { SpringBottomSheet } from "@/components/ui/spring-bottom-sheet";

interface MobileUploadMethodDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGuided: () => void;
  onSelectForm: () => void;
  onSelectText: () => void;
  onSelectFacebook: () => void;
  onSelectBulk: () => void;
}

interface MethodRowProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  badge?: string;
}

function MethodRow({ icon, label, description, badge, onClick }: MethodRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md border border-gray-200 bg-white px-3.5 py-3.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-gray-100">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[15px] font-semibold text-gray-900">{label}</p>
          {badge && (
            <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-gray-500">{description}</p>
      </div>
      <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-300" />
    </button>
  );
}

export function MobileUploadMethodDialog({
  isOpen,
  onClose,
  onSelectGuided,
  onSelectForm,
  onSelectText,
  onSelectFacebook,
  onSelectBulk,
}: MobileUploadMethodDialogProps) {
  return (
    <SpringBottomSheet
      open={isOpen}
      onClose={onClose}
      aria-label="How would you like to list?"
      className="gap-0 p-0"
    >
      <div className="px-4 pb-4 pt-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Sell your bike
        </p>
        <h2 className="mt-1 text-[24px] font-bold leading-tight tracking-tight text-gray-900">
          How would you like to list?
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-gray-500">
          Pick the fastest path for this listing. Guided and Form both include AI
          recommendations and optional full bike specs.
        </p>
      </div>

      <Separator />

      <div className="space-y-5 px-4 py-4">
        <div>
          <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Quick upload · one bike
          </p>
          <div className="mt-2 space-y-2">
            <MethodRow
              icon={<Wand2 className="h-5 w-5 text-gray-700" />}
              label="Guided"
              badge="Simplest"
              description="One field at a time, with AI helping from your photos."
              onClick={() => {
                onClose();
                onSelectGuided();
              }}
            />
            <MethodRow
              icon={<LayoutList className="h-5 w-5 text-gray-700" />}
              label="Form"
              description="Everything on one page, still AI-assisted."
              onClick={() => {
                onClose();
                onSelectForm();
              }}
            />
          </div>
        </div>

        <div>
          <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Several at once
          </p>
          <div className="mt-2">
            <MethodRow
              icon={<Layers className="h-5 w-5 text-gray-700" />}
              label="Bulk upload"
              description="Upload multiple products and let AI sort them into listings."
              onClick={() => {
                onClose();
                onSelectBulk();
              }}
            />
          </div>
        </div>

        <div className="rounded-md border border-gray-200 bg-white p-3.5">
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
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => {
            onClose();
            onSelectText();
          }}
          className="flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-100"
        >
          <Image src="/imessage.png" alt="" width={16} height={16} />
          Text upload
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            onSelectFacebook();
          }}
          className="flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-100"
        >
          <Image src="/facebook.png" alt="" width={16} height={16} />
          Facebook
        </button>
      </div>

      <div className="h-safe-area-inset-bottom pb-4" />
    </SpringBottomSheet>
  );
}
