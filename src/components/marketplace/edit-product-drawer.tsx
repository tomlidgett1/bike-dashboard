"use client";

import * as React from "react";
import Image from "next/image";
import {
  X,
  Check,
  Loader2,
  ChevronDown,
  DollarSign,
  FileText,
  Settings,
  Package,
  Truck,
  Clock,
  AlertCircle,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { MarketplaceProduct } from "@/lib/types/marketplace";
import {
  CONDITION_RATINGS,
  FRAME_MATERIALS,
  WHEEL_SIZES,
  SUSPENSION_TYPES,
  USAGE_ESTIMATES,
  GENDER_FITS,
  APPAREL_SIZES,
} from "@/lib/types/listing";

// ============================================================
// Edit Product Drawer
// A beautiful slide-over panel for editing product listings
// Features: Autosave with debounce, organised sections, mobile-optimised
// ============================================================

interface EditProductDrawerProps {
  product: MarketplaceProduct;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedProduct: MarketplaceProduct) => void;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface EditableField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "switch";
  options?: string[];
  placeholder?: string;
}

interface Section {
  id: string;
  title: string;
  icon: React.ReactNode;
  fields: EditableField[];
}

export function EditProductDrawer({
  product,
  isOpen,
  onClose,
  onUpdate,
}: EditProductDrawerProps) {
  const [formData, setFormData] = React.useState<Record<string, any>>({});
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [expandedSections, setExpandedSections] = React.useState<Set<string>>(
    new Set(["pricing", "description"])
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Initialise form data when product changes
  React.useEffect(() => {
    if (product) {
      setFormData({
        displayName: (product as any).display_name || product.description,
        price: product.price,
        conditionRating: product.condition_rating,
        conditionDetails: product.condition_details,
        sellerNotes: (product as any).seller_notes,
        wearNotes: product.wear_notes,
        usageEstimate: product.usage_estimate,
        brand: (product as any).brand,
        model: (product as any).model,
        modelYear: product.model_year,
        frameSize: product.frame_size,
        frameMaterial: product.frame_material,
        bikeType: product.bike_type,
        groupset: product.groupset,
        wheelSize: product.wheel_size,
        suspensionType: product.suspension_type,
        colorPrimary: product.color_primary,
        size: product.size,
        genderFit: product.gender_fit,
        partTypeDetail: product.part_type_detail,
        compatibilityNotes: product.compatibility_notes,
        isNegotiable: product.is_negotiable,
        shippingAvailable: product.shipping_available,
        shippingCost: product.shipping_cost,
        pickupLocation: product.pickup_location,
        includedAccessories: product.included_accessories,
        reasonForSelling: product.reason_for_selling,
      });
      setHasUnsavedChanges(false);
      setSaveStatus("idle");
    }
  }, [product]);

  // Prevent body scroll when drawer is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  // Define sections based on product category
  const getSections = React.useCallback((): Section[] => {
    const category = product.marketplace_category;
    const baseSections: Section[] = [
      {
        id: "pricing",
        title: "Pricing",
        icon: <DollarSign className="h-4 w-4" />,
        fields: [
          {
            key: "price",
            label: "Price",
            type: "number",
            placeholder: "Enter price",
          },
          {
            key: "isNegotiable",
            label: "Price Negotiable",
            type: "switch",
          },
        ],
      },
      {
        id: "description",
        title: "Description",
        icon: <FileText className="h-4 w-4" />,
        fields: [
          {
            key: "displayName",
            label: "Title",
            type: "text",
            placeholder: "Product title",
          },
          {
            key: "conditionDetails",
            label: "Description",
            type: "textarea",
            placeholder: "Product description - features, specs, what it is...",
          },
          {
            key: "sellerNotes",
            label: "Seller Notes",
            type: "textarea",
            placeholder: "Your notes about condition, wear, why selling...",
          },
        ],
      },
      {
        id: "condition",
        title: "Condition",
        icon: <Package className="h-4 w-4" />,
        fields: [
          {
            key: "conditionRating",
            label: "Condition Rating",
            type: "select",
            options: [...CONDITION_RATINGS],
          },
          {
            key: "wearNotes",
            label: "Wear Notes",
            type: "textarea",
            placeholder: "Any scratches, marks, or wear...",
          },
          {
            key: "usageEstimate",
            label: "Usage Estimate",
            type: "select",
            options: [...USAGE_ESTIMATES],
          },
        ],
      },
    ];

    // Add category-specific sections
    if (category === "Bicycles") {
      baseSections.splice(2, 0, {
        id: "details",
        title: "Bike Details",
        icon: <Settings className="h-4 w-4" />,
        fields: [
          { key: "brand", label: "Brand", type: "text", placeholder: "e.g., Trek, Specialized" },
          { key: "model", label: "Model", type: "text", placeholder: "e.g., Domane SL5" },
          { key: "modelYear", label: "Year", type: "text", placeholder: "e.g., 2023" },
          { key: "frameSize", label: "Frame Size", type: "text", placeholder: "e.g., 54cm, Medium" },
          { key: "frameMaterial", label: "Frame Material", type: "select", options: [...FRAME_MATERIALS] },
          { key: "wheelSize", label: "Wheel Size", type: "select", options: [...WHEEL_SIZES] },
          { key: "suspensionType", label: "Suspension", type: "select", options: [...SUSPENSION_TYPES] },
          { key: "groupset", label: "Groupset", type: "text", placeholder: "e.g., Shimano 105" },
          { key: "colorPrimary", label: "Colour", type: "text", placeholder: "e.g., Matte Black" },
        ],
      });
    } else if (category === "Parts") {
      baseSections.splice(2, 0, {
        id: "details",
        title: "Part Details",
        icon: <Settings className="h-4 w-4" />,
        fields: [
          { key: "brand", label: "Brand", type: "text", placeholder: "e.g., Shimano, SRAM" },
          { key: "model", label: "Model", type: "text", placeholder: "e.g., Ultegra R8000" },
          { key: "partTypeDetail", label: "Part Type", type: "text", placeholder: "e.g., Rear Derailleur" },
          { key: "compatibilityNotes", label: "Compatibility", type: "textarea", placeholder: "Compatible with..." },
          { key: "colorPrimary", label: "Colour", type: "text", placeholder: "e.g., Black" },
        ],
      });
    } else if (category === "Apparel") {
      baseSections.splice(2, 0, {
        id: "details",
        title: "Apparel Details",
        icon: <Settings className="h-4 w-4" />,
        fields: [
          { key: "brand", label: "Brand", type: "text", placeholder: "e.g., Rapha, Castelli" },
          { key: "model", label: "Model", type: "text", placeholder: "e.g., Pro Team Jersey" },
          { key: "size", label: "Size", type: "select", options: [...APPAREL_SIZES] },
          { key: "genderFit", label: "Gender Fit", type: "select", options: [...GENDER_FITS] },
          { key: "colorPrimary", label: "Colour", type: "text", placeholder: "e.g., Navy Blue" },
        ],
      });
    }

    // Add shipping section
    baseSections.push({
      id: "shipping",
      title: "Shipping & Pickup",
      icon: <Truck className="h-4 w-4" />,
      fields: [
        { key: "shippingAvailable", label: "Shipping Available", type: "switch" },
        { key: "shippingCost", label: "Shipping Cost", type: "number", placeholder: "Enter shipping cost" },
        { key: "pickupLocation", label: "Pickup Location", type: "text", placeholder: "e.g., Sydney CBD" },
        { key: "includedAccessories", label: "Included Accessories", type: "textarea", placeholder: "List any extras included..." },
      ],
    });

    return baseSections;
  }, [product.marketplace_category]);

  const sections = React.useMemo(() => getSections(), [getSections]);

  // Handle field change with autosave
  const handleFieldChange = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setHasUnsavedChanges(true);
    setSaveStatus("idle");

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounced autosave (500ms)
    saveTimeoutRef.current = setTimeout(() => {
      saveChanges({ ...formData, [key]: value });
    }, 500);
  };

  // Save changes to API
  const saveChanges = async (data: Record<string, any>) => {
    setSaveStatus("saving");

    try {
      const response = await fetch(`/api/marketplace/listings/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          logChanges: true,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save");
      }

      const { listing } = await response.json();
      setSaveStatus("saved");
      setHasUnsavedChanges(false);
      setLastSavedAt(new Date());
      onUpdate(listing);

      // Reset to idle after 2 seconds
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
      console.error("Error saving:", error);
      setSaveStatus("error");
    }
  };

  // Toggle section expansion
  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  // Handle close with unsaved changes warning
  const handleClose = () => {
    if (hasUnsavedChanges) {
      // Save immediately before closing
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveChanges(formData);
    }
    onClose();
  };

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Get the primary image
  const primaryImage = React.useMemo(() => {
    if (product.all_images && product.all_images.length > 0) {
      return product.all_images[0];
    }
    if (product.primary_image_url) {
      return product.primary_image_url;
    }
    return "/placeholder-product.svg";
  }, [product]);

  // Render field based on type
  const renderField = (field: EditableField) => {
    const value = formData[field.key];

    switch (field.type) {
      case "text":
        return (
          <Input
            value={value || ""}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            className="rounded-md"
          />
        );
      case "textarea":
        return (
          <Textarea
            value={value || ""}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            className="rounded-md min-h-[80px]"
          />
        );
      case "number":
        return (
          <div className="relative">
            {field.key === "price" && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
            )}
            <Input
              type="number"
              value={value || ""}
              onChange={(e) => handleFieldChange(field.key, parseFloat(e.target.value) || 0)}
              placeholder={field.placeholder}
              className={cn("rounded-md", field.key === "price" && "pl-7")}
            />
          </div>
        );
      case "select":
        return (
          <Select
            value={value || ""}
            onValueChange={(v) => handleFieldChange(field.key, v)}
          >
            <SelectTrigger className="rounded-md">
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "switch":
        return (
          <Switch
            checked={value || false}
            onCheckedChange={(checked) => handleFieldChange(field.key, checked)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent 
        side="right" 
        className="w-full sm:w-[480px] p-0 flex flex-col gap-0"
        showCloseButton={false}
      >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-12 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
                    <Image
                      src={primaryImage}
                      alt="Product"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-gray-900 truncate">
                      Edit Listing
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      {/* Save status indicator */}
                      {saveStatus === "saving" && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Saving...</span>
                        </div>
                      )}
                      {saveStatus === "saved" && (
                        <div className="flex items-center gap-1.5 text-xs text-green-600">
                          <Check className="h-3 w-3" />
                          <span>Saved</span>
                        </div>
                      )}
                      {saveStatus === "error" && (
                        <div className="flex items-center gap-1.5 text-xs text-red-600">
                          <AlertCircle className="h-3 w-3" />
                          <span>Failed to save</span>
                        </div>
                      )}
                      {saveStatus === "idle" && lastSavedAt && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <Clock className="h-3 w-3" />
                          <span>
                            Last saved {lastSavedAt.toLocaleTimeString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 rounded-md hover:bg-gray-100 transition-colors"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-3">
                {sections.map((section) => (
                  <div
                    key={section.id}
                    className="bg-white border border-gray-200 rounded-md overflow-hidden"
                  >
                    {/* Section Header */}
                    <button
                      onClick={() => toggleSection(section.id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="text-gray-500">{section.icon}</div>
                        <span className="font-semibold text-gray-900">
                          {section.title}
                        </span>
                      </div>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-gray-400 transition-transform duration-200",
                          expandedSections.has(section.id) && "rotate-180"
                        )}
                      />
                    </button>

                    {/* Section Content */}
                    {expandedSections.has(section.id) && (
                      <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
                        {section.fields.map((field) => (
                          <div key={field.key} className="pt-4">
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-sm font-medium text-gray-700">
                                {field.label}
                              </label>
                              {field.type === "switch" && renderField(field)}
                            </div>
                            {field.type !== "switch" && renderField(field)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-4">
          <Button
            onClick={handleClose}
            className="w-full h-12 rounded-md font-medium"
          >
            Done Editing
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
