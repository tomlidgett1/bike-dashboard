"use client";

import * as React from "react";
import { MessageCircle } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { useAuthModal } from "@/components/providers/auth-modal-provider";
import { ProductInquiryButton } from "@/components/marketplace/product-inquiry-button";
import {
  getSellerIntentLabel,
  type SellerIntentReason,
} from "@/lib/genie/seller-intent";
import type { ProductGenieContext } from "@/lib/genie/product-context";

interface GenieSellerMessageCtaProps {
  product: ProductGenieContext;
  reason: SellerIntentReason;
  suggestedMessage: string;
}

export function GenieSellerMessageCta({
  product,
  reason,
  suggestedMessage,
}: GenieSellerMessageCtaProps) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [inquiryOpen, setInquiryOpen] = React.useState(false);

  if (!product.sellerId) return null;
  if (user?.id === product.sellerId) return null;

  const sellerName = product.storeName ?? "the seller";

  const handleMessageClick = () => {
    if (!user) {
      openAuthModal();
      return;
    }
    setInquiryOpen(true);
  };

  return (
    <>
      <div className="rounded-md border border-gray-200 bg-white px-3 py-3">
        <p className="text-xs leading-relaxed text-gray-600">
          {getSellerIntentLabel(reason)}
        </p>
        <Button
          type="button"
          size="sm"
          className="mt-2.5 h-9 w-full rounded-md text-xs font-medium"
          onClick={handleMessageClick}
        >
          <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
          Message {sellerName}
        </Button>
      </div>

      <ProductInquiryButton
        productId={product.id}
        productName={product.name}
        sellerId={product.sellerId}
        sellerName={product.storeName ?? undefined}
        productImage={product.image}
        productPrice={product.price ?? undefined}
        hideTrigger
        open={inquiryOpen}
        onOpenChange={setInquiryOpen}
        initialMessage={suggestedMessage}
        buttonLabel="Message seller"
      />
    </>
  );
}
