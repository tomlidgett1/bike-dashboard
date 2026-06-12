"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  confidenceLabel,
  CONDITION_RATINGS,
  formatAUD,
  type MockProduct,
} from "./mock-data";

// ============================================================
// Shared UI primitives for the bulk upload prototypes
// Brand: Yellow Jersey yellow (#ffde59) on near-black text.
// All containers use rounded-md per project conventions.
// ============================================================

export const BRAND = "#ffde59";
export const BRAND_HOVER = "#f0cf45";
export const INK = "#1c1c1e";

// ---- Buttons ------------------------------------------------

type PButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  full?: boolean;
  className?: string;
  type?: "button" | "submit";
};

export function PButton({
  children,
  onClick,
  variant = "primary",
  disabled,
  full,
  className,
  type = "button",
}: PButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md text-[15px] font-semibold transition-all active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100",
        "h-12 px-5",
        full && "w-full",
        variant === "primary" && "text-[#1c1c1e] shadow-sm",
        variant === "secondary" &&
          "bg-white text-gray-900 border border-gray-200 hover:bg-gray-50",
        variant === "ghost" && "bg-transparent text-gray-600 hover:bg-gray-100",
        className,
      )}
      style={variant === "primary" ? { backgroundColor: BRAND } : undefined}
    >
      {children}
    </button>
  );
}

// ---- Form fields -------------------------------------------

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-[13px] font-medium text-gray-700">{label}</label>
        {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const inputBase =
  "w-full rounded-md border border-gray-200 bg-white px-3 text-[16px] text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-900";

export function PInput({
  value,
  onChange,
  placeholder,
  prefix,
  type = "text",
  inputMode,
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  prefix?: string;
  type?: string;
  inputMode?: "text" | "numeric" | "decimal";
}) {
  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          {prefix}
        </span>
      )}
      <input
        value={value}
        type={type}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(inputBase, "h-12", prefix && "pl-7")}
      />
    </div>
  );
}

export function PTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(inputBase, "resize-none py-2.5 leading-relaxed")}
    />
  );
}

export function PSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputBase, "h-12 appearance-none pr-9")}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        viewBox="0 0 16 16"
        fill="none"
      >
        <path
          d="M4 6l4 4 4-4"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ---- Chips / tags ------------------------------------------

export function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ink";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium",
        tone === "neutral" && "bg-gray-100 text-gray-700",
        tone === "ink" && "bg-gray-900 text-white",
      )}
    >
      {children}
    </span>
  );
}

export function ConfidenceTag({ confidence }: { confidence: number }) {
  const level = confidenceLabel(confidence);
  const dot =
    level === "high"
      ? "bg-emerald-500"
      : level === "medium"
        ? "bg-amber-500"
        : "bg-rose-500";
  const text =
    level === "high"
      ? "AI confident"
      : level === "medium"
        ? "Check details"
        : "Needs review";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-0.5 text-[12px] font-medium text-gray-700">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {text}
    </span>
  );
}

// ---- Spinner -----------------------------------------------

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg
      className="animate-spin text-gray-900"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---- Small inline icons ------------------------------------

export function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M3 9a2 2 0 0 1 2-2h1.5l1-1.5h5l1 1.5H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth={1.6} />
    </svg>
  );
}

export function GalleryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth={1.6}
      />
      <circle cx="8.5" cy="9" r="1.6" stroke="currentColor" strokeWidth={1.4} />
      <path
        d="M5 18l4.5-4.5 3 3L16 13l3 3"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 7h16M9 7V5h6v2M6 7l1 12h10l1-12"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---- Photo gallery -----------------------------------------

export function PhotoGallery({
  images,
  rounded = true,
}: {
  images: string[];
  rounded?: boolean;
}) {
  const [primary, setPrimary] = React.useState(0);
  const safePrimary = primary < images.length ? primary : 0;
  return (
    <div>
      <div
        className={cn(
          "relative w-full overflow-hidden bg-gray-100",
          rounded && "rounded-md",
        )}
        style={{ aspectRatio: "4 / 3" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[safePrimary]}
          alt="Product"
          className="h-full w-full object-cover"
        />
      </div>
      {images.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {images.map((url, i) => (
            <button
              key={`${url}-${i}`}
              type="button"
              onClick={() => setPrimary(i)}
              className={cn(
                "relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md border-2 transition-colors",
                i === safePrimary ? "border-gray-900" : "border-transparent",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Delivery options --------------------------------------

export function DeliveryOptions({
  product,
  onPatch,
}: {
  product: MockProduct;
  onPatch: (patch: Partial<MockProduct>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-3">
        <div>
          <p className="text-[14px] font-medium text-gray-900">Shipping</p>
          <p className="text-[12px] text-gray-500">Post Australia-wide</p>
        </div>
        <ToggleSwitch
          checked={product.shippingAvailable}
          onChange={(v) => onPatch({ shippingAvailable: v })}
        />
      </div>
      <AnimatePresence initial={false}>
        {product.shippingAvailable && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            <Field label="Postage cost (AUD)">
              <PInput
                value={product.shippingCost}
                onChange={(v) => onPatch({ shippingCost: Number(v) || 0 })}
                prefix="$"
                inputMode="numeric"
              />
            </Field>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-3">
        <div>
          <p className="text-[14px] font-medium text-gray-900">Local pickup</p>
          <p className="text-[12px] text-gray-500">Buyer collects in person</p>
        </div>
        <ToggleSwitch
          checked={product.pickupAvailable}
          onChange={(v) => onPatch({ pickupAvailable: v })}
        />
      </div>
      <AnimatePresence initial={false}>
        {product.pickupAvailable && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            <Field label="Pickup location">
              <PInput
                value={product.pickupLocation}
                onChange={(v) => onPatch({ pickupLocation: v })}
                placeholder="Suburb, State"
              />
            </Field>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-12 flex-shrink-0 rounded-full transition-colors",
        checked ? "" : "bg-gray-200",
      )}
      style={checked ? { backgroundColor: INK } : undefined}
    >
      <span
        className={cn(
          "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all",
          checked ? "left-[22px]" : "left-0.5",
        )}
      />
    </button>
  );
}

// ---- Reusable full product editor --------------------------

export function ProductEditor({
  product,
  onPatch,
  onDelete,
  showImages = true,
}: {
  product: MockProduct;
  onPatch: (patch: Partial<MockProduct>) => void;
  onDelete?: () => void;
  showImages?: boolean;
}) {
  const [showDetails, setShowDetails] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);

  const generate = () => {
    setGenerating(true);
    window.setTimeout(() => setGenerating(false), 1200);
  };

  return (
    <div className="space-y-4">
      {showImages && <PhotoGallery images={product.images} />}

      <Field label="Title">
        <PInput value={product.title} onChange={(v) => onPatch({ title: v })} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Price (AUD)">
          <PInput
            value={product.price}
            onChange={(v) => onPatch({ price: Number(v) || 0 })}
            prefix="$"
            inputMode="numeric"
          />
        </Field>
        <Field label="Condition">
          <PSelect
            value={product.condition}
            onChange={(v) => onPatch({ condition: v as MockProduct["condition"] })}
            options={CONDITION_RATINGS as unknown as string[]}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Brand">
          <PInput value={product.brand} onChange={(v) => onPatch({ brand: v })} />
        </Field>
        <Field label="Model">
          <PInput value={product.model} onChange={(v) => onPatch({ model: v })} />
        </Field>
      </div>

      <Field label="Type">
        <PSelect
          value={product.type}
          onChange={(v) => onPatch({ type: v as MockProduct["type"] })}
          options={["bike", "part", "apparel"]}
        />
      </Field>

      <Field label="Description" hint={generating ? "Generating…" : undefined}>
        <div className="relative">
          <PTextarea
            value={product.description}
            onChange={(v) => onPatch({ description: v })}
            rows={4}
          />
          <button
            type="button"
            onClick={generate}
            className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-[12px] font-medium text-gray-700 hover:bg-gray-200"
          >
            {generating ? (
              <Spinner size={12} />
            ) : (
              <SparkleIcon className="h-3 w-3" />
            )}
            Generate
          </button>
        </div>
      </Field>

      {/* Details accordion (project dropdown animation pattern) */}
      <div className="rounded-md border border-gray-200">
        <button
          type="button"
          onClick={() => setShowDetails((s) => !s)}
          className="flex w-full items-center justify-between px-3 py-3 text-left"
        >
          <span className="text-[14px] font-medium text-gray-900">
            {product.type === "bike"
              ? "Bike details"
              : product.type === "part"
                ? "Part details"
                : "Apparel details"}
          </span>
          <ChevronIcon
            className={cn(
              "h-4 w-4 rotate-90 text-gray-400 transition-transform duration-200",
              showDetails && "-rotate-90",
            )}
          />
        </button>
        <AnimatePresence initial={false}>
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
              className="overflow-hidden"
            >
              <div className="space-y-3 px-3 pb-3">
                {product.type === "bike" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Year">
                        <PInput
                          value={product.year ?? ""}
                          onChange={(v) => onPatch({ year: v })}
                        />
                      </Field>
                      <Field label="Frame size">
                        <PInput
                          value={product.frameSize ?? ""}
                          onChange={(v) => onPatch({ frameSize: v })}
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Material">
                        <PInput
                          value={product.material ?? ""}
                          onChange={(v) => onPatch({ material: v })}
                        />
                      </Field>
                      <Field label="Groupset">
                        <PInput
                          value={product.groupset ?? ""}
                          onChange={(v) => onPatch({ groupset: v })}
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Wheels">
                        <PInput
                          value={product.wheelSize ?? ""}
                          onChange={(v) => onPatch({ wheelSize: v })}
                        />
                      </Field>
                      <Field label="Colour">
                        <PInput
                          value={product.colour ?? ""}
                          onChange={(v) => onPatch({ colour: v })}
                        />
                      </Field>
                    </div>
                  </>
                )}
                {product.type !== "bike" && (
                  <Field label="Colour">
                    <PInput
                      value={product.colour ?? ""}
                      onChange={(v) => onPatch({ colour: v })}
                    />
                  </Field>
                )}
                <DeliveryOptions product={product} onPatch={onPatch} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-rose-600"
        >
          <TrashIcon className="h-4 w-4" />
          Remove this item
        </button>
      )}

      <p className="text-[12px] text-gray-400">
        {product.rrp ? `RRP ${formatAUD(product.rrp)}` : ""}
      </p>
    </div>
  );
}
