"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGenie } from "@/components/providers/genie-provider";
import { buildProductGenieContext } from "@/lib/genie/product-context";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { cn } from "@/lib/utils";

interface ProductAskGenieButtonProps {
  product: MarketplaceProduct;
  className?: string;
}

export function ProductAskGenieButton({ product, className }: ProductAskGenieButtonProps) {
  const { openForProduct } = useGenie();

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className={cn(
        "h-11 w-full rounded-md border-gray-200 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50",
        className,
      )}
      onClick={() => openForProduct(buildProductGenieContext(product))}
    >
      <Sparkles className="mr-2 h-4 w-4 text-gray-600" />
      Ask a question
    </Button>
  );
}
