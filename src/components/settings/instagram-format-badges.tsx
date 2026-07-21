"use client";

import type { ReactNode } from "react";
import { Circle, ImageIcon, Package, X } from "lucide-react";
import {
  type InstagramDestination,
  type InstagramPostAspect,
} from "@/lib/instagram/formats";
import { cn } from "@/lib/utils";

function SegmentedBadge({
  active,
  onClick,
  children,
  disabled,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-white text-gray-800 shadow-sm"
          : "text-gray-600 hover:bg-gray-200/70",
        disabled && "opacity-50",
      )}
    >
      {children}
    </button>
  );
}

export function InstagramFormatBadges({
  destination,
  aspect,
  includeLogo,
  logoUrl,
  productName,
  productImageUrl,
  onDestinationChange,
  onAspectChange,
  onIncludeLogoChange,
  onOpenProductPicker,
  onClearProduct,
  disabled,
  showDestination = true,
}: {
  destination: InstagramDestination;
  aspect: InstagramPostAspect;
  includeLogo: boolean;
  logoUrl: string | null;
  productName?: string | null;
  productImageUrl?: string | null;
  onDestinationChange: (value: InstagramDestination) => void;
  onAspectChange: (value: InstagramPostAspect) => void;
  onIncludeLogoChange: (value: boolean) => void;
  onOpenProductPicker?: () => void;
  onClearProduct?: () => void;
  disabled?: boolean;
  showDestination?: boolean;
}) {
  const hasLogo = Boolean(logoUrl);
  const hasProduct = Boolean(productImageUrl);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {showDestination ? (
        <div className="flex w-fit items-center rounded-md bg-gray-100 p-0.5">
          <SegmentedBadge
            active={destination === "post"}
            disabled={disabled}
            onClick={() => onDestinationChange("post")}
            title="Feed post"
          >
            <ImageIcon className="h-3 w-3" />
            Post
          </SegmentedBadge>
          <SegmentedBadge
            active={destination === "story"}
            disabled={disabled}
            onClick={() => onDestinationChange("story")}
            title="Story · 9:16 · 1080×1920"
          >
            <Circle className="h-3 w-3" />
            Story
          </SegmentedBadge>
        </div>
      ) : null}

      {destination === "post" ? (
        <div className="flex w-fit items-center rounded-md bg-gray-100 p-0.5">
          <SegmentedBadge
            active={aspect === "square"}
            disabled={disabled}
            onClick={() => onAspectChange("square")}
            title="Square feed · 1:1 · 1080×1080"
          >
            Square 1:1
          </SegmentedBadge>
          <SegmentedBadge
            active={aspect === "portrait"}
            disabled={disabled}
            onClick={() => onAspectChange("portrait")}
            title="Portrait feed · 4:5 · 1080×1350"
          >
            Portrait 4:5
          </SegmentedBadge>
        </div>
      ) : null}

      {onOpenProductPicker ? (
        <button
          type="button"
          disabled={disabled}
          title="Use an approved catalogue primary photo"
          onClick={onOpenProductPicker}
          className={cn(
            "inline-flex max-w-[13rem] items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
            hasProduct
              ? "border-gray-300 bg-white text-gray-800 shadow-sm"
              : "border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200/70",
            disabled && "opacity-50",
          )}
        >
          {hasProduct ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={productImageUrl!}
              alt=""
              className="h-3.5 w-3.5 rounded-sm object-cover"
            />
          ) : (
            <Package className="h-3 w-3" />
          )}
          <span className="truncate">
            {hasProduct ? productName || "Product photo" : "Product photo"}
          </span>
          {hasProduct && onClearProduct ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                onClearProduct();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onClearProduct();
                }
              }}
              className="rounded-sm p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Clear product photo"
            >
              <X className="h-3 w-3" />
            </span>
          ) : null}
        </button>
      ) : null}

      <button
        type="button"
        disabled={disabled || !hasLogo}
        title={
          hasLogo
            ? "Include your store logo as an AI image input (works for generated posts and uploaded photos)"
            : "Upload a store logo in Settings first"
        }
        onClick={() => onIncludeLogoChange(!includeLogo)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
          includeLogo && hasLogo
            ? "border-gray-300 bg-white text-gray-800 shadow-sm"
            : "border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200/70",
          (!hasLogo || disabled) && "opacity-50",
        )}
      >
        {hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl!}
            alt=""
            className="h-3.5 w-3.5 rounded-sm object-contain"
          />
        ) : (
          <span className="h-3.5 w-3.5 rounded-sm bg-gray-300" />
        )}
        Include our logo
      </button>
    </div>
  );
}
