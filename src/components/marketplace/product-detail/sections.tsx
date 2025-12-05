"use client";

import * as React from "react";
import { Calendar, MapPin, Package, Truck, Mail, Phone, MessageCircle, CheckCircle2, XCircle } from "lucide-react";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import { ExpandableSection } from "./expandable-section";
import { SpecGrid, SpecGroup } from "./spec-grid";
import { ConditionBadge } from "./condition-badge";
import { cn } from "@/lib/utils";

// ============================================================
// Condition Section
// ============================================================

interface ConditionSectionProps {
  product: MarketplaceProduct;
}

export function ConditionSection({ product }: ConditionSectionProps) {
  // Only show this section if there's wear notes or usage estimate (not just condition rating or description)
  if (!product.wear_notes && !product.usage_estimate) return null;

  return (
    <ExpandableSection title="Condition Details">
      <div className="space-y-5">
        {product.wear_notes && (
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">
              Known Issues
            </p>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {product.wear_notes}
            </p>
          </div>
        )}

        {product.usage_estimate && (
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">
              Usage History
            </p>
            <p className="text-sm text-gray-700">{product.usage_estimate}</p>
          </div>
        )}
      </div>
    </ExpandableSection>
  );
}

// ============================================================
// Specifications Section - Type Specific
// ============================================================

export function SpecificationsSection({ product }: { product: MarketplaceProduct }) {
  const category = product.marketplace_category;

  if (category === "Bicycles") {
    return <BikeSpecifications product={product} />;
  } else if (category === "Parts") {
    return <PartSpecifications product={product} />;
  } else if (category === "Apparel") {
    return <ApparelSpecifications product={product} />;
  }

  return null;
}

function BikeSpecifications({ product }: { product: MarketplaceProduct }) {
  const frameSpecs = [
    { label: "Model Year", value: product.model_year },
    { label: "Frame Size", value: product.frame_size },
    { label: "Material", value: product.frame_material },
    { label: "Type", value: product.bike_type },
    { label: "Colour", value: [product.color_primary, product.color_secondary].filter(Boolean).join(" / ") || undefined },
    { label: "Weight", value: product.bike_weight },
  ];

  const componentSpecs = [
    { label: "Groupset", value: product.groupset },
    { label: "Wheel Size", value: product.wheel_size },
    { label: "Suspension", value: product.suspension_type },
  ];

  const hasFrameSpecs = frameSpecs.some(s => s.value);
  const hasComponentSpecs = componentSpecs.some(s => s.value);

  if (!hasFrameSpecs && !hasComponentSpecs && !product.upgrades_modifications) return null;

  return (
    <ExpandableSection title="Complete Specifications">
      <div className="space-y-4">
        {hasFrameSpecs && <SpecGroup title="Frame" items={frameSpecs} />}
        {hasComponentSpecs && <SpecGroup title="Components" items={componentSpecs} />}
        {product.upgrades_modifications && (
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-2">Upgrades & Modifications</h4>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {product.upgrades_modifications}
            </p>
          </div>
        )}
      </div>
    </ExpandableSection>
  );
}

function PartSpecifications({ product }: { product: MarketplaceProduct }) {
  const productDetails = [
    { label: "Category", value: product.marketplace_subcategory },
    { label: "Part Type", value: product.part_type_detail },
    { label: "Material", value: product.material },
    { label: "Weight", value: product.weight },
    { label: "Colour", value: product.color_primary },
  ];

  const hasSpecs = productDetails.some(s => s.value) || product.compatibility_notes;

  if (!hasSpecs) return null;

  return (
    <ExpandableSection title="Technical Specifications">
      <div className="space-y-4">
        <SpecGroup title="Product Details" items={productDetails} />
        
        {product.compatibility_notes && (
          <div className="bg-blue-50 rounded-md p-4 border border-blue-200">
            <h4 className="text-sm font-semibold text-blue-900 mb-2">Compatibility</h4>
            <p className="text-sm text-blue-800 leading-relaxed whitespace-pre-wrap">
              {product.compatibility_notes}
            </p>
          </div>
        )}
      </div>
    </ExpandableSection>
  );
}

function ApparelSpecifications({ product }: { product: MarketplaceProduct }) {
  const sizeSpecs = [
    { label: "Size", value: product.size },
    { label: "Fit", value: product.gender_fit },
  ];

  const materialSpecs = [
    { label: "Material", value: product.apparel_material },
    { label: "Colour", value: product.color_primary },
  ];

  const hasSpecs = sizeSpecs.some(s => s.value) || materialSpecs.some(s => s.value);

  if (!hasSpecs) return null;

  return (
    <ExpandableSection title="Product Specifications">
      <div className="space-y-4">
        <SpecGroup title="Size & Fit" items={sizeSpecs} />
        <SpecGroup title="Materials" items={materialSpecs} />
      </div>
    </ExpandableSection>
  );
}

// ============================================================
// History & Provenance Section
// ============================================================

export function HistorySection({ product }: { product: MarketplaceProduct }) {
  const hasHistory = 
    product.purchase_location || 
    product.purchase_date || 
    (product.service_history && product.service_history.length > 0) ||
    product.upgrades_modifications ||
    product.reason_for_selling;

  if (!hasHistory) return null;

  return (
    <ExpandableSection title="History & Provenance">
      <div className="space-y-4">
        {/* Purchase Information */}
        {(product.purchase_location || product.purchase_date) && (
          <div className="bg-gray-50 rounded-md p-4 border border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Purchase Information</h4>
            <div className="space-y-2">
              {product.purchase_date && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-700">
                    Purchased {new Date(product.purchase_date).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
                  </span>
                </div>
              )}
              {product.purchase_location && (
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-700">From: {product.purchase_location}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Service History */}
        {product.service_history && product.service_history.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Service History</h4>
            <div className="space-y-3">
              {product.service_history.map((record, index) => (
                <div key={index} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    {index < product.service_history!.length - 1 && (
                      <div className="w-0.5 h-full bg-gray-200 mt-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="h-3.5 w-3.5 text-gray-500" />
                      <span className="text-sm font-medium text-gray-900">
                        {new Date(record.date).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}
                      </span>
                      <span className="text-sm text-gray-600">→ {record.shop}</span>
                    </div>
                    <p className="text-sm text-gray-700">{record.work_done}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-md px-3 py-2 border border-green-200">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">Well maintained ({product.service_history.length} service record{product.service_history.length !== 1 ? 's' : ''})</span>
              </div>
            </div>
          </div>
        )}

        {/* Upgrades */}
        {product.upgrades_modifications && (
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-2">Upgrades & Modifications</h4>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {product.upgrades_modifications}
            </p>
          </div>
        )}

        {/* Reason for Selling */}
        {product.reason_for_selling && (
          <div className="bg-amber-50 rounded-md p-4 border border-amber-200">
            <h4 className="text-sm font-semibold text-amber-900 mb-2">Reason for Selling</h4>
            <p className="text-sm text-amber-800 leading-relaxed">"{product.reason_for_selling}"</p>
          </div>
        )}
      </div>
    </ExpandableSection>
  );
}

// ============================================================
// What's Included Section
// ============================================================

export function WhatsIncludedSection({ product }: { product: MarketplaceProduct }) {
  if (!product.included_accessories) return null;

  // Parse included/not included items
  const lines = product.included_accessories.split('\n').filter(line => line.trim());

  return (
    <ExpandableSection title="What's Included in Sale">
      <div className="space-y-2">
        {lines.map((line, index) => {
          const isIncluded = !line.toLowerCase().includes('not included') && !line.toLowerCase().includes('excluded');
          const text = line.replace(/^[✓✅❌✗×]\s*/i, '').replace(/^-\s*/, '');
          
          return (
            <div key={index} className="flex items-start gap-2">
              {isIncluded ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <span className={cn(
                "text-sm",
                isIncluded ? "text-gray-900" : "text-gray-600"
              )}>
                {text}
              </span>
            </div>
          );
        })}
      </div>
    </ExpandableSection>
  );
}

// ============================================================
// Delivery Options Section
// ============================================================

export function DeliverySection({ product }: { product: MarketplaceProduct }) {
  if (!product.pickup_location && !product.shipping_available) return null;

  return (
    <ExpandableSection title="Delivery Options" defaultExpanded={true}>
      <div className="space-y-4">
        {/* Pickup */}
        {product.pickup_location && (
          <div className="bg-white rounded-md border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="h-5 w-5 text-gray-700" />
              <h4 className="text-sm font-semibold text-gray-900">Pickup</h4>
            </div>
            <p className="text-sm text-gray-700 mb-1">{product.pickup_location}</p>
            <p className="text-xs text-gray-600">Viewing welcome before purchase</p>
          </div>
        )}

        {/* Shipping */}
        {product.shipping_available && (
          <div className="bg-white rounded-md border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Truck className="h-5 w-5 text-gray-700" />
              <h4 className="text-sm font-semibold text-gray-900">Shipping Available</h4>
            </div>
            {product.shipping_cost && (
              <p className="text-sm text-gray-700 mb-1">
                Cost: ${product.shipping_cost.toLocaleString('en-AU')}
              </p>
            )}
            <p className="text-xs text-gray-600">Item will be professionally packed</p>
          </div>
        )}
      </div>
    </ExpandableSection>
  );
}

// ============================================================
// Seller Contact Section
// ============================================================

export function SellerContactSection({ product }: { product: MarketplaceProduct }) {
  const preference = product.seller_contact_preference || 'message';

  return (
    <ExpandableSection title="Contact Seller">
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Preferred contact method:
        </p>

        {preference === 'message' && (
          <div className="flex items-center gap-3 text-sm">
            <MessageCircle className="h-5 w-5 text-gray-600" />
            <span className="text-gray-900">In-app messaging (keeps your details private)</span>
          </div>
        )}

        {preference === 'email' && product.seller_email && (
          <a
            href={`mailto:${product.seller_email}`}
            className="flex items-center gap-3 text-sm text-blue-600 hover:text-blue-700"
          >
            <Mail className="h-5 w-5" />
            <span>{product.seller_email}</span>
          </a>
        )}

        {preference === 'phone' && product.seller_phone && (
          <a
            href={`tel:${product.seller_phone}`}
            className="flex items-center gap-3 text-sm text-blue-600 hover:text-blue-700"
          >
            <Phone className="h-5 w-5" />
            <span>{product.seller_phone}</span>
          </a>
        )}
      </div>
    </ExpandableSection>
  );
}

