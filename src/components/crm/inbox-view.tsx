"use client";

import { StoreCustomerInquiriesPanel } from "@/components/settings/store-customer-inquiries-panel";

export function InboxView() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <StoreCustomerInquiriesPanel embedded />
    </div>
  );
}
