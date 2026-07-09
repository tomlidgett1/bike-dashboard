"use client";

import * as React from "react";
import { Plus, Scan, Tag, Truck, ChevronDown, Package, Bike } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StoreCarouselPage } from "@/lib/types/store";
import { cn } from "@/lib/utils";

export type CarouselCreateAction = "scan" | "brand" | "uber" | "custom";

export interface CarouselCreateRequest {
  id: number;
  action: CarouselCreateAction;
  storePage: StoreCarouselPage;
}

interface StoreCarouselsNewMenuProps {
  defaultStorePage: StoreCarouselPage;
  onCreate: (action: CarouselCreateAction, storePage: StoreCarouselPage) => void;
  disabled?: boolean;
}

export function StoreCarouselsNewMenu({
  defaultStorePage,
  onCreate,
  disabled,
}: StoreCarouselsNewMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [storePage, setStorePage] = React.useState<StoreCarouselPage>(defaultStorePage);

  React.useEffect(() => {
    setStorePage(defaultStorePage);
  }, [defaultStorePage]);

  const run = (action: CarouselCreateAction) => {
    onCreate(action, storePage);
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="rounded-full" disabled={disabled}>
          <Plus className="size-4" />
          New
          <ChevronDown className="size-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Add to</DropdownMenuLabel>
        <div className="px-2 pb-2">
          <div className="flex items-center bg-gray-100 p-0.5 rounded-full w-full">
            <button
              type="button"
              onClick={() => setStorePage("products")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-full transition-colors",
                storePage === "products"
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              <Package className="h-3 w-3" />
              Products
            </button>
            <button
              type="button"
              onClick={() => setStorePage("bikes")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-full transition-colors",
                storePage === "bikes"
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              <Bike className="h-3 w-3" />
              Bikes
            </button>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => run("scan")}>
          <Scan />
          Scan Lightspeed
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("brand")}>
          <Tag />
          Add brand carousel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("uber")}>
          <Truck />
          Add Uber carousel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("custom")}>
          <Plus />
          Add custom carousel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
