"use client";

import * as React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Store, Loader2, Check } from "lucide-react";
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
  product_count: number;
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

  // Fetch available stores
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
      <div className={cn("flex items-center gap-2 py-1", className)}>
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        <span className="text-sm text-gray-500">Loading stores...</span>
      </div>
    );
  }

  if (stores.length === 0) {
    return null;
  }

  return (
    <div className={cn("w-full", className)}>
      {/* Store Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
        {/* All Stores Pill */}
        <button
          onClick={() => onStoreChange(null)}
          className={cn(
            "relative flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all whitespace-nowrap flex-shrink-0 cursor-pointer",
            selectedStoreId === null
              ? "bg-gray-900 text-white shadow-md"
              : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300 hover:shadow-sm"
          )}
        >
          <Store className="h-4 w-4" />
          <span className="text-sm">All Stores</span>
          {selectedStoreId === null && (
            <Check className="h-3.5 w-3.5 ml-0.5" />
          )}
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-gray-200 flex-shrink-0" />

        {/* Individual Store Pills */}
        {stores.map((store) => {
          const isSelected = selectedStoreId === store.id;
          
          return (
            <motion.button
              key={store.id}
              onClick={() => onStoreChange(isSelected ? null : store.id)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                "relative flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all whitespace-nowrap flex-shrink-0 cursor-pointer",
                isSelected
                  ? "bg-gray-900 text-white shadow-md"
                  : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300 hover:shadow-sm"
              )}
            >
              {/* Store Logo or Icon */}
              {store.logo_url ? (
                <div className="relative h-5 w-5 rounded-full overflow-hidden border border-gray-200 flex-shrink-0">
                  <Image
                    src={store.logo_url}
                    alt={store.name}
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <Store className={cn(
                  "h-4 w-4",
                  isSelected ? "text-white" : "text-gray-400"
                )} />
              )}
              
              {/* Store Name */}
              <span className="text-sm">{store.name}</span>
              
              {/* Product Count Badge */}
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-md font-medium transition-colors",
                isSelected
                  ? "bg-white/20 text-white"
                  : "bg-gray-100 text-gray-500"
              )}>
                {store.product_count.toLocaleString()}
              </span>
              
              {/* Selected Indicator */}
              {isSelected && (
                <Check className="h-3.5 w-3.5 ml-0.5" />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

