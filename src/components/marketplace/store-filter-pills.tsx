"use client";

import * as React from "react";
import Image from "next/image";
import { Store, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Store Filter Pills
// Horizontal scrollable pills for filtering products by store
// Used in the Stores space to filter to specific bike stores
// ============================================================

interface StoreFilterOption {
  id: string;
  name: string;
  logo_url: string | null;
}

interface StoreFilterPillsProps {
  selectedStoreId: string | null;
  onStoreChange: (storeId: string | null) => void;
  className?: string;
}

export function StoreFilterPills({
  selectedStoreId,
  onStoreChange,
  className,
}: StoreFilterPillsProps) {
  const [stores, setStores] = React.useState<StoreFilterOption[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchStores = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/marketplace/stores/filters');
        if (response.ok) {
          const data = await response.json();
          setStores(data.stores || []);
        }
      } catch (error) {
        console.error('[StoreFilterPills] Error fetching stores:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStores();
  }, []);

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 py-1", className)} aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-8 w-24 flex-shrink-0 rounded-full bg-gray-100 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (stores.length === 0) {
    return null;
  }

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
        {/* All Stores Pill */}
        <button
          type="button"
          onClick={() => onStoreChange(null)}
          className={cn(
            "relative flex items-center gap-2 px-3 py-1.5 rounded-full font-medium whitespace-nowrap flex-shrink-0 cursor-pointer border",
            selectedStoreId === null
              ? "bg-gray-900 text-white border-transparent shadow-md"
              : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
          )}
        >
          <Store className="h-4 w-4" />
          <span className="text-sm">All Stores</span>
          {selectedStoreId === null && <Check className="h-3.5 w-3.5 ml-0.5" />}
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-gray-200 flex-shrink-0" />

        {/* Individual Store Pills */}
        {stores.map((store) => {
          const isSelected = selectedStoreId === store.id;

          return (
            <button
              key={store.id}
              type="button"
              onClick={() => onStoreChange(isSelected ? null : store.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full font-medium whitespace-nowrap flex-shrink-0 cursor-pointer border",
                isSelected
                  ? "bg-gray-900 text-white border-transparent shadow-md"
                  : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
              )}
            >
              {store.logo_url ? (
                <div className="relative h-5 w-5 rounded-full overflow-hidden border border-white/30 flex-shrink-0">
                  <Image
                    src={store.logo_url}
                    alt={store.name}
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <Store className={cn("h-4 w-4", isSelected ? "text-white" : "text-gray-400")} />
              )}
              <span className="text-sm">{store.name}</span>
              {isSelected && <Check className="h-3.5 w-3.5 ml-0.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
