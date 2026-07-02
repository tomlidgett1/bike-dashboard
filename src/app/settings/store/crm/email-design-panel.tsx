"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DEFAULT_DESIGN_COLORS,
  LAYOUT_PRESETS,
  mergeDesignIntoContent,
  ensureCampaignDesign,
  type CampaignLayout,
} from "@/lib/crm/design";
import type { CampaignContent, CampaignDesign } from "@/lib/crm/types";

const COLOR_FIELDS: { key: keyof CampaignDesign["colors"]; label: string }[] = [
  { key: "hero", label: "Hero background" },
  { key: "accent", label: "Accent / button" },
  { key: "surface", label: "Content area" },
  { key: "text", label: "Headings" },
  { key: "muted", label: "Body text" },
  { key: "buttonText", label: "Button text" },
];

export function EmailDesignPanel(props: {
  content: CampaignContent;
  onChange: (content: CampaignContent) => void;
}) {
  const design = ensureCampaignDesign(props.content);

  const patchDesign = (patch: Partial<CampaignDesign>) => {
    props.onChange(mergeDesignIntoContent(props.content, patch));
  };

  return (
    <div className="space-y-4 rounded-md border border-border/60 bg-white p-4">
      <div>
        <Label className="text-xs font-medium text-muted-foreground">Editor mode</Label>
        <div className="mt-2 flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
          {(
            [
              { id: "template", label: "Template" },
              { id: "builder", label: "Drag & drop" },
            ] as const
          ).map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => patchDesign({ mode: entry.id })}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                design.mode === entry.id
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs font-medium text-muted-foreground">Layout preset</Label>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(Object.keys(LAYOUT_PRESETS) as CampaignLayout[]).map((layout) => {
            const preset = LAYOUT_PRESETS[layout];
            const active = design.layout === layout;
            return (
              <button
                key={layout}
                type="button"
                onClick={() =>
                  patchDesign({
                    layout,
                    colors: {
                      ...design.colors,
                      ...preset.colors,
                    } as CampaignDesign["colors"],
                  })
                }
                className={cn(
                  "rounded-md border p-3 text-left transition-colors",
                  active
                    ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900/10"
                    : "border-border/60 bg-white hover:border-border",
                )}
              >
                <p className="text-sm font-medium text-foreground">{preset.label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{preset.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label className="text-xs font-medium text-muted-foreground">Colours</Label>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {COLOR_FIELDS.map((field) => (
            <div key={field.key} className="flex items-center gap-2">
              <input
                type="color"
                value={design.colors[field.key]}
                onChange={(event) =>
                  patchDesign({ colors: { ...design.colors, [field.key]: event.target.value } })
                }
                className="size-8 shrink-0 cursor-pointer rounded-md border border-border/60"
                aria-label={field.label}
              />
              <span className="text-xs text-muted-foreground">{field.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
