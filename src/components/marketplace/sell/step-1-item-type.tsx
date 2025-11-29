"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Bike, Wrench, ShoppingBag } from "lucide-react";
import { ItemType } from "@/lib/types/listing";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ============================================================
// Step 1: Item Type Selection
// ============================================================

interface Step1ItemTypeProps {
  selectedType?: ItemType;
  onSelect: (type: ItemType) => void;
}

export function Step1ItemType({ selectedType, onSelect }: Step1ItemTypeProps) {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">What are you selling?</h2>
        <p className="text-gray-600">
          Choose the type of item you want to list on the marketplace
        </p>
      </div>

      {/* Item Type Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ItemTypeCard
          type="bike"
          icon={Bike}
          title="Complete Bikes"
          description="Full bicycles of any type - road, mountain, gravel, and more"
          examples={["Road bikes", "Mountain bikes", "E-bikes", "Kids bikes"]}
          isSelected={selectedType === "bike"}
          onSelect={() => onSelect("bike")}
        />

        <ItemTypeCard
          type="part"
          icon={Wrench}
          title="Parts & Components"
          description="Frames, wheels, groupsets, and all cycling components"
          examples={["Frames", "Wheelsets", "Groupsets", "Drivetrain"]}
          isSelected={selectedType === "part"}
          onSelect={() => onSelect("part")}
        />

        <ItemTypeCard
          type="apparel"
          icon={ShoppingBag}
          title="Apparel & Accessories"
          description="Clothing, shoes, helmets, and cycling accessories"
          examples={["Jerseys", "Shoes", "Helmets", "Computers"]}
          isSelected={selectedType === "apparel"}
          onSelect={() => onSelect("apparel")}
        />
      </div>

      {/* Info Box */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-sm text-gray-700">
          <span className="font-semibold">💡 Tip:</span> Each item type has a customised
          form to capture all the relevant details for your listing. You'll be guided
          through a step-by-step process to create a comprehensive listing that attracts
          buyers.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Item Type Card
// ============================================================

interface ItemTypeCardProps {
  type: ItemType;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  examples: string[];
  isSelected: boolean;
  onSelect: () => void;
}

function ItemTypeCard({
  icon: Icon,
  title,
  description,
  examples,
  isSelected,
  onSelect,
}: ItemTypeCardProps) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="text-left"
    >
      <Card
        className={cn(
          "h-full p-6 rounded-md border-2 transition-all cursor-pointer",
          isSelected
            ? "border-gray-900 bg-gray-50 shadow-md"
            : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
        )}
      >
        <div className="space-y-4">
          {/* Icon */}
          <div
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
              isSelected ? "bg-gray-900" : "bg-gray-100"
            )}
          >
            <Icon className={cn("h-6 w-6", isSelected ? "text-white" : "text-gray-600")} />
          </div>

          {/* Title & Description */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-600">{description}</p>
          </div>

          {/* Examples */}
          <div className="pt-2 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-500 mb-2">Examples:</p>
            <ul className="space-y-1">
              {examples.map((example, index) => (
                <li key={index} className="text-xs text-gray-600 flex items-center gap-1">
                  <span className="text-gray-400">•</span>
                  {example}
                </li>
              ))}
            </ul>
          </div>

          {/* Selected Indicator */}
          {isSelected && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="pt-2"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-900 text-white text-xs font-medium rounded-md">
                ✓ Selected
              </div>
            </motion.div>
          )}
        </div>
      </Card>
    </motion.button>
  );
}

