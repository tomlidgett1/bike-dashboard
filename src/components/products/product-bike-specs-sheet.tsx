"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BikeSpecsEditor } from "@/components/products/bike-specs-editor";
import { BikeIcon, BICYCLE_PRODUCT_ICON } from "@/components/ui/bike-icon";
import { hasBikeSpecs, parseBikeSpecs, type BikeSpecsData } from "@/lib/types/bike-specs";

interface ProductBikeSpecsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: string;
    description: string;
    display_name?: string | null;
    bike_specs?: unknown;
  } | null;
  onUpdate: (
    productId: string,
    updates: { is_bicycle?: boolean; bike_specs?: BikeSpecsData | null }
  ) => void;
}

export function ProductBikeSpecsSheet({
  open,
  onOpenChange,
  product,
  onUpdate,
}: ProductBikeSpecsSheetProps) {
  const parsedSpecs = React.useMemo(
    () => parseBikeSpecs(product?.bike_specs),
    [product?.bike_specs]
  );

  if (!product) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <div className="flex h-full flex-col px-5 pb-8 sm:px-6">
          <SheetHeader className="px-0 pt-1">
            <SheetTitle className="flex items-center gap-2 pr-8">
              <BikeIcon iconName={BICYCLE_PRODUCT_ICON} size={20} className="size-5 shrink-0" />
              Bicycle specifications
            </SheetTitle>
            <SheetDescription>
              Structured component specs for this complete bicycle. These appear on the product page below the image.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 flex-1">
            <BikeSpecsEditor
              productId={product.id}
              productName={product.display_name || product.description}
              initialSpecs={parsedSpecs}
              onSaved={(specs, isBicycle) => {
                onUpdate(product.id, {
                  is_bicycle: isBicycle,
                  bike_specs: specs,
                });
              }}
            />

            {hasBikeSpecs(parsedSpecs) && (
              <p className="mt-6 text-xs text-gray-500">
                Specifications are live on the marketplace product page when this product is marked as a bicycle.
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
