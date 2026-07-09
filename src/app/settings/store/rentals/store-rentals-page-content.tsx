"use client";

import * as React from "react";
import { Plus, Package, CalendarDays, Shop } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import {
  DashboardFloatingPage,
} from "@/components/layout/dashboard-floating-page";
import {
  StoreRentalsManager,
  type RentalsTab,
} from "@/components/settings/store-rentals-manager";
import { cn } from "@/lib/utils";

export function StoreRentalsPageContent() {
  const [activeTab, setActiveTab] = React.useState<RentalsTab>("products");
  const [addRequest, setAddRequest] = React.useState(0);

  return (
    <DashboardFloatingPage
      title="Rentals"
      icon={Shop}
      description="Add hire products, respond to booking requests, and manage your rental calendar."
      flush
      actions={
        activeTab === "products" ? (
          <Button size="sm" className="rounded-full" onClick={() => setAddRequest((n) => n + 1)}>
            <Plus className="size-4" />
            Add rental
          </Button>
        ) : undefined
      }
      toolbar={
        <div className="flex items-center bg-gray-100 p-0.5 rounded-full w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("products")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors",
              activeTab === "products"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <Package size={15} />
            Rental products
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bookings")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors",
              activeTab === "bookings"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Bookings
          </button>
        </div>
      }
    >
      <StoreRentalsManager activeTab={activeTab} addRequest={addRequest} />
    </DashboardFloatingPage>
  );
}
