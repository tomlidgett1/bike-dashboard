"use client";

import * as React from "react";
import {
  ArrowLeft,
  ChevronRight,
  LayoutList,
  Sparkles,
  Upload,
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
}

interface QuickMethodRowProps extends MethodRowProps {
  badge?: string;
}

function MethodRow({ icon, label, description, onClick }: MethodRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 active:bg-muted"
    >
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-muted">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

function QuickMethodRow({ icon, label, description, badge, onClick }: QuickMethodRowProps) {
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
  const [view, setView] = React.useState<"methods" | "quick">("methods");

  React.useEffect(() => {
    if (!isOpen) {
      setView("methods");
    }
  }, [isOpen]);

  return (
    <SpringBottomSheet
      open={isOpen}
      onClose={onClose}
      aria-label={view === "quick" ? "Quick upload options" : "List your item"}
      className="gap-0 p-0"
    >
      {view === "methods" ? (
        <>
          <div className="px-4 pb-3 pt-1">
            <p className="text-sm font-semibold text-foreground">List your item</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Choose how to create your listing
            </p>
          </div>

          <Separator />

          <MethodRow
            icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
            label="Quick upload"
            description="AI fills in details from your photos"
            onClick={() => setView("quick")}
          />

          <Separator />

          <MethodRow
            icon={<Image src="/imessage.png" alt="iMessage" width={16} height={16} />}
            label="Text upload"
            description="Chat with us on iMessage — we build the listing"
            onClick={() => {
              onClose();
              onSelectText();
            }}
          />

          <Separator />

          <MethodRow
            icon={<Image src="/facebook.png" alt="Facebook" width={16} height={16} />}
            label="Import from Facebook"
            description="Paste a Marketplace link"
            onClick={() => {
              onClose();
              onSelectFacebook();
            }}
          />

          <Separator />

          <MethodRow
            icon={<Upload className="h-4 w-4 text-muted-foreground" />}
            label="Bulk upload"
            description="List multiple items at once"
            onClick={() => {
              onClose();
              onSelectBulk();
            }}
          />

          <div className="h-safe-area-inset-bottom pb-4" />
        </>
      ) : (
        <>
          <div className="px-4 pb-4 pt-1">
            <button
              type="button"
              onClick={() => setView("methods")}
              className="-ml-2 mb-3 inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Quick upload · one bike
            </p>
            <h2 className="mt-1 text-[24px] font-bold leading-tight tracking-tight text-gray-900">
              How would you like to list?
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-gray-500">
              Pick a guided step-by-step flow or a compact form. Both use AI recommendations
              and support optional full bike specs.
            </p>
          </div>

          <Separator />

          <div className="space-y-2 px-4 py-4">
            <QuickMethodRow
              icon={<Wand2 className="h-5 w-5 text-gray-700" />}
              label="Guided"
              badge="Simplest"
              description="One field at a time, with AI helping from your photos."
              onClick={() => {
                onClose();
                onSelectGuided();
              }}
            />
            <QuickMethodRow
              icon={<LayoutList className="h-5 w-5 text-gray-700" />}
              label="Form"
              description="Everything on one page, still AI-assisted."
              onClick={() => {
                onClose();
                onSelectForm();
              }}
            />
          </div>

          <div className="px-4 pb-4">
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

          <div className="h-safe-area-inset-bottom pb-4" />
        </>
      )}
    </SpringBottomSheet>
  );
}
