"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  Camera,
  Images,
  Pencil,
  type LucideIcon,
} from '@/components/layout/app-sidebar/dashboard-icons';
import { cn } from "@/lib/utils";
import { BRAND, BRAND_SOFT, BIKE_TYPES, bikeTypeSubtypes, type Confidence, confidenceMeta } from "./data";

// ============================================================
// Shared UI primitives for the sell-redesign prototypes.
// Brand: Yellow Jersey yellow (#ffde59) on near-black ink.
// Containers: rounded-md. Info/alert cards: white bg + rounded-xl.
// ============================================================

// ---- Buttons ------------------------------------------------

export function Btn({
  children,
  onClick,
  variant = "primary",
  disabled,
  full,
  size = "md",
  className,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "ink";
  disabled?: boolean;
  full?: boolean;
  size?: "sm" | "md";
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-all active:scale-[0.98] disabled:active:scale-100",
        variant !== "primary" && "disabled:opacity-40",
        size === "md" ? "h-12 px-5 text-[15px]" : "h-9 px-3.5 text-[13px]",
        full && "w-full",
        variant === "primary" &&
          (disabled
            ? "bg-gray-100 text-gray-400"
            : "text-[#1c1c1e] shadow-sm hover:brightness-[0.97]"),
        variant === "ink" && "bg-gray-900 text-white hover:bg-gray-800",
        variant === "secondary" && "border border-gray-200 bg-white text-gray-900 hover:bg-gray-50",
        variant === "ghost" && "bg-transparent text-gray-600 hover:bg-gray-100",
        className,
      )}
      style={variant === "primary" && !disabled ? { backgroundColor: BRAND } : undefined}
    >
      {children}
    </button>
  );
}

// ---- Field wrapper ------------------------------------------

export function Field({
  label,
  hint,
  children,
}: {
  label?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      {(label || hint) && (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          {label && <label className="text-[13px] font-medium text-gray-700">{label}</label>}
          {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

const inputBase =
  "w-full rounded-md border border-gray-200 bg-white px-3 text-[16px] text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-900";

export function TextInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  return (
    <input
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) onEnter();
      }}
      placeholder={placeholder}
      className={cn(inputBase, "h-12")}
    />
  );
}

export function NumberInput({
  value,
  onChange,
  prefix = "$",
  placeholder,
  big,
}: {
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  placeholder?: string;
  big?: boolean;
}) {
  return (
    <div className="relative">
      <span
        className={cn(
          "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2",
          big ? "text-[36px] font-bold text-gray-900" : "text-[16px] text-gray-400",
        )}
      >
        {prefix}
      </span>
      <input
        value={value || ""}
        inputMode="numeric"
        onChange={(e) => onChange(Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)}
        placeholder={placeholder}
        className={cn(
          inputBase,
          big ? "h-20 pl-12 text-[36px] font-bold tracking-tight" : "h-12 pl-7",
        )}
      />
    </div>
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
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

// ---- Option pills (single select) --------------------------

export function OptionPills({
  value,
  options,
  onChange,
  columns = 2,
  allowCustom,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  columns?: 2 | 3;
  allowCustom?: boolean;
}) {
  const isCustom = allowCustom && value !== "" && !options.includes(value);
  const [custom, setCustom] = React.useState(isCustom ? value : "");
  return (
    <div>
      <div className={cn("grid gap-2", columns === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {options.map((opt) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={cn(
                "flex h-12 items-center justify-center rounded-md border px-3 text-[14px] font-medium transition-all active:scale-[0.98]",
                active
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {allowCustom && (
        <div className="mt-2">
          <TextInput
            value={custom}
            onChange={(v) => {
              setCustom(v);
              onChange(v);
            }}
            placeholder="Or type your own…"
          />
        </div>
      )}
    </div>
  );
}

export function BikeTypePicker({
  bikeType,
  bikeSubtype,
  onChange,
}: {
  bikeType: string;
  bikeSubtype: string;
  onChange: (next: { bikeType: string; bikeSubtype: string }) => void;
}) {
  const subtypes = bikeType ? bikeTypeSubtypes(bikeType) : [];

  return (
    <div className="space-y-3">
      <OptionPills
        value={bikeType}
        options={BIKE_TYPES}
        columns={3}
        onChange={(nextType) => onChange({ bikeType: nextType, bikeSubtype: "" })}
      />
      {subtypes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[13px] text-gray-500">More specific</p>
          <OptionPills
            value={bikeSubtype}
            options={subtypes}
            columns={subtypes.length > 4 ? 3 : 2}
            onChange={(nextSubtype) => onChange({ bikeType, bikeSubtype: nextSubtype })}
          />
        </div>
      )}
    </div>
  );
}

// ---- Toggle -------------------------------------------------

export function Toggle({
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
      style={checked ? { backgroundColor: BRAND } : undefined}
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

// ---- Progress bar -------------------------------------------

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: BRAND }}
        initial={false}
        animate={{ width: `${Math.round(value * 100)}%` }}
        transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
      />
    </div>
  );
}

export function MacroProgressHeader({
  step,
  labels,
}: {
  step: number;
  labels: readonly string[];
}) {
  const safeStep = Math.max(0, Math.min(step, labels.length - 1));
  return (
    <div className="flex-shrink-0 px-4 pb-3 pt-1">
      <div className="flex items-center gap-1.5">
        {labels.map((label, i) => (
          <div
            key={label}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= safeStep ? "" : "bg-gray-200",
            )}
            style={i <= safeStep ? { backgroundColor: BRAND } : undefined}
          />
        ))}
      </div>
      <p className="mt-1.5 text-[12px] font-medium text-gray-500">
        Step {safeStep + 1} of {labels.length} · {labels[safeStep]}
      </p>
    </div>
  );
}

// ---- AI atoms -----------------------------------------------

export function AiPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium text-gray-500">{children}</span>
  );
}

export function ConfidenceDot({ c, withLabel }: { c: Confidence; withLabel?: boolean }) {
  if (c === "high") return null;
  const meta = confidenceMeta(c);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {withLabel && meta.label && (
        <span className="text-[12px] font-medium text-gray-500">{meta.label}</span>
      )}
    </span>
  );
}

export function TitleOptionList({
  options,
  selected,
  onPick,
}: {
  options: string[];
  selected: string;
  onPick: (value: string) => void;
}) {
  const unique = [...new Set(options.map((option) => option.trim()).filter(Boolean))].slice(0, 5);
  if (unique.length <= 1) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[13px] text-gray-500">Suggested titles</p>
      <div className="space-y-2">
        {unique.map((title) => (
          <button
            key={title}
            type="button"
            onClick={() => onPick(title)}
            className={cn(
              "w-full rounded-md border px-3 py-2.5 text-left text-[15px] leading-snug transition-colors active:scale-[0.99]",
              selected === title
                ? "border-gray-900 bg-gray-50 font-medium text-gray-900"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
            )}
          >
            {title}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PublishedCoverImage({ imageUrl, alt }: { imageUrl?: string; alt?: string }) {
  return (
    <motion.div
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className="mx-auto h-32 w-32 overflow-hidden rounded-md border border-gray-200 bg-gray-100 shadow-sm"
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={alt ?? "Your listing"} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-gray-400">
          <Camera className="h-8 w-8" />
        </div>
      )}
    </motion.div>
  );
}

// The signature "AI recommends X" row — accept with one tap, or pick an alternative.
export function AiSuggestion({
  value,
  confidence,
  alternatives,
  accepted,
  onAccept,
  onPick,
}: {
  value: string;
  confidence: Confidence;
  alternatives?: string[];
  accepted: boolean;
  onAccept: () => void;
  onPick?: (v: string) => void;
}) {
  if (!value) return null;
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      {confidence !== "high" && (
        <div className="mb-2">
          <ConfidenceDot c={confidence} withLabel />
        </div>
      )}
      <button
        type="button"
        onClick={onAccept}
        className={cn(
          "mt-2 flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left transition-all active:scale-[0.99]",
          accepted ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white hover:border-gray-300",
        )}
      >
        <span className="text-[15px] font-medium text-gray-900">{value}</span>
        {accepted ? (
          <span
            className="grid h-6 w-6 place-items-center rounded-full text-gray-900"
            style={{ backgroundColor: BRAND }}
          >
            <Check className="h-4 w-4" />
          </span>
        ) : (
          <span className="text-[12px] font-semibold text-gray-500">Use this</span>
        )}
      </button>
      {alternatives && alternatives.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="text-[11px] text-gray-400">Or:</span>
          {alternatives.map((alt) => (
            <button
              key={alt}
              type="button"
              onClick={() => onPick?.(alt)}
              className="rounded-md bg-gray-100 px-2 py-1 text-[12px] font-medium text-gray-700 hover:bg-gray-200"
            >
              {alt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Info card (white bg, rounded-xl per project convention) -

export function InfoCard({
  children,
  className,
  tone = "plain",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "plain" | "brand";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-3.5",
        tone === "brand" ? "border-gray-200 shadow-sm" : "border-gray-200",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---- Section card (rounded-md) ------------------------------

export function SectionCard({
  title,
  icon: Icon,
  right,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-gray-500" />}
          <h3 className="text-[14px] font-semibold text-gray-900">{title}</h3>
        </div>
        {right}
      </div>
      <div className="p-3.5">{children}</div>
    </div>
  );
}

// ---- Collapsible (project dropdown animation pattern) -------

export function Collapsible({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronDown
      className={cn(
        "h-4 w-4 text-gray-400 transition-transform duration-200",
        open && "rotate-180",
      )}
    />
  );
}

// ---- Photo grid + uploader ---------------------------------

function PhotoPreviewLightbox({
  images,
  index,
  onClose,
  onChangeIndex,
}: {
  images: string[];
  index: number;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
}) {
  const url = images[index];
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && hasPrev) onChangeIndex(index - 1);
      if (event.key === "ArrowRight" && hasNext) onChangeIndex(index + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hasNext, hasPrev, index, onChangeIndex, onClose]);

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Photo preview"
    >
      <div
        className="relative flex max-h-full max-w-full animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out"
        onClick={(event) => event.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          className="max-h-[min(90dvh,900px)] max-w-[min(92vw,900px)] rounded-md object-contain"
        />

        <button
          type="button"
          aria-label="Close preview"
          onClick={onClose}
          className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-800 shadow-md transition-colors hover:bg-gray-100 sm:right-2 sm:top-2"
        >
          <X className="h-4 w-4" />
        </button>

        {images.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              disabled={!hasPrev}
              onClick={() => onChangeIndex(index - 1)}
              className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-gray-800 shadow-md transition-colors hover:bg-white disabled:pointer-events-none disabled:opacity-40 sm:left-3"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              disabled={!hasNext}
              onClick={() => onChangeIndex(index + 1)}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-gray-800 shadow-md transition-colors hover:bg-white disabled:pointer-events-none disabled:opacity-40 sm:right-3"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <p className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs font-medium text-white/90">
              {index + 1} / {images.length}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function PhotoUploader({
  images,
  onAdd,
  onFiles,
  onRemove,
  uploading,
  compact,
}: {
  images: string[];
  onAdd: () => void;
  onFiles?: (files: File[]) => void;
  onRemove?: (i: number) => void;
  uploading?: boolean;
  compact?: boolean;
}) {
  const [previewIndex, setPreviewIndex] = React.useState<number | null>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const libraryInputRef = React.useRef<HTMLInputElement>(null);

  const triggerCamera = () => {
    if (onFiles) cameraInputRef.current?.click();
    else onAdd();
  };

  const triggerLibrary = () => {
    if (onFiles) libraryInputRef.current?.click();
    else onAdd();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onFiles) return;
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) onFiles(files);
    e.target.value = "";
  };

  const hiddenInputs = onFiles ? (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
    </>
  ) : null;

  if (images.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {hiddenInputs}
        <button
          type="button"
          onClick={triggerCamera}
          disabled={uploading}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-md border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-50 active:scale-[0.98] disabled:opacity-50",
            compact ? "h-24" : "h-28",
          )}
        >
          {uploading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Camera className="h-7 w-7" />}
          <span className="text-[14px] font-semibold">{uploading ? "Uploading…" : "Camera"}</span>
        </button>
        <button
          type="button"
          onClick={triggerLibrary}
          disabled={uploading}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-md border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-50 active:scale-[0.98] disabled:opacity-50",
            compact ? "h-24" : "h-28",
          )}
        >
          <Images className="h-7 w-7" />
          <span className="text-[14px] font-semibold">Photo library</span>
        </button>
      </div>
    );
  }
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {hiddenInputs}
        {images.map((url, i) => (
          <div key={`${url}-${i}`} className="relative aspect-square overflow-hidden rounded-md bg-gray-100">
            <button
              type="button"
              onClick={() => setPreviewIndex(i)}
              className="block h-full w-full cursor-zoom-in"
              aria-label={`View photo ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
            {i === 0 && (
              <span className="pointer-events-none absolute left-1 top-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                Cover
              </span>
            )}
            {onRemove && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(i);
                  setPreviewIndex((current) => {
                    if (current === null) return null;
                    if (current === i) return null;
                    if (current > i) return current - 1;
                    return current;
                  });
                }}
                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white"
                aria-label="Remove photo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={triggerLibrary}
          disabled={uploading}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          <span className="text-[11px] font-medium">{uploading ? "…" : "Add"}</span>
        </button>
      </div>

      {previewIndex !== null && images[previewIndex] ? (
        <PhotoPreviewLightbox
          images={images}
          index={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onChangeIndex={setPreviewIndex}
        />
      ) : null}
    </>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return <Loader2 className="animate-spin text-gray-900" width={size} height={size} />;
}

// Discreet loading text — a light sweep of highlight travels across the
// characters (the iOS "thinking" treatment) instead of a spinner.
export function ShimmerText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-block", className)}
      style={{
        backgroundImage:
          "linear-gradient(90deg, #9ca3af 0%, #9ca3af 38%, #111827 50%, #9ca3af 62%, #9ca3af 100%)",
        backgroundSize: "200% 100%",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        WebkitTextFillColor: "transparent",
        animation: "yj-shimmer-sweep 1.8s linear infinite",
      }}
    >
      {children}
      <style>{`@keyframes yj-shimmer-sweep { from { background-position: 200% 0; } to { background-position: -200% 0; } }`}</style>
    </span>
  );
}

// ---- Bottom sheet / popup (project popup animation pattern) -

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
      />
      <div className="relative z-10 w-full max-w-[460px] animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out">
        <div className="rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
          {title && (
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[16px] font-bold text-gray-900">{title}</h3>
                {subtitle && (
                  <p className="mt-0.5 text-[13px] leading-relaxed text-gray-500">{subtitle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md text-gray-400 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

// ---- Inline editable line (tap to edit) --------------------

export function EditableRow({
  label,
  value,
  onChange,
  placeholder,
  confidence,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  confidence?: Confidence;
}) {
  const [editing, setEditing] = React.useState(false);
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="mt-0.5 w-28 flex-shrink-0 text-[13px] text-gray-500">{label}</span>
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => e.key === "Enter" && setEditing(false)}
          placeholder={placeholder}
          className="flex-1 rounded-md border border-gray-900 bg-white px-2 py-1 text-[14px] text-gray-900 outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="group flex flex-1 items-center justify-end gap-1.5 text-right"
        >
          {confidence && <ConfidenceDot c={confidence} />}
          <span className={cn("text-[14px] font-medium", value ? "text-gray-900" : "text-gray-400")}>
            {value || placeholder || "Add"}
          </span>
          <Pencil className="h-3 w-3 flex-shrink-0 text-gray-300 group-hover:text-gray-500" />
        </button>
      )}
    </div>
  );
}
