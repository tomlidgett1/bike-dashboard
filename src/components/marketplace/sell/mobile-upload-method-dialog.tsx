"use client";

import * as React from "react";
import { ArrowLeft } from '@/components/layout/app-sidebar/dashboard-icons';
import { cn } from "@/lib/utils";
import { SpringBottomSheet } from "@/components/ui/spring-bottom-sheet";
import { ListingCountBento } from "./listing-count-bento";
import { ListingMethodBento } from "./listing-method-bento";
import { ListingPhotosPanel, type ListingPhotoDraft } from "./listing-photos-panel";

interface MobileUploadMethodDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGuided: (photoDraft: ListingPhotoDraft) => void;
  onSelectQuickUpload: (photoDraft: ListingPhotoDraft) => void;
  onSelectText: () => void;
  onSelectFacebook: () => void;
  onSelectBulk: () => void;
}

type SheetView = "count" | "method" | "photos";
type ListingMode = "guided" | "form";

const emptyPhotoDraft = (): ListingPhotoDraft => ({ images: [], uploadedImages: [] });

const VIEW_TITLES: Record<SheetView, { title: string; subtitle: string }> = {
  count: { title: "List on Yellow Jersey", subtitle: "One item or bulk" },
  method: {
    title: "How do you want to list it?",
    subtitle: "Pick the method that suits you",
  },
  photos: {
    title: "Add photos",
    subtitle: "We'll recognise what you're selling",
  },
};

function AnimatedHeight({ children }: { children: React.ReactNode }) {
  const innerRef = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState<number | undefined>(undefined);

  React.useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    setHeight(el.offsetHeight);
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      style={{
        height,
        transition: "height 320ms cubic-bezier(0.32, 0.72, 0, 1)",
        overflow: "hidden",
      }}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}

export function MobileUploadMethodDialog({
  isOpen,
  onClose,
  onSelectGuided,
  onSelectQuickUpload,
  onSelectText,
  onSelectFacebook,
  onSelectBulk,
}: MobileUploadMethodDialogProps) {
  const [view, setView] = React.useState<SheetView>("count");
  const [photoDraft, setPhotoDraft] = React.useState<ListingPhotoDraft>(emptyPhotoDraft);
  const [listingMode, setListingMode] = React.useState<ListingMode | null>(null);
  const [direction, setDirection] = React.useState<"forward" | "back">("forward");

  React.useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setView("count");
        setPhotoDraft(emptyPhotoDraft());
        setListingMode(null);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const goTo = (next: SheetView, dir: "forward" | "back") => {
    setDirection(dir);
    setView(next);
  };

  const goBack = () => {
    if (view === "photos") {
      setPhotoDraft(emptyPhotoDraft());
      setListingMode(null);
      goTo("method", "back");
    } else if (view === "method") {
      goTo("count", "back");
    }
  };

  const choose = (action: () => void) => {
    onClose();
    action();
  };

  const { title, subtitle } = VIEW_TITLES[view];

  return (
    <SpringBottomSheet
      open={isOpen}
      onClose={onClose}
      aria-label={title}
      className="gap-0 p-0"
    >
      <AnimatedHeight>
        <div className="px-4 pb-2 pt-1">
          <div className="flex items-center gap-2">
            {view !== "count" && (
              <button
                type="button"
                onClick={goBack}
                aria-label="Back"
                className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 active:bg-gray-200"
              >
                <ArrowLeft className="h-[18px] w-[18px]" />
              </button>
            )}
            <div className="min-w-0">
              <p className="text-[19px] font-bold tracking-tight text-gray-900">{title}</p>
              <p className="text-[14px] text-gray-500">{subtitle}</p>
            </div>
          </div>
        </div>

        <div
          key={view}
          className={cn(
            "px-4 pb-3 pt-2 animate-in fade-in duration-300",
            direction === "forward" ? "slide-in-from-right-4" : "slide-in-from-left-4",
          )}
        >
          {view === "count" && (
            <ListingCountBento
              onSelectOneItem={() => goTo("method", "forward")}
              onSelectBulk={() => choose(onSelectBulk)}
            />
          )}

          {view === "method" && (
            <ListingMethodBento
              onSelectGuided={() => {
                setPhotoDraft(emptyPhotoDraft());
                setListingMode("guided");
                goTo("photos", "forward");
              }}
              onSelectQuickUpload={() => {
                setPhotoDraft(emptyPhotoDraft());
                setListingMode("form");
                goTo("photos", "forward");
              }}
              onSelectText={() => choose(onSelectText)}
              onSelectFacebook={() => choose(onSelectFacebook)}
            />
          )}

          {view === "photos" && (
            <ListingPhotosPanel
              draft={photoDraft}
              onChange={setPhotoDraft}
              onContinue={() => {
                if (listingMode === "guided") {
                  choose(() => onSelectGuided(photoDraft));
                } else if (listingMode === "form") {
                  choose(() => onSelectQuickUpload(photoDraft));
                }
              }}
            />
          )}
        </div>

        <div className="pb-[max(1rem,env(safe-area-inset-bottom))]" />
      </AnimatedHeight>
    </SpringBottomSheet>
  );
}
