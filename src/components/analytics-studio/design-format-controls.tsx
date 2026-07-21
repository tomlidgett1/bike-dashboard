"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ANALYTICS_COLOR_PRESETS,
  ANALYTICS_FONT_OPTIONS,
  ANALYTICS_LABEL_SIZE_OPTIONS,
  ANALYTICS_METRIC_LAYOUT_OPTIONS,
  ANALYTICS_VALUE_SIZE_OPTIONS,
  ANALYTICS_WEIGHT_OPTIONS,
  mergeElementDesign,
} from "@/lib/analytics-studio/design";
import type {
  AnalyticsElementDesign,
  AnalyticsWorkbookElement,
} from "@/lib/analytics-studio/types";

function ColorSwatches({
  value,
  onChange,
}: {
  value?: string;
  onChange: (color: string) => void;
}) {
  const active = (value ?? "").toLowerCase();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ANALYTICS_COLOR_PRESETS.map((preset) => {
        const selected = active === preset.value.toLowerCase();
        return (
          <button
            key={preset.value}
            type="button"
            title={preset.label}
            aria-label={preset.label}
            onClick={() => onChange(preset.value)}
            className={cn(
              "h-6 w-6 rounded-md border border-gray-200",
              selected && "ring-2 ring-gray-400 ring-offset-1",
            )}
            style={{ backgroundColor: preset.value }}
          />
        );
      })}
      <label className="relative h-6 w-6 overflow-hidden rounded-md border border-gray-200 bg-white">
        <span className="sr-only">Custom colour</span>
        <input
          type="color"
          value={value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#111827"}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
        <span
          className="pointer-events-none absolute inset-0.5 rounded-[4px]"
          style={{
            background:
              value && /^#/.test(value)
                ? value
                : "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)",
          }}
        />
      </label>
    </div>
  );
}

function SizeTabs<T extends string>({
  options,
  value,
  fallback,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value?: T;
  fallback: T;
  onChange: (value: T) => void;
}) {
  const active = value ?? fallback;
  return (
    <div className="flex items-center rounded-md bg-gray-100 p-0.5 w-fit">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            active === option.value
              ? "bg-white text-gray-800 shadow-sm"
              : "text-gray-600 hover:bg-gray-200/70",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Format-tab design controls for bar, line, and metric elements. */
export function DesignFormatControls({
  element,
  onChange,
}: {
  element: AnalyticsWorkbookElement;
  onChange: (patch: Partial<AnalyticsWorkbookElement>) => void;
}) {
  const design = element.design ?? {};
  const isMetric = element.viz === "metric";
  const isChart = element.viz === "bar" || element.viz === "line";

  if (!isMetric && !isChart) return null;

  const patchDesign = (patch: Partial<AnalyticsElementDesign>) => {
    onChange({ design: mergeElementDesign(element.design, patch) });
  };

  return (
    <>
      <div className="border-b border-gray-100 px-3 py-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
          Colour
        </p>
        <div className="mt-1.5 space-y-2">
          <div>
            <p className="mb-1 text-[10px] text-gray-400">
              {isMetric ? "Value" : "Series"}
            </p>
            <ColorSwatches
              value={design.color}
              onChange={(color) => patchDesign({ color })}
            />
          </div>
          <div>
            <p className="mb-1 text-[10px] text-gray-400">
              {isMetric ? "Label" : "Axis labels"}
            </p>
            <ColorSwatches
              value={design.labelColor}
              onChange={(color) => patchDesign({ labelColor: color })}
            />
          </div>
        </div>
      </div>

      <div className="border-b border-gray-100 px-3 py-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
          Font
        </p>
        <div className="mt-1.5 space-y-2">
          <Select
            value={design.fontFamily ?? "sans"}
            onValueChange={(value) =>
              patchDesign({
                fontFamily: value as NonNullable<AnalyticsElementDesign["fontFamily"]>,
              })
            }
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANALYTICS_FONT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isMetric ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="mb-1 text-[10px] text-gray-400">Value weight</p>
                <Select
                  value={design.valueWeight ?? "semibold"}
                  onValueChange={(value) =>
                    patchDesign({
                      valueWeight: value as NonNullable<AnalyticsElementDesign["valueWeight"]>,
                    })
                  }
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANALYTICS_WEIGHT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1 text-[10px] text-gray-400">Label weight</p>
                <Select
                  value={design.labelWeight ?? "medium"}
                  onValueChange={(value) =>
                    patchDesign({
                      labelWeight: value as NonNullable<AnalyticsElementDesign["labelWeight"]>,
                    })
                  }
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANALYTICS_WEIGHT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-b border-gray-100 px-3 py-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
          Size
        </p>
        <div className="mt-1.5 space-y-2">
          {isMetric ? (
            <>
              <div>
                <p className="mb-1 text-[10px] text-gray-400">Value</p>
                <SizeTabs
                  options={ANALYTICS_VALUE_SIZE_OPTIONS}
                  value={design.valueSize}
                  fallback="lg"
                  onChange={(valueSize) => patchDesign({ valueSize })}
                />
              </div>
              <div>
                <p className="mb-1 text-[10px] text-gray-400">Label</p>
                <SizeTabs
                  options={ANALYTICS_LABEL_SIZE_OPTIONS}
                  value={design.labelSize}
                  fallback="sm"
                  onChange={(labelSize) => patchDesign({ labelSize })}
                />
              </div>
            </>
          ) : (
            <div>
              <p className="mb-1 text-[10px] text-gray-400">Axis labels</p>
              <SizeTabs
                options={ANALYTICS_LABEL_SIZE_OPTIONS}
                value={design.labelSize}
                fallback="sm"
                onChange={(labelSize) => patchDesign({ labelSize })}
              />
            </div>
          )}
        </div>
      </div>

      {isMetric ? (
        <div className="border-b border-gray-100 px-3 py-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Layout
          </p>
          <div className="mt-1.5 grid grid-cols-2 gap-1">
            {ANALYTICS_METRIC_LAYOUT_OPTIONS.map((option) => {
              const active = (design.metricLayout ?? "label-above") === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  title={option.hint}
                  onClick={() => patchDesign({ metricLayout: option.value })}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-left text-[11px] font-medium transition-colors",
                    active
                      ? "border-gray-400 bg-white text-gray-900 shadow-sm"
                      : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:text-gray-800",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {isChart ? (
        <div className="border-b border-gray-100 px-3 py-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Chart
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-xs text-gray-600">Show grid</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-2.5 text-xs",
                design.showGrid === false
                  ? "text-gray-500"
                  : "bg-gray-100 text-gray-800",
              )}
              onClick={() =>
                patchDesign({
                  showGrid: design.showGrid === false,
                })
              }
            >
              {design.showGrid === false ? "Off" : "On"}
            </Button>
          </div>
          <div className="mt-2">
            <p className="mb-1 text-[10px] text-gray-400">Accent hex</p>
            <Input
              value={design.color ?? ""}
              onChange={(event) => patchDesign({ color: event.target.value || undefined })}
              placeholder="#0B6E99"
              className="h-7 font-mono text-xs"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
