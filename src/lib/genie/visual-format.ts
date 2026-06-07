import { formatStoreAnalyticsDate } from "@/lib/utils/format-store-analytics-date";

export type VisualValueFormat = "currency" | "number" | "percent";

export type VisualDateFormat = "default" | "short" | "long" | "ordinal";

export const VISUAL_DATE_FORMAT_OPTIONS: Array<{ value: VisualDateFormat; label: string; example: string }> = [
  { value: "default", label: "As pinned", example: "Original labels" },
  { value: "short", label: "Short date", example: "3 Feb" },
  { value: "long", label: "Long date", example: "3 February 2025" },
  { value: "ordinal", label: "Ordinal date", example: "Feb 3rd" },
];

export const VISUAL_VALUE_FORMAT_OPTIONS: Array<{ value: "" | VisualValueFormat; label: string }> = [
  { value: "", label: "Auto" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "percent", label: "Percent" },
];

function ordinalSuffix(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function parseCalendarDate(value: string): { year: number; month: number; day: number } | null {
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dayMatch) {
    return {
      year: Number(dayMatch[1]),
      month: Number(dayMatch[2]),
      day: Number(dayMatch[3]),
    };
  }

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(value);
  if (monthMatch) {
    return {
      year: Number(monthMatch[1]),
      month: Number(monthMatch[2]),
      day: 1,
    };
  }

  return null;
}

export function isDateLikeValue(value: string): boolean {
  if (!value || value === "—") return false;
  return /^\d{4}-\d{2}(-\d{2})?$/.test(value) || /^\d{4}-\d{2}-\d{2}T/.test(value);
}

export function formatVisualDate(value: string, format: VisualDateFormat): string {
  if (!value || value === "—" || format === "default") return value;

  const parsed = parseCalendarDate(value);
  if (!parsed) {
    const isoPrefix = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    if (isoPrefix) {
      return formatVisualDate(isoPrefix[1], format);
    }
    return value;
  }

  const anchor = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0));
  const isMonthOnly = /^\d{4}-\d{2}$/.test(value);

  if (format === "ordinal") {
    if (isMonthOnly) {
      return anchor.toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" });
    }
    const month = anchor.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" });
    return `${month} ${parsed.day}${ordinalSuffix(parsed.day)}`;
  }

  if (format === "long") {
    if (isMonthOnly) {
      return anchor.toLocaleDateString("en-AU", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    }
    return anchor.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  if (isMonthOnly) {
    return anchor.toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" });
  }

  return formatStoreAnalyticsDate(value);
}

function formatAxisPart(part: string, dateFormat: VisualDateFormat): string {
  if (dateFormat !== "default" && isDateLikeValue(part)) {
    return formatVisualDate(part, dateFormat);
  }
  if (part.length > 22) return `${part.slice(0, 21)}…`;
  return part;
}

export function formatAxisParts(parts: string[], dateFormat: VisualDateFormat): string {
  return parts.map((part) => formatAxisPart(part, dateFormat)).join(" · ");
}

export function formatAxisPartsWithFormats(
  parts: string[],
  fieldKeys: string[],
  fieldDateFormats: Record<string, VisualDateFormat | undefined>,
  fallbackDateFormat: VisualDateFormat,
): string {
  return parts
    .map((part, index) => {
      const key = fieldKeys[index] ?? `field-${index}`;
      const fmt = fieldDateFormats[key] ?? fallbackDateFormat;
      return formatAxisPart(part, fmt);
    })
    .join(" · ");
}

export function hasCustomAxisFormats(
  fallbackDateFormat: VisualDateFormat,
  fieldDateFormats?: Record<string, VisualDateFormat | undefined>,
): boolean {
  if (fallbackDateFormat !== "default") return true;
  return Object.values(fieldDateFormats ?? {}).some((fmt) => fmt && fmt !== "default");
}

export function formatVisualValue(
  value: string | number | null | undefined,
  format?: VisualValueFormat,
): string {
  if (value == null || value === "") return "—";
  const numeric = typeof value === "number" ? value : Number(value);

  if (format === "currency" && Number.isFinite(numeric)) {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 2,
    }).format(numeric);
  }

  if (format === "number" && Number.isFinite(numeric)) {
    return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(numeric);
  }

  if (format === "percent" && Number.isFinite(numeric)) {
    return `${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(numeric)}%`;
  }

  return String(value);
}

export function formatTableCellValue(
  value: string | number | null | undefined,
  options?: {
    format?: VisualValueFormat;
    dateFormat?: VisualDateFormat;
  },
): string {
  if (value == null || value === "") return "—";

  const text = String(value);
  if (options?.dateFormat && options.dateFormat !== "default" && isDateLikeValue(text)) {
    return formatVisualDate(text, options.dateFormat);
  }

  return formatVisualValue(value, options?.format);
}

export function formatPivotNumericValue(
  value: number | null | undefined,
  format?: VisualValueFormat,
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return formatVisualValue(value, format ?? "number");
}
