"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bike,
  Zap,
  Box,
  Disc,
  Cog,
  Grip,
  Armchair,
  CircleDot,
  Shield,
  Wrench,
  Laptop,
  Apple,
  Store,
  Tag,
  ChevronDown,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getLevel1Categories,
  getLevel2Categories,
  getLevel3Categories,
  hasLevel3,
} from "@/lib/constants/categories";

// ============================================================
// Advanced Category Filter
// 3-level hierarchical filtering with smooth animations
// ============================================================

interface AdvancedCategoryFilterProps {
  selectedLevel1: string | null;
  selectedLevel2: string | null;
  selectedLevel3: string | null;
  onLevel1Change: (level1: string | null) => void;
  onLevel2Change: (level2: string | null) => void;
  onLevel3Change: (level3: string | null) => void;
  counts?: Record<string, number>; // Optional: category counts
}

// Icon mapping for Level 1 categories
const LEVEL1_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "Bicycles": Bike,
  "E-Bikes": Zap,
  "Frames & Framesets": Box,
  "Wheels & Tyres": Disc,
  "Drivetrain": Cog,
  "Brakes": Disc,
  "Cockpit": Grip,
  "Seat & Seatposts": Armchair,
  "Pedals": CircleDot,
  "Accessories": Shield,
  "Apparel": Shield,
  "Protection": Shield,
  "Maintenance & Workshop": Wrench,
  "Tech & Electronics": Laptop,
  "Nutrition": Apple,
  "Shop Services": Store,
  "Marketplace Specials": Tag,
};

export function AdvancedCategoryFilter({
  selectedLevel1,
  selectedLevel2,
  selectedLevel3,
  onLevel1Change,
  onLevel2Change,
  onLevel3Change,
  counts = {},
}: AdvancedCategoryFilterProps) {
  const level1Categories = getLevel1Categories();
  const level2Categories = selectedLevel1 ? getLevel2Categories(selectedLevel1) : [];
  const level3Categories =
    selectedLevel1 && selectedLevel2
      ? getLevel3Categories(selectedLevel1, selectedLevel2)
      : [];

  const handleLevel1Click = (level1: string) => {
    if (selectedLevel1 === level1) {
      // Deselect and clear all
      onLevel1Change(null);
      onLevel2Change(null);
      onLevel3Change(null);
    } else {
      // Select new Level 1 and clear downstream
      onLevel1Change(level1);
      onLevel2Change(null);
      onLevel3Change(null);
    }
  };

  const handleLevel2Click = (level2: string) => {
    if (selectedLevel2 === level2) {
      // Deselect Level 2 and clear Level 3
      onLevel2Change(null);
      onLevel3Change(null);
    } else {
      // Select new Level 2 and clear Level 3
      onLevel2Change(level2);
      onLevel3Change(null);
    }
  };

  const handleLevel3Click = (level3: string) => {
    if (selectedLevel3 === level3) {
      onLevel3Change(null);
    } else {
      onLevel3Change(level3);
    }
  };

  const clearAll = () => {
    onLevel1Change(null);
    onLevel2Change(null);
    onLevel3Change(null);
  };

  // Build breadcrumb for active filters
  const activeBreadcrumb = selectedLevel1
    ? `${selectedLevel1}${selectedLevel2 ? ` > ${selectedLevel2}` : ""}${
        selectedLevel3 ? ` > ${selectedLevel3}` : ""
      }`
    : null;

  return (
    <div className="space-y-4">
      {/* Active Filter Breadcrumb */}
      <AnimatePresence>
        {activeBreadcrumb && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2"
          >
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-md shadow-sm">
              <span className="text-xs font-medium text-gray-700">
                {activeBreadcrumb}
              </span>
              <button
                onClick={clearAll}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level 1: Main Categories */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-700">Browse by Category</h3>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {/* All Products */}
          <button
            onClick={clearAll}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md transition-all whitespace-nowrap",
              !selectedLevel1
                ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                : "text-gray-600 bg-gray-100 hover:bg-gray-200/70"
            )}
          >
            All Products
          </button>

          {/* Level 1 Pills */}
          {level1Categories.map((level1) => {
            const Icon = LEVEL1_ICONS[level1] || Box;
            const isActive = selectedLevel1 === level1;
            const count = counts[level1];

            return (
              <button
                key={level1}
                onClick={() => handleLevel1Click(level1)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md transition-all whitespace-nowrap",
                  isActive
                    ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                    : "text-gray-600 bg-gray-100 hover:bg-gray-200/70"
                )}
              >
                <Icon className="h-4 w-4" />
                {level1}
                {count !== undefined && count > 0 && (
                  <span className="text-xs text-gray-500">({count})</span>
                )}
                {isActive && (
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-gray-400 transition-transform duration-200 ml-1",
                      selectedLevel1 === level1 && "rotate-180"
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Level 2: Subcategories (Animated) */}
      <AnimatePresence>
        {selectedLevel1 && level2Categories.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: 0.4,
              ease: [0.04, 0.62, 0.23, 0.98],
            }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pl-6 border-l-2 border-gray-200">
              <h4 className="text-xs font-medium text-gray-600">
                Select Type
              </h4>
              <div className="flex items-center gap-2 flex-wrap">
                {level2Categories.map((level2) => {
                  const isActive = selectedLevel2 === level2;
                  const hasL3 =
                    selectedLevel1 && hasLevel3(selectedLevel1, level2);

                  return (
                    <button
                      key={level2}
                      onClick={() => handleLevel2Click(level2)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap",
                        isActive
                          ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                          : "text-gray-600 bg-gray-100 hover:bg-gray-200/70"
                      )}
                    >
                      {level2}
                      {hasL3 && isActive && (
                        <ChevronDown className="h-3 w-3 text-gray-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level 3: Sub-subcategories (Animated) */}
      <AnimatePresence>
        {selectedLevel1 && selectedLevel2 && level3Categories.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: 0.4,
              ease: [0.04, 0.62, 0.23, 0.98],
            }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pl-12 border-l-2 border-gray-200 ml-6">
              <h4 className="text-xs font-medium text-gray-600">
                Refine Selection
              </h4>
              <div className="flex items-center gap-1.5 flex-wrap">
                {level3Categories.map((level3) => {
                  const isActive = selectedLevel3 === level3;

                  return (
                    <button
                      key={level3}
                      onClick={() => handleLevel3Click(level3)}
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap",
                        isActive
                          ? "text-gray-800 bg-white shadow-sm border border-gray-200"
                          : "text-gray-600 bg-gray-100 hover:bg-gray-200/70"
                      )}
                    >
                      {level3}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

