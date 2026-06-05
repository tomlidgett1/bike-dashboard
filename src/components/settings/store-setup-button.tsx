"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUserProfile } from "@/lib/hooks/use-user-profile";
import { isStoreSetupComplete, storeSetupProgress } from "@/lib/store/setup-steps";
import { StoreSetupModal } from "@/components/settings/store-setup-modal";

function useStoreSetup() {
  const { profile, refreshProfile } = useUserProfile();
  const [open, setOpen] = React.useState(false);
  const complete = profile ? isStoreSetupComplete(profile) : false;
  const progress = profile ? storeSetupProgress(profile) : 0;

  return { profile, refreshProfile, open, setOpen, complete, progress };
}

export function StoreSetupButton({ className }: { className?: string }) {
  const { open, setOpen, complete, progress, refreshProfile } = useStoreSetup();

  return (
    <>
      <Button
        type="button"
        variant={complete ? "outline" : "default"}
        size="sm"
        onClick={() => setOpen(true)}
        className={cn(
          !complete && "bg-[#FFC72C] text-gray-900 hover:bg-[#E6B328]",
          className
        )}
      >
        <Sparkles className="size-4" />
        Onboarding or setup
        {!complete && progress > 0 && (
          <span className="ml-1 rounded-md bg-white/80 px-1.5 py-0.5 text-xs font-medium text-gray-800">
            {progress}%
          </span>
        )}
      </Button>

      <StoreSetupModal
        open={open}
        onOpenChange={setOpen}
        onComplete={() => refreshProfile()}
      />
    </>
  );
}

export function StoreSetupBanner() {
  const { open, setOpen, complete, progress, refreshProfile } = useStoreSetup();

  if (complete) return null;

  return (
    <>
      <div className="flex flex-col gap-3 rounded-md border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">Finish setting up your storefront</p>
          <p className="mt-0.5 text-sm text-gray-500">
            A few quick steps so customers can find and trust your shop.
            {progress > 0 ? ` ${progress}% complete.` : ""}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setOpen(true)}
          className="shrink-0 bg-[#FFC72C] text-gray-900 hover:bg-[#E6B328]"
        >
          <Sparkles className="size-4" />
          Continue setup
        </Button>
      </div>

      <StoreSetupModal
        open={open}
        onOpenChange={setOpen}
        onComplete={() => refreshProfile()}
      />
    </>
  );
}
