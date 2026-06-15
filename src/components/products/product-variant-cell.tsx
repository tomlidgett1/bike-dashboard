"use client";

import Link from "next/link";
import { Layers } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/dashboard";
import {
  buildVariantBadgeLabel,
  type ProductVariantSummary,
} from "@/lib/variants/product-variant-display";
import { cn } from "@/lib/utils";

function variantTone(summary: ProductVariantSummary): StatusTone {
  if (!summary.variant_group_id) return "neutral";
  if (summary.variant_is_master) return "success";
  if (summary.variant_hidden_from_grid) return "neutral";
  return "info";
}

export function ProductVariantCell({
  summary,
  className,
}: {
  summary: ProductVariantSummary;
  className?: string;
}) {
  const label = buildVariantBadgeLabel(summary);
  if (!label) {
    return <span className={cn("text-[11px] text-muted-foreground/50", className)}>—</span>;
  }

  const title = summary.variant_group_title
    ? `Part of “${summary.variant_group_title}”`
    : "View variant group in Product Optimise";

  return (
    <Link
      href="/optimize/variants"
      title={title}
      className={cn("inline-flex max-w-full", className)}
    >
      <StatusBadge
        label={
          <span className="inline-flex max-w-[120px] items-center gap-1 truncate">
            <Layers className="size-3 shrink-0 opacity-60" />
            <span className="truncate">{label}</span>
          </span>
        }
        tone={variantTone(summary)}
        className="h-5 max-w-[130px] rounded-md text-[10px] hover:bg-muted/40"
      />
    </Link>
  );
}
