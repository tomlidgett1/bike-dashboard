"use client";

import * as React from "react";
import { Upload, Sparkles } from "lucide-react";
import Image from "next/image";
import { Separator } from "@/components/ui/separator";
import { SpringBottomSheet } from "@/components/ui/spring-bottom-sheet";

interface MobileUploadMethodDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectQuick: () => void;
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

function MethodRow({ icon, label, description, onClick }: MethodRowProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors text-left"
    >
      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </button>
  );
}

export function MobileUploadMethodDialog({
  isOpen,
  onClose,
  onSelectQuick,
  onSelectText,
  onSelectFacebook,
  onSelectBulk,
}: MobileUploadMethodDialogProps) {
  return (
    <SpringBottomSheet
      open={isOpen}
      onClose={onClose}
      aria-label="List your item"
      className="gap-0 p-0"
    >
      <div className="px-4 pb-3 pt-1">
        <p className="text-sm font-semibold text-foreground">List your item</p>
        <p className="text-xs text-muted-foreground mt-0.5">Choose how to create your listing</p>
      </div>

      <Separator />

      <MethodRow
        icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
        label="Quick upload"
        description="AI fills in details from your photos"
        onClick={() => { onClose(); onSelectQuick(); }}
      />

      <Separator />

      <MethodRow
        icon={<Image src="/imessage.png" alt="iMessage" width={16} height={16} />}
        label="Text upload"
        description="Chat with us on iMessage — we build the listing"
        onClick={() => { onClose(); onSelectText(); }}
      />

      <Separator />

      <MethodRow
        icon={<Image src="/facebook.png" alt="Facebook" width={16} height={16} />}
        label="Import from Facebook"
        description="Paste a Marketplace link"
        onClick={() => { onClose(); onSelectFacebook(); }}
      />

      <Separator />

      <MethodRow
        icon={<Upload className="h-4 w-4 text-muted-foreground" />}
        label="Bulk upload"
        description="List multiple items at once"
        onClick={() => { onClose(); onSelectBulk(); }}
      />

      <div className="h-safe-area-inset-bottom pb-4" />
    </SpringBottomSheet>
  );
}
