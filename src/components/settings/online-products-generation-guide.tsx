"use client";

import * as React from "react";
import { HelpCircle } from "@/components/layout/app-sidebar/dashboard-icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type PipelineStepId = "csv" | "ai" | "images" | "publish";

type FieldSource = "csv" | "ai" | "images" | "system";

interface GeneratedField {
  label: string;
  detail: string;
  source: FieldSource;
}

interface PipelineStep {
  id: PipelineStepId;
  title: string;
  when: string;
  fields: GeneratedField[];
}

const SOURCE_LABEL: Record<FieldSource, string> = {
  csv: "Your CSV",
  ai: "AI + web research",
  images: "Image search",
  system: "On save",
};

const PIPELINE: PipelineStep[] = [
  {
    id: "csv",
    title: "Import from your sheet",
    when: "As soon as the file is uploaded",
    fields: [
      {
        label: "All column values",
        detail: "Stored exactly as in your file so you can review and re-select rows later.",
        source: "csv",
      },
      {
        label: "Stock on hand (SOH)",
        detail:
          "Taken from your CSV when a column looks like stock, qty, SOH, on hand, etc. AI does not invent stock levels.",
        source: "csv",
      },
    ],
  },
  {
    id: "ai",
    title: "AI optimise (selected rows)",
    when: "After you run Optimise selected with AI",
    fields: [
      {
        label: "Product title & brand",
        detail: "Clean marketplace title with size, colour, model year, and other variant details kept where possible.",
        source: "ai",
      },
      {
        label: "Price (AUD)",
        detail: "Uses your CSV price when present; otherwise inferred from the row and web research.",
        source: "ai",
      },
      {
        label: "Category & subcategory",
        detail: "Mapped into Bicycles, Parts, Apparel, or Nutrition with a specific subcategory.",
        source: "ai",
      },
      {
        label: "Description",
        detail: "Short customer-facing description grounded in your row and manufacturer/retailer pages.",
        source: "ai",
      },
      {
        label: "Specs",
        detail: "Bullet-list spec sheet (materials, compatibility, capacity, etc.) when research finds them.",
        source: "ai",
      },
      {
        label: "SOH (again)",
        detail: "Still comes from your CSV column — carried through to the listing unless you change it later.",
        source: "csv",
      },
    ],
  },
  {
    id: "images",
    title: "Product images",
    when: "After optimise, on the review screen — Find images",
    fields: [
      {
        label: "Primary image",
        detail: "AI picks the best match from web image search; you can change the primary or remove images.",
        source: "images",
      },
      {
        label: "Gallery images",
        detail: "Additional angles or pack shots you approve before creating the product.",
        source: "images",
      },
      {
        label: "Image enhancement",
        detail: "Optional cleanup on a selected image before save (when you use Enhance).",
        source: "images",
      },
    ],
  },
  {
    id: "publish",
    title: "Create store listing",
    when: "When you create online / store products",
    fields: [
      {
        label: "Active listing",
        detail: "Saved to your store inventory with category, price, description, and specs from the steps above.",
        source: "system",
      },
      {
        label: "Online Only badge",
        detail: "Optional marketplace badge (toggle at the top) when enabled for this batch.",
        source: "system",
      },
      {
        label: "Default SOH if missing",
        detail: "If no stock column was found in the CSV, quantity defaults to 9999 until you edit it in Products.",
        source: "system",
      },
      {
        label: "Cloudinary images",
        detail: "Approved images upload in the background and appear on the marketplace when processing finishes.",
        source: "system",
      },
    ],
  },
];

type HighlightProp = PipelineStepId | readonly PipelineStepId[];

function highlightStep(stepId: PipelineStepId, highlight?: HighlightProp) {
  if (!highlight) return false;
  if (Array.isArray(highlight)) return highlight.includes(stepId);
  return highlight === stepId;
}

export function OnlineProductsGenerationTooltip({
  className,
}: {
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-gray-100 hover:text-foreground",
            className,
          )}
          aria-label="What gets generated"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="end"
        sideOffset={6}
        className="max-w-xs border border-border bg-white p-3 text-left text-xs text-muted-foreground shadow-md whitespace-normal"
      >
        <p className="font-medium text-foreground mb-2">What gets generated</p>
        <ul className="space-y-1.5 leading-relaxed">
          <li>
            <span className="font-medium text-foreground">From CSV:</span> row data and SOH
            (stock columns only — not AI-guessed).
          </li>
          <li>
            <span className="font-medium text-foreground">AI optimise:</span> title, brand, price,
            category, description, and specs.
          </li>
          <li>
            <span className="font-medium text-foreground">Images:</span> web search on the next
            screen — you pick primary and gallery.
          </li>
          <li>
            <span className="font-medium text-foreground">Create:</span> store listing, optional
            Online Only badge; SOH defaults to 9999 if missing from CSV.
          </li>
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

export function OnlineProductsGenerationGuide({
  highlight,
  compact,
  className,
}: {
  /** Emphasise the step(s) the user is on right now */
  highlight?: HighlightProp;
  compact?: boolean;
  className?: string;
}) {
  const steps = compact
    ? PIPELINE.filter((s) => highlightStep(s.id, highlight ?? ["ai", "images"]))
    : PIPELINE;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-white p-4",
        className,
      )}
    >
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">What gets generated</p>
        <p className="text-xs text-muted-foreground">
          Each step adds fields. You can edit everything before products go live.
        </p>
      </div>

      <ol className={cn("mt-4 space-y-4", compact && "mt-3 space-y-3")}>
        {steps.map((step, stepIndex) => {
          const active = highlightStep(step.id, highlight);
          return (
            <li
              key={step.id}
              className={cn(
                "rounded-md border border-border/60 p-3",
                active && "border-border bg-muted/30",
              )}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                  {stepIndex + 1}.
                </span>
                <span className="text-sm font-medium text-foreground">{step.title}</span>
                <span className="text-xs text-muted-foreground">— {step.when}</span>
              </div>
              <ul className="mt-2.5 space-y-2">
                {step.fields.map((field) => (
                  <li key={`${step.id}-${field.label}`} className="flex gap-2 text-xs">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-medium text-foreground">{field.label}</span>
                        <span className="rounded-md border border-border bg-white px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {SOURCE_LABEL[field.source]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-muted-foreground leading-relaxed">
                        {field.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
