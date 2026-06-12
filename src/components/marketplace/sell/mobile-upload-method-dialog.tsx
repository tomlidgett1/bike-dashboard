"use client";

import * as React from "react";
import {
  ArrowLeft,
  ChevronRight,
  Layers,
  LayoutList,
  Package,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
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

type SheetView = "count" | "single" | "multi";

const VIEW_TITLES: Record<SheetView, { title: string; subtitle: string }> = {
  count: { title: "List on Yellow Jersey", subtitle: "What are you selling?" },
  single: { title: "One item", subtitle: "How do you want to list it?" },
  multi: { title: "Multiple items", subtitle: "How do you want to list them?" },
};

// Smoothly animates the sheet's height as views change.
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

function ChoiceCard({
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
      className="flex w-full items-center gap-3.5 rounded-2xl border border-gray-200 bg-white px-4 py-4 text-left transition-colors hover:bg-gray-50 active:scale-[0.985] active:bg-gray-100"
      style={{ transition: "transform 150ms ease, background-color 150ms ease" }}
    >
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[16px] font-semibold tracking-tight text-gray-900">{label}</p>
          {badge && (
            <span className="rounded-full bg-[#ffde59] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-900">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-gray-500">{description}</p>
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
  const [view, setView] = React.useState<SheetView>("count");
  const [direction, setDirection] = React.useState<"forward" | "back">("forward");

  React.useEffect(() => {
    if (!isOpen) {
      // Reset after the close animation finishes so content doesn't jump mid-exit.
      const timer = setTimeout(() => setView("count"), 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const goTo = (next: SheetView, dir: "forward" | "back") => {
    setDirection(dir);
    setView(next);
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
                onClick={() => goTo("count", "back")}
                aria-label="Back"
                className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 active:bg-gray-200"
              >
                <ArrowLeft className="h-[18px] w-[18px]" />
              </button>
            )}
            <div className="min-w-0">
              <p className="text-[17px] font-bold tracking-tight text-gray-900">{title}</p>
              <p className="text-[13px] text-gray-500">{subtitle}</p>
            </div>
          </div>
        </div>

        <div
          key={view}
          className={cn(
            "space-y-2 px-4 pb-3 pt-2 animate-in fade-in duration-300",
            direction === "forward" ? "slide-in-from-right-4" : "slide-in-from-left-4",
          )}
        >
          {view === "count" && (
            <>
              <ChoiceCard
                icon={<Package className="h-[22px] w-[22px] text-gray-700" />}
                label="One item"
                description="A bike, part or accessory"
                onClick={() => goTo("single", "forward")}
              />
              <ChoiceCard
                icon={<Layers className="h-[22px] w-[22px] text-gray-700" />}
                label="Multiple items"
                description="List several things at once"
                onClick={() => goTo("multi", "forward")}
              />
            </>
          )}

          {view === "single" && (
            <>
              <ChoiceCard
                icon={<Sparkles className="h-[22px] w-[22px] text-gray-700" />}
                label="Quick upload"
                badge="Easiest"
                description="Snap photos — AI fills in the details"
                onClick={() => choose(onSelectGuided)}
              />
              <ChoiceCard
                icon={<LayoutList className="h-[22px] w-[22px] text-gray-700" />}
                label="Fill in a form"
                description="Type the details yourself, all on one page"
                onClick={() => choose(onSelectForm)}
              />
              <ChoiceCard
                icon={<Image src="/imessage.png" alt="" width={22} height={22} />}
                label="Text us"
                description="Send photos over iMessage — we build the listing"
                onClick={() => choose(onSelectText)}
              />
              <ChoiceCard
                icon={<Image src="/facebook.png" alt="" width={22} height={22} />}
                label="Import from Facebook"
                description="Paste your Marketplace link"
                onClick={() => choose(onSelectFacebook)}
              />
            </>
          )}

          {view === "multi" && (
            <>
              <ChoiceCard
                icon={<Sparkles className="h-[22px] w-[22px] text-gray-700" />}
                label="Bulk upload"
                badge="Easiest"
                description="Upload all your photos — AI sorts them into listings"
                onClick={() => choose(onSelectBulk)}
              />
              <ChoiceCard
                icon={<Image src="/imessage.png" alt="" width={22} height={22} />}
                label="Text us"
                description="Send everything over iMessage — we do the rest"
                onClick={() => choose(onSelectText)}
              />
            </>
          )}
        </div>

        <div className="pb-[max(1rem,env(safe-area-inset-bottom))]" />
      </AnimatedHeight>
    </SpringBottomSheet>
  );
}
