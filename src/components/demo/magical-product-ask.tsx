"use client";

import * as React from "react";
import { PlaceholdersAndVanishInput } from "@/components/ui/placeholders-and-vanish-input";
import ShinyText from "@/components/ui/react-bits/shiny-text";
import { useGenie } from "@/components/providers/genie-provider";
import { buildProductGenieContext } from "@/lib/genie/product-context";
import type { ProductGenieContext } from "@/lib/genie/product-context";
import type { WorldClassProductPage } from "@/lib/demo/world-class-product-page-types";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { cn } from "@/lib/utils";

/** Build Genie context from a live listing, or fall back to researched page data. */
export function buildAskGenieContext(
  page: WorldClassProductPage,
  product?: MarketplaceProduct | null,
): ProductGenieContext {
  if (product) return buildProductGenieContext(product);

  const specsSummary = page.specifications
    .flatMap((section) =>
      section.specs.map((spec) => `${spec.label}: ${spec.value}`),
    )
    .slice(0, 48)
    .join("\n");

  return {
    id: `world-class-${page.query || page.productName}`,
    name: page.productName,
    brand: page.brand,
    model: page.model,
    bikeType: page.bikeType,
    modelYear: page.modelYear,
    category: page.productCategory,
    image: page.images[0]?.url ?? page.brandLogoUrl,
    url: typeof window !== "undefined" ? window.location.href : "/",
    description: page.heroSummary,
    productDescription: page.overviewParagraphs.join("\n\n") || null,
    productSpecs: specsSummary || null,
    storeName: page.brandStory?.name ?? page.brand,
  };
}

type MagicalProductAskProps = {
  page: WorldClassProductPage;
  product?: MarketplaceProduct | null;
  /** Compact layout for the mobile preview frame. */
  compact?: boolean;
  className?: string;
};

function buildStaticPlaceholder(page: WorldClassProductPage): string {
  const shortName = page.productName.split(" ").slice(0, 4).join(" ");
  if (page.productKind === "non_bike") {
    return `e.g. Is ${shortName} right for me?`;
  }
  return `e.g. How does the ${shortName} ride?`;
}

export function MagicalProductAsk({
  page,
  product,
  compact,
  className,
}: MagicalProductAskProps) {
  const { openForProduct } = useGenie();
  const placeholder = React.useMemo(
    () => buildStaticPlaceholder(page),
    [page],
  );

  const handleSubmit = React.useCallback(
    (_event: React.FormEvent<HTMLFormElement>, value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      openForProduct(buildAskGenieContext(page, product), {
        question: trimmed,
      });
    },
    [openForProduct, page, product],
  );

  return (
    <div
      className={cn(
        "relative flex w-full flex-col items-center justify-center",
        compact ? "py-10" : "py-16 sm:py-20",
        className,
      )}
    >
      <div className="relative z-10 w-full max-w-xl px-4">
        <div
          className={cn(
            "mb-6 text-center font-semibold tracking-tight",
            compact ? "text-2xl" : "text-3xl sm:text-4xl",
          )}
        >
          <ShinyText
            text="Ask anything about this product"
            speed={2.4}
            delay={0.6}
            color="#6b7280"
            shineColor="#111827"
            spread={110}
            direction="left"
            className={cn(
              "font-semibold tracking-tight",
              compact ? "text-2xl" : "text-3xl sm:text-4xl",
            )}
          />
        </div>
        <PlaceholdersAndVanishInput
          placeholder={placeholder}
          onChange={() => {}}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
