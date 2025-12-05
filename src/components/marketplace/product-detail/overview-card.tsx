"use client";

import * as React from "react";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { CardSection } from "./expandable-section";
import { SpecGrid } from "./spec-grid";

// ============================================================
// Overview Card - Type-Specific Quick Info
// ============================================================

interface OverviewCardProps {
  product: MarketplaceProduct;
}

export function OverviewCard({ product }: OverviewCardProps) {
  const category = product.marketplace_category;

  if (category === "Bicycles") {
    return <BikeOverview product={product} />;
  } else if (category === "Parts") {
    return <PartOverview product={product} />;
  } else if (category === "Apparel") {
    return <ApparelOverview product={product} />;
  }

  // Fallback for other categories
  return (
    <CardSection>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-base font-semibold text-gray-900">Product Details</h3>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-sm text-gray-600">Category:</span>
          <span className="text-sm font-medium text-gray-900">{product.marketplace_category}</span>
        </div>
        {product.marketplace_subcategory && (
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Type:</span>
            <span className="text-sm font-medium text-gray-900">{product.marketplace_subcategory}</span>
          </div>
        )}
      </div>
    </CardSection>
  );
}

// ============================================================
// Bike Overview
// ============================================================

function BikeOverview({ product }: { product: MarketplaceProduct }) {
  const items = [
    { label: "Frame Size", value: product.frame_size },
    { label: "Material", value: product.frame_material },
    { label: "Groupset", value: product.groupset },
    { label: "Wheel Size", value: product.wheel_size },
    { label: "Suspension", value: product.suspension_type },
    { label: "Weight", value: product.bike_weight },
    { label: "Colour", value: [product.color_primary, product.color_secondary].filter(Boolean).join(" / ") || undefined },
    { label: "Usage", value: product.usage_estimate },
  ];

  return (
    <CardSection title="Overview">
      <SpecGrid items={items} columns={2} />
    </CardSection>
  );
}

// ============================================================
// Part Overview
// ============================================================

function PartOverview({ product }: { product: MarketplaceProduct }) {
  const items = [
    { label: "Category", value: product.marketplace_subcategory },
    { label: "Part Type", value: product.part_type_detail },
    { label: "Compatibility", value: product.compatibility_notes },
    { label: "Material", value: product.material },
    { label: "Weight", value: product.weight },
    { label: "Colour", value: product.color_primary },
    { label: "Usage", value: product.usage_estimate },
  ];

  return (
    <CardSection title="Overview">
      <SpecGrid items={items} columns={1} />
    </CardSection>
  );
}

// ============================================================
// Apparel Overview
// ============================================================

function ApparelOverview({ product }: { product: MarketplaceProduct }) {
  const items = [
    { label: "Category", value: product.marketplace_subcategory },
    { label: "Size", value: product.size },
    { label: "Fit", value: product.gender_fit },
    { label: "Material", value: product.apparel_material },
    { label: "Colour", value: product.color_primary },
    { label: "Usage", value: product.usage_estimate },
  ];

  return (
    <CardSection title="Overview">
      <SpecGrid items={items} columns={2} />
    </CardSection>
  );
}

