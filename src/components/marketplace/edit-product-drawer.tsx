"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  X,
  Check,
  Loader2,
  FileText,
  Settings,
  Package,
  Truck,
  AlertCircle,
  Sparkles,
} from '@/components/layout/app-sidebar/dashboard-icons';
import { Sheet, SheetContent } from "@/components/ui/sheet";
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
import { useIsMobile } from "@/hooks/use-mobile";
import {
  getMobileSheetHeight,
  useMobileSheetViewport,
} from "@/hooks/use-mobile-sheet-viewport";
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

const ProductOptimizePanel = dynamic(
  () =>
    import("./product-optimize-drawer").then((mod) => mod.ProductOptimizePanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    ),
  },
);

const PANEL_CLOSE_MS = 320;
const SHEET_HEIGHT = "min(90dvh, calc(100dvh - env(safe-area-inset-bottom)))";
const MOBILE_SHEET_HEIGHT_RATIO = 0.9;

// ============================================================
// Edit Product Drawer
// Mobile: native CSS bottom sheet with tabbed sections
// Desktop: right slide-over with the same tabbed layout
// ============================================================

interface EditProductDrawerProps {
  product: MarketplaceProduct;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedProduct: MarketplaceProduct) => void;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";
type EditTabId = "listing" | "optimise" | "condition" | "details" | "delivery";

interface EditableField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "switch";
  options?: string[];
  placeholder?: string;
  hint?: string;
}

interface EditTab {
  id: EditTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  fields: EditableField[];
}

function getTabs(category: string): EditTab[] {
  const tabs: EditTab[] = [
    {
      id: "listing",
      label: "Listing",
      icon: FileText,
      fields: [
        {
          key: "displayName",
          label: "Title",
          type: "text",
          placeholder: "Product title",
        },
        {
          key: "productDescription",
          label: "Description",
          type: "textarea",
          placeholder: "Features, specs, and what buyers need to know",
        },
        {
          key: "sellerNotes",
          label: "Seller notes",
          type: "textarea",
          placeholder: "Condition notes, wear, or why you are selling",
        },
        {
          key: "price",
          label: "Price",
          type: "number",
          placeholder: "Enter price",
        },
        {
          key: "isNegotiable",
          label: "Price negotiable",
          type: "switch",
        },
      ],
    },
    {
      id: "condition",
      label: "Condition",
      icon: Package,
      fields: [
        {
          key: "conditionRating",
          label: "Condition rating",
          type: "select",
          options: [...CONDITION_RATINGS],
        },
        {
          key: "wearNotes",
          label: "Wear notes",
          type: "textarea",
          placeholder: "Scratches, marks, or other wear",
        },
        {
          key: "usageEstimate",
          label: "Usage estimate",
          type: "select",
          options: [...USAGE_ESTIMATES],
        },
        {
          key: "reasonForSelling",
          label: "Reason for selling",
          type: "textarea",
          placeholder: "Optional — helps buyers understand your listing",
        },
      ],
    },
  ];

  if (category === "Bicycles") {
    tabs.push({
      id: "details",
      label: "Bike",
      icon: Settings,
      fields: [
        { key: "brand", label: "Brand", type: "text", placeholder: "e.g. Trek, Specialized" },
        { key: "model", label: "Model", type: "text", placeholder: "e.g. Domane SL5" },
        { key: "modelYear", label: "Year", type: "text", placeholder: "e.g. 2023" },
        { key: "frameSize", label: "Frame size", type: "text", placeholder: "e.g. 54cm, Medium" },
        {
          key: "frameMaterial",
          label: "Frame material",
          type: "select",
          options: [...FRAME_MATERIALS],
        },
        { key: "wheelSize", label: "Wheel size", type: "select", options: [...WHEEL_SIZES] },
        {
          key: "suspensionType",
          label: "Suspension",
          type: "select",
          options: [...SUSPENSION_TYPES],
        },
        { key: "groupset", label: "Groupset", type: "text", placeholder: "e.g. Shimano 105" },
        { key: "colorPrimary", label: "Colour", type: "text", placeholder: "e.g. Matte black" },
      ],
    });
  } else if (category === "Parts") {
    tabs.push({
      id: "details",
      label: "Part",
      icon: Settings,
      fields: [
        { key: "brand", label: "Brand", type: "text", placeholder: "e.g. Shimano, SRAM" },
        { key: "model", label: "Model", type: "text", placeholder: "e.g. Ultegra R8000" },
        {
          key: "partTypeDetail",
          label: "Part type",
          type: "text",
          placeholder: "e.g. Rear derailleur",
        },
        {
          key: "compatibilityNotes",
          label: "Compatibility",
          type: "textarea",
          placeholder: "Compatible with…",
        },
        { key: "colorPrimary", label: "Colour", type: "text", placeholder: "e.g. Black" },
      ],
    });
  } else if (category === "Apparel") {
    tabs.push({
      id: "details",
      label: "Apparel",
      icon: Settings,
      fields: [
        { key: "brand", label: "Brand", type: "text", placeholder: "e.g. Rapha, Castelli" },
        { key: "model", label: "Model", type: "text", placeholder: "e.g. Pro Team Jersey" },
        { key: "size", label: "Size", type: "select", options: [...APPAREL_SIZES] },
        { key: "genderFit", label: "Gender fit", type: "select", options: [...GENDER_FITS] },
        { key: "colorPrimary", label: "Colour", type: "text", placeholder: "e.g. Navy blue" },
      ],
    });
  }

  tabs.push({
    id: "delivery",
    label: "Delivery",
    icon: Truck,
    fields: [
      { key: "shippingAvailable", label: "Shipping available", type: "switch" },
      {
        key: "shippingCost",
        label: "Shipping cost",
        type: "number",
        placeholder: "Enter shipping cost",
      },
      {
        key: "pickupLocation",
        label: "Pickup location",
        type: "text",
        placeholder: "e.g. Sydney CBD",
      },
      {
        key: "includedAccessories",
        label: "Included accessories",
        type: "textarea",
        placeholder: "List any extras included",
      },
    ],
  });

  return tabs;
}

const OPTIMISE_TAB: EditTab = {
  id: "optimise",
  label: "Optimise",
  icon: Sparkles,
  fields: [],
};

function withOptimiseTab(tabs: EditTab[]): EditTab[] {
  const listing = tabs.find((tab) => tab.id === "listing");
  const rest = tabs.filter((tab) => tab.id !== "listing");
  return listing ? [listing, OPTIMISE_TAB, ...rest] : [OPTIMISE_TAB, ...tabs];
}

export function EditProductDrawer({
  product,
  isOpen,
  onClose,
  onUpdate,
}: EditProductDrawerProps) {
  const isMobile = useIsMobile();
  const [formData, setFormData] = React.useState<Record<string, unknown>>({});
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [activeTab, setActiveTab] = React.useState<EditTabId>("listing");
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [shouldRender, setShouldRender] = React.useState(isOpen);
  const [isLeaving, setIsLeaving] = React.useState(false);

  const tabs = React.useMemo(
    () => withOptimiseTab(getTabs(product.marketplace_category)),
    [product.marketplace_category],
  );

  const activeTabConfig = React.useMemo(
    () => tabs.find((tab) => tab.id === activeTab) ?? tabs[0],
    [tabs, activeTab]
  );

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (product) {
      setFormData({
        displayName: (product as { display_name?: string }).display_name || product.description,
        price: product.price,
        conditionRating: product.condition_rating,
        productDescription:
          (product as { product_description?: string }).product_description ||
          product.condition_details ||
          "",
        sellerNotes: (product as { seller_notes?: string }).seller_notes || "",
        wearNotes: product.wear_notes,
        usageEstimate: product.usage_estimate,
        brand: (product as { brand?: string }).brand,
        model: (product as { model?: string }).model,
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

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab("listing");
    }
  }, [isOpen, product.id]);

  React.useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsLeaving(false);
      return;
    }

    if (!shouldRender) return;

    setIsLeaving(true);
    const timer = window.setTimeout(() => {
      setShouldRender(false);
      setIsLeaving(false);
    }, PANEL_CLOSE_MS);

    return () => window.clearTimeout(timer);
  }, [isOpen, shouldRender]);

  React.useEffect(() => {
    if (!shouldRender) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [shouldRender]);

  const { metrics: mobileViewport } = useMobileSheetViewport(shouldRender && isMobile);

  const handleOptimiseUpdate = React.useCallback(
    (updates: Partial<MarketplaceProduct>) => {
      const formPatches: Record<string, unknown> = {};
      if (updates.display_name !== undefined) {
        formPatches.displayName = updates.display_name;
      }
      if (updates.product_description !== undefined) {
        formPatches.productDescription = updates.product_description;
      }
      if (Object.keys(formPatches).length > 0) {
        setFormData((prev) => ({ ...prev, ...formPatches }));
      }
      onUpdate({ ...product, ...updates } as MarketplaceProduct);
    },
    [onUpdate, product],
  );

  const handleFieldChange = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setHasUnsavedChanges(true);
    if (saveStatus === "saved") {
      setSaveStatus("idle");
    }
  };

  const saveChanges = async () => {
    setSaveStatus("saving");

    try {
      const response = await fetch(`/api/marketplace/listings/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          logChanges: true,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save");
      }

      const { listing } = await response.json();
      setSaveStatus("saved");
      setHasUnsavedChanges(false);
      onUpdate(listing);
    } catch (error) {
      console.error("Error saving:", error);
      setSaveStatus("error");
    }
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        "You have unsaved changes. Are you sure you want to close without saving?"
      );
      if (!confirmed) {
        return;
      }
    }
    onClose();
  };

  const primaryImage = React.useMemo(() => {
    if (product.all_images && product.all_images.length > 0) {
      return product.all_images[0];
    }
    if (product.primary_image_url) {
      return product.primary_image_url;
    }
    return "/placeholder-product.svg";
  }, [product]);

  const renderField = (field: EditableField) => {
    const value = formData[field.key];

    switch (field.type) {
      case "text":
        return (
          <Input
            value={(value as string) || ""}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            className="rounded-md"
          />
        );
      case "textarea":
        return (
          <Textarea
            value={(value as string) || ""}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            className="min-h-[96px] rounded-md"
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
              value={value === 0 || value ? String(value) : ""}
              onChange={(e) =>
                handleFieldChange(field.key, parseFloat(e.target.value) || 0)
              }
              placeholder={field.placeholder}
              className={cn("rounded-md", field.key === "price" && "pl-7")}
            />
          </div>
        );
      case "select":
        return (
          <Select
            value={(value as string) || ""}
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
            checked={Boolean(value)}
            onCheckedChange={(checked) => handleFieldChange(field.key, checked)}
          />
        );
      default:
        return null;
    }
  };

  const statusLine = (
    <>
      {hasUnsavedChanges && saveStatus === "idle" && (
        <span className="text-xs text-amber-600">Unsaved changes</span>
      )}
      {saveStatus === "saved" && (
        <span className="flex items-center gap-1 text-xs text-green-600">
          <Check className="h-3 w-3" />
          Saved
        </span>
      )}
      {saveStatus === "error" && (
        <span className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3 w-3" />
          Failed to save
        </span>
      )}
    </>
  );

  const tabBar = (
    <div className="shrink-0 overflow-x-auto px-4 pt-3 pb-3">
      <div className="flex w-max min-w-full items-center rounded-md bg-gray-100 p-0.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex shrink-0 items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                isActive
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70"
              )}
            >
              <Icon className="h-3 w-3" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const formBody =
    activeTab === "optimise" ? (
      <div className="px-4 pb-4">
        <p className="mb-3 text-xs text-gray-500">
          Improve photos, title, description, and specs
        </p>
        <ProductOptimizePanel
          product={product}
          active={isOpen && activeTab === "optimise"}
          embedded
          onProductUpdate={handleOptimiseUpdate}
        />
      </div>
    ) : (
      <div className="space-y-4 px-4 pb-4">
        {activeTabConfig.fields.map((field) => (
          <div key={field.key}>
            <div
              className={cn(
                "mb-1.5",
                field.type === "switch"
                  ? "flex items-center justify-between gap-3"
                  : "block",
              )}
            >
              <label className="text-sm font-medium text-gray-700">{field.label}</label>
              {field.type === "switch" && renderField(field)}
            </div>
            {field.type !== "switch" && renderField(field)}
            {field.hint && (
              <p className="mt-1 text-xs text-gray-500">{field.hint}</p>
            )}
          </div>
        ))}
      </div>
    );

  const footer = (
    <div className="shrink-0 space-y-2 border-t border-gray-200 bg-white px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {activeTab !== "optimise" && (
        <Button
          onClick={saveChanges}
          disabled={!hasUnsavedChanges || saveStatus === "saving"}
          className="h-12 w-full rounded-md font-medium"
        >
          {saveStatus === "saving" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              Save changes
            </>
          )}
        </Button>
      )}
      <Button
        variant={activeTab === "optimise" ? "default" : "ghost"}
        onClick={handleClose}
        className={cn(
          "w-full rounded-md font-medium",
          activeTab === "optimise"
            ? "h-12 bg-gray-900 text-white hover:bg-gray-800"
            : "h-10 text-gray-600",
        )}
      >
        {hasUnsavedChanges && activeTab !== "optimise" ? "Discard and close" : "Close"}
      </Button>
    </div>
  );

  const header = (
    <div className="shrink-0 border-b border-gray-200 bg-white px-4 pb-3 pt-2 sm:pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-gray-100">
            <Image src={primaryImage} alt="Product" fill className="object-cover" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-gray-900">Edit listing</h2>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {(formData.displayName as string) || product.description}
            </p>
            <div className="mt-1">{statusLine}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="rounded-md p-2 transition-colors hover:bg-gray-100"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-gray-500" />
        </button>
      </div>
    </div>
  );

  const panelContent = (
    <>
      {isMobile && (
        <div className="mb-1 flex shrink-0 justify-center pt-3 sm:hidden" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-gray-200" />
        </div>
      )}
      {header}
      {tabBar}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{formBody}</div>
      {footer}
    </>
  );

  if (!shouldRender || !mounted) {
    return null;
  }

  const panelState = isLeaving ? "closed" : "open";
  const mobileSheetHeight = getMobileSheetHeight(
    mobileViewport,
    MOBILE_SHEET_HEIGHT_RATIO,
  );

  if (isMobile) {
    return createPortal(
      <div
        data-state={panelState}
        className="store-message-overlay fixed inset-x-0 z-[110] flex items-end justify-center bg-black/40 px-0 sm:hidden"
        role="presentation"
        style={{
          top: mobileViewport.top,
          bottom: mobileViewport.bottom,
          pointerEvents: isLeaving ? "none" : "auto",
        }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) handleClose();
        }}
      >
        <div
          data-state={panelState}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-listing-title"
          className="store-message-sheet flex w-full flex-col overflow-hidden rounded-t-2xl border border-gray-200/80 bg-white shadow-xl"
          style={{
            height: mobileSheetHeight ?? SHEET_HEIGHT,
            maxHeight: mobileViewport.height > 0 ? mobileViewport.height : SHEET_HEIGHT,
          }}
        >
          <span id="edit-listing-title" className="sr-only">
            Edit listing
          </span>
          {panelContent}
        </div>
      </div>,
      document.body
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 bg-white p-0 sm:w-[480px]"
        showCloseButton={false}
      >
        {panelContent}
      </SheetContent>
    </Sheet>
  );
}
