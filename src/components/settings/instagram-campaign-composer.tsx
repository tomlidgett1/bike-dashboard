"use client";

import type { ReactNode } from "react";
import { CalendarClock } from "lucide-react";
import { HomeV2ChatInput } from "@/components/genie/homev2-chat-input";
import { InstagramFormatBadges } from "@/components/settings/instagram-format-badges";
import type { InstagramPostAspect } from "@/lib/instagram/formats";
import { cn } from "@/lib/utils";

function SegmentButton({
  active,
  disabled,
  children,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
        active
          ? "bg-white text-gray-800 shadow-sm"
          : "text-gray-600 hover:bg-gray-200/70",
      )}
    >
      {children}
    </button>
  );
}

export function InstagramCampaignComposer({
  objective,
  durationDays,
  aspect,
  includeLogo,
  logoUrl,
  productName,
  productImageUrl,
  startAt,
  disabled,
  onObjectiveChange,
  onDurationChange,
  onAspectChange,
  onIncludeLogoChange,
  onOpenProductPicker,
  onClearProduct,
  onStartAtChange,
  onSubmit,
  belowInput,
}: {
  objective: string;
  durationDays: 5 | 10;
  aspect: InstagramPostAspect;
  includeLogo: boolean;
  logoUrl: string | null;
  productName?: string | null;
  productImageUrl?: string | null;
  startAt: string;
  disabled: boolean;
  onObjectiveChange: (value: string) => void;
  onDurationChange: (value: 5 | 10) => void;
  onAspectChange: (value: InstagramPostAspect) => void;
  onIncludeLogoChange: (value: boolean) => void;
  onOpenProductPicker?: () => void;
  onClearProduct?: () => void;
  onStartAtChange: (value: string) => void;
  onSubmit: () => void;
  belowInput?: ReactNode;
}) {
  const accessory = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex w-fit items-center rounded-md bg-gray-100 p-0.5">
        <SegmentButton
          active={durationDays === 5}
          disabled={disabled}
          onClick={() => onDurationChange(5)}
        >
          5 days
        </SegmentButton>
        <SegmentButton
          active={durationDays === 10}
          disabled={disabled}
          onClick={() => onDurationChange(10)}
        >
          10 days
        </SegmentButton>
      </div>
      <InstagramFormatBadges
        destination="post"
        aspect={aspect}
        includeLogo={includeLogo}
        logoUrl={logoUrl}
        productName={productName}
        productImageUrl={productImageUrl}
        disabled={disabled}
        showDestination={false}
        onDestinationChange={() => undefined}
        onAspectChange={onAspectChange}
        onIncludeLogoChange={onIncludeLogoChange}
        onOpenProductPicker={onOpenProductPicker}
        onClearProduct={onClearProduct}
      />
    </div>
  );

  return (
    <div className="w-full space-y-3">
      <HomeV2ChatInput
        value={objective}
        isRunning={disabled}
        onChange={onObjectiveChange}
        onSubmit={onSubmit}
        placeholder="Showcase our workshop and the people behind every service…"
        showDisclaimer={false}
        inputAccessory={accessory}
      />
      {belowInput ? (
        <div className="flex justify-center">{belowInput}</div>
      ) : null}
      <label className="mx-auto flex w-full max-w-sm items-center gap-3 rounded-md border border-gray-200 bg-white px-3.5 py-2.5 shadow-sm">
        <CalendarClock className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="text-xs font-medium text-gray-600">First post</span>
        <input
          type="datetime-local"
          value={startAt}
          disabled={disabled}
          onChange={(event) => onStartAtChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none disabled:opacity-60"
        />
      </label>
    </div>
  );
}
