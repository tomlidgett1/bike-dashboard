"use client";

import * as React from "react";
import Image from "next/image";
import { ChevronDown, Store } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface BikeStoreOption {
  id: string;
  name: string;
  logo_url: string | null;
}

interface BikeStoresPickerProps {
  selectedStoreId?: string | null;
  onStoreSelect: (storeId: string) => void;
  onAllStores?: () => void;
  className?: string;
}

export function BikeStoresPicker({
  selectedStoreId,
  onStoreSelect,
  onAllStores,
  className,
}: BikeStoresPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [stores, setStores] = React.useState<BikeStoreOption[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    const fetchStores = async () => {
      setLoading(true);
      try {
        let list: BikeStoreOption[] = [];

        const filtersRes = await fetch("/api/marketplace/stores/filters");
        if (filtersRes.ok) {
          const data = await filtersRes.json();
          list = data.stores || [];
        }

        if (list.length === 0) {
          const storesRes = await fetch("/api/marketplace/stores");
          if (storesRes.ok) {
            const data = await storesRes.json();
            list = (data.stores || []).map(
              (store: { id: string; store_name: string; logo_url: string | null }) => ({
                id: store.id,
                name: store.store_name?.trim() || "Bike Store",
                logo_url: store.logo_url,
              })
            );
          }
        }

        if (!cancelled) {
          setStores(list);
        }
      } catch (error) {
        console.error("[BikeStoresPicker] Error fetching stores:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchStores();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedStore = stores.find((s) => s.id === selectedStoreId);
  const triggerLabel = selectedStore?.name ?? "All stores";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Choose a bike store"
          className={cn(
            "flex h-12 sm:h-11 max-w-[148px] sm:max-w-[200px] items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20 cursor-pointer",
            className
          )}
        >
          {selectedStore?.logo_url ? (
            <div className="relative h-5 w-5 flex-shrink-0 overflow-hidden rounded-full border border-gray-200">
              <Image src={selectedStore.logo_url} alt="" fill className="object-cover" />
            </div>
          ) : (
            <Store className="h-4 w-4 flex-shrink-0 text-gray-400" />
          )}
          <span className="truncate">{loading ? "Stores…" : triggerLabel}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[min(320px,70vh)] w-64 overflow-y-auto rounded-md border border-gray-200 bg-white p-1 shadow-lg"
      >
        {onAllStores && (
          <>
            <DropdownMenuItem
              className="rounded-md cursor-pointer"
              onSelect={() => {
                onAllStores();
                setOpen(false);
              }}
            >
              <Store className="h-4 w-4 text-gray-500" />
              <span>All bike stores</span>
            </DropdownMenuItem>
            {stores.length > 0 && <DropdownMenuSeparator className="my-1" />}
          </>
        )}
        {loading && (
          <div className="px-2 py-3 text-xs text-gray-500">Loading stores…</div>
        )}
        {!loading && stores.length === 0 && (
          <div className="px-2 py-3 text-xs text-gray-500">No stores available</div>
        )}
        {stores.map((store) => (
          <DropdownMenuItem
            key={store.id}
            className={cn(
              "rounded-md cursor-pointer gap-2",
              selectedStoreId === store.id && "bg-gray-100"
            )}
            onSelect={() => {
              onStoreSelect(store.id);
              setOpen(false);
            }}
          >
            {store.logo_url ? (
              <div className="relative h-5 w-5 flex-shrink-0 overflow-hidden rounded-full border border-gray-200">
                <Image
                  src={store.logo_url}
                  alt=""
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <Store className="h-4 w-4 flex-shrink-0 text-gray-400" />
            )}
            <span className="truncate">{store.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
