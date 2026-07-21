import type {
  AnalyticsElementDesign,
  AnalyticsFontFamily,
  AnalyticsFontWeight,
  AnalyticsLabelSize,
  AnalyticsMetricLayout,
  AnalyticsValueSize,
} from "./types";

export const ANALYTICS_FONT_OPTIONS: Array<{
  value: AnalyticsFontFamily;
  label: string;
}> = [
  { value: "sans", label: "Sans (Inter)" },
  { value: "display", label: "Display (Jakarta)" },
  { value: "rounded", label: "Rounded (Outfit)" },
  { value: "serif", label: "Serif (DM Serif)" },
  { value: "mono", label: "Mono (JetBrains)" },
  { value: "handwriting", label: "Script (Caveat)" },
];

export const ANALYTICS_COLOR_PRESETS: Array<{ value: string; label: string }> = [
  { value: "#111827", label: "Charcoal" },
  { value: "#475569", label: "Slate" },
  { value: "#0B6E99", label: "Ocean" },
  { value: "#0F7B6C", label: "Forest" },
  { value: "#B45309", label: "Amber" },
  { value: "#9F1239", label: "Rose" },
];

export const ANALYTICS_VALUE_SIZE_OPTIONS: Array<{
  value: AnalyticsValueSize;
  label: string;
}> = [
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "lg", label: "L" },
  { value: "xl", label: "XL" },
  { value: "2xl", label: "2XL" },
];

export const ANALYTICS_LABEL_SIZE_OPTIONS: Array<{
  value: AnalyticsLabelSize;
  label: string;
}> = [
  { value: "xs", label: "S" },
  { value: "sm", label: "M" },
  { value: "md", label: "L" },
];

export const ANALYTICS_WEIGHT_OPTIONS: Array<{
  value: AnalyticsFontWeight;
  label: string;
}> = [
  { value: "normal", label: "Regular" },
  { value: "medium", label: "Medium" },
  { value: "semibold", label: "Semibold" },
  { value: "bold", label: "Bold" },
];

export const ANALYTICS_METRIC_LAYOUT_OPTIONS: Array<{
  value: AnalyticsMetricLayout;
  label: string;
  hint: string;
}> = [
  { value: "label-above", label: "Label above", hint: "Title on top, value below" },
  { value: "label-below", label: "Label below", hint: "Value on top, title below" },
  { value: "label-left", label: "Label left", hint: "Title left of value" },
  { value: "label-right", label: "Label right", hint: "Title right of value" },
  { value: "centered", label: "Centred", hint: "Stacked and centred" },
  { value: "value-only", label: "Value only", hint: "Hide the measure label" },
];

export function analyticsFontFamilyCss(font?: AnalyticsFontFamily): string | undefined {
  switch (font) {
    case "sans":
      return "var(--font-sans), ui-sans-serif, system-ui, sans-serif";
    case "display":
      return "var(--font-display), var(--font-sans), sans-serif";
    case "rounded":
      return "var(--font-analytics-rounded), var(--font-sans), sans-serif";
    case "serif":
      return "var(--font-analytics-serif), ui-serif, Georgia, serif";
    case "mono":
      return "var(--font-geist-mono), ui-monospace, monospace";
    case "handwriting":
      return "var(--font-handwriting), cursive";
    default:
      return undefined;
  }
}

export function analyticsValueSizeClass(size?: AnalyticsValueSize): string {
  switch (size) {
    case "sm":
      return "text-xl";
    case "md":
      return "text-2xl";
    case "lg":
      return "text-3xl";
    case "xl":
      return "text-4xl";
    case "2xl":
      return "text-5xl";
    default:
      return "text-3xl";
  }
}

export function analyticsLabelSizeClass(size?: AnalyticsLabelSize): string {
  switch (size) {
    case "xs":
      return "text-[10px]";
    case "md":
      return "text-sm";
    case "sm":
    default:
      return "text-[11px]";
  }
}

export function analyticsWeightClass(weight?: AnalyticsFontWeight): string {
  switch (weight) {
    case "normal":
      return "font-normal";
    case "medium":
      return "font-medium";
    case "bold":
      return "font-bold";
    case "semibold":
    default:
      return "font-semibold";
  }
}

export function analyticsChartTickFontSize(size?: AnalyticsLabelSize): number {
  switch (size) {
    case "xs":
      return 10;
    case "md":
      return 12;
    case "sm":
    default:
      return 11;
  }
}

export function mergeElementDesign(
  current: AnalyticsElementDesign | undefined,
  patch: Partial<AnalyticsElementDesign>,
): AnalyticsElementDesign {
  return { ...(current ?? {}), ...patch };
}
