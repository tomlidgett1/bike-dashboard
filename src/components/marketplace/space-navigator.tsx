"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ShoppingBag, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarketplaceSpace } from "@/lib/types/marketplace";

// ============================================================
// Space Navigator
// Navigation between the two marketplace "spaces":
// - Marketplace (default): Private listings from individuals
// - Bike Stores: Products from bike stores
// ============================================================

interface SpaceConfig {
  id: MarketplaceSpace;
  label: string;
  shortLabel: string;
  tagline: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SPACES: SpaceConfig[] = [
  {
    id: 'marketplace',
    label: 'Marketplace',
    shortLabel: 'Marketplace',
    tagline: 'Fresh finds from private sellers',
    icon: ShoppingBag,
  },
  {
    id: 'stores',
    label: 'Bike Stores',
    shortLabel: 'Stores',
    tagline: "Compare prices across Australia's bike shops",
    icon: Store,
  },
];

interface SpaceNavigatorProps {
  currentSpace: MarketplaceSpace;
  onSpaceChange: (space: MarketplaceSpace) => void;
  className?: string;
}

export function SpaceNavigator({ 
  currentSpace, 
  onSpaceChange,
  className,
}: SpaceNavigatorProps) {
  const currentSpaceConfig = SPACES.find(s => s.id === currentSpace) || SPACES[0];

  return (
    <div className={cn("w-full", className)}>
      {/* Desktop Navigation - Full tabs with tagline */}
      <div className="hidden sm:block">
        <div className="flex flex-col gap-2">
          {/* Space Tabs */}
          <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
            {SPACES.map((space) => {
              const Icon = space.icon;
              const isActive = currentSpace === space.id;
              
              return (
                <button
                  key={space.id}
                  onClick={() => onSpaceChange(space.id)}
                  className={cn(
                    "relative flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all cursor-pointer whitespace-nowrap",
                    isActive
                      ? "text-gray-900 bg-white shadow-sm"
                      : "text-gray-600 hover:text-gray-800 hover:bg-gray-200/60"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {space.label}
                </button>
              );
            })}
          </div>
          
          {/* Space Tagline */}
          <p className="text-sm text-gray-500 pl-1">
            {currentSpaceConfig.tagline}
          </p>
        </div>
      </div>

      {/* Mobile Navigation - Segmented Control */}
      <MobileSegmentedControl 
        currentSpace={currentSpace} 
        onSpaceChange={onSpaceChange} 
      />
    </div>
  );
}

// ============================================================
// Mobile Segmented Control
// Compact iOS-style segmented control for mobile
// ============================================================

interface MobileSegmentedControlProps {
  currentSpace: MarketplaceSpace;
  onSpaceChange: (space: MarketplaceSpace) => void;
}

function MobileSegmentedControl({ currentSpace, onSpaceChange }: MobileSegmentedControlProps) {
  return (
    <div className="sm:hidden">
      <div className="flex bg-gray-100 rounded-md p-0.5">
        {SPACES.map((space) => {
          const Icon = space.icon;
          const isActive = currentSpace === space.id;
          
          return (
            <button
              key={space.id}
              onClick={() => onSpaceChange(space.id)}
              className={cn(
                "relative flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md transition-all cursor-pointer"
              )}
            >
              {/* Animated background for active state */}
              {isActive && (
                <motion.div
                  layoutId="space-indicator"
                  className="absolute inset-0 bg-white rounded-md shadow-sm"
                  transition={{ 
                    type: "spring", 
                    bounce: 0.2, 
                    duration: 0.4 
                  }}
                />
              )}
              
              {/* Icon and label */}
              <span className={cn(
                "relative z-10 flex items-center gap-1.5 transition-colors",
                isActive ? "text-gray-900" : "text-gray-600"
              )}>
                <Icon className="h-4 w-4" />
                <span className="text-xs font-medium">{space.shortLabel}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Fixed Mobile Space Navigator
// Fixed position variant for use in header
// ============================================================

interface FixedMobileSpaceNavigatorProps {
  currentSpace: MarketplaceSpace;
  onSpaceChange: (space: MarketplaceSpace) => void;
}

export function FixedMobileSpaceNavigator({ 
  currentSpace, 
  onSpaceChange 
}: FixedMobileSpaceNavigatorProps) {
  return (
    <div className="sm:hidden fixed top-14 left-0 right-0 z-40 bg-white border-b border-gray-200 px-3 py-2.5">
      <MobileSegmentedControl 
        currentSpace={currentSpace} 
        onSpaceChange={onSpaceChange} 
      />
    </div>
  );
}

// ============================================================
// Hook: useMarketplaceSpace
// Manages space state from URL params
// ============================================================

export function useMarketplaceSpace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Get current space from URL, default to 'marketplace'
  const spaceParam = searchParams.get('space');
  const viewParam = searchParams.get('view');
  
  // Support legacy 'view' param for backwards compatibility
  const currentSpace: MarketplaceSpace = React.useMemo(() => {
    if (spaceParam === 'stores' || viewParam === 'stores') return 'stores';
    return 'marketplace';
  }, [spaceParam, viewParam]);
  
  // Change space and update URL
  const setSpace = React.useCallback((newSpace: MarketplaceSpace) => {
    const params = new URLSearchParams(searchParams.toString());
    
    // Remove old params
    params.delete('view');
    params.delete('space');
    
    // Only add space param if not marketplace (default)
    if (newSpace !== 'marketplace') {
      params.set('space', newSpace);
    }
    
    // Clear category filters when switching spaces
    params.delete('level1');
    params.delete('level2');
    params.delete('level3');
    
    const newUrl = params.toString()
      ? `/marketplace?${params.toString()}`
      : '/marketplace';
    
    router.push(newUrl, { scroll: false });
  }, [router, searchParams]);
  
  return { currentSpace, setSpace };
}

// Export space configs for use elsewhere
export { SPACES };
export type { SpaceConfig };

