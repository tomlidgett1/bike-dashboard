"use client";

import {
  FloatingCard,
  FloatingCardPage,
  FloatingCardPageBody,
  FloatingCardPageHeader,
} from "@/components/layout/floating-card-page";
import { BrandLoadingSpinner } from "@/components/ui/brand-loading-spinner";

export default function StoreCustomerInquiriesLoading() {
  return (
    <div aria-busy="true" aria-label="Loading customer enquiries">
      <FloatingCardPage>
        <FloatingCardPageHeader>
          <div className="flex min-h-9 items-center">
            <p className="text-lg font-semibold tracking-tight text-gray-900">
              Customer enquiries
            </p>
          </div>
        </FloatingCardPageHeader>

        <FloatingCardPageBody>
          <FloatingCard>
            <div className="flex min-h-[min(70vh,32rem)] flex-1 items-center justify-center p-6">
              <BrandLoadingSpinner label="Loading enquiries…" size="lg" />
            </div>
          </FloatingCard>
        </FloatingCardPageBody>
      </FloatingCardPage>
    </div>
  );
}
