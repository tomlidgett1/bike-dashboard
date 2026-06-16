"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  DollarSign,
  Eye,
  EyeOff,
  FolderPlus,
  LayoutGrid,
  Loader2,
  Pencil,
  Tag,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { GmailEmailActionCard } from "@/components/genie/gmail-email-action-card";
import { LightspeedPurchaseOrderCard } from "@/components/genie/lightspeed-purchase-order-card";
import { LightspeedCategoryCreateCard } from "@/components/genie/lightspeed-category-create-card";
import { LightspeedProductEditCard } from "@/components/genie/lightspeed-product-edit-card";
import type {
  ApplyResult,
  CarouselCreateProposal,
  CarouselLayoutProposal,
  CarouselRenameProposal,
  CarouselSizeOption,
  DiscountApplyProposal,
  DiscountRemoveProposal,
  GenieProposal,
  PriceUpdateProposal,
} from "@/lib/types/genie-agent";

const SIZE_LABEL: Record<CarouselSizeOption, string> = {
  featured: "Featured",
  normal: "Normal",
  compact: "Compact",
};

function money(v: number): string {
  const hasCents = Math.round(v * 100) % 100 !== 0;
  return `$${v.toLocaleString("en-AU", { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function DiffChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function CarouselDiff({ proposal }: { proposal: CarouselLayoutProposal }) {
  return (
    <div className="space-y-2.5">
      {proposal.changes.length > 0 && (
        <div className="space-y-1.5">
          {proposal.changes.map((ch) => {
            const orderChanged = ch.prev_display_order !== ch.display_order;
            const activeChanged = ch.prev_is_active !== ch.is_active;
            const sizeChanged = ch.prev_carousel_size !== ch.carousel_size;
            return (
              <div key={ch.id} className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-foreground">{ch.name}</span>
                {orderChanged && (
                  <DiffChip>
                    #{ch.prev_display_order} <ArrowRight className="h-2.5 w-2.5" /> #{ch.display_order}
                  </DiffChip>
                )}
                {activeChanged && (
                  <DiffChip>
                    {ch.prev_is_active ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
                    <ArrowRight className="h-2.5 w-2.5" />
                    {ch.is_active ? (
                      <span className="text-green-600 dark:text-green-400">Shown</span>
                    ) : (
                      <span className="text-muted-foreground">Hidden</span>
                    )}
                  </DiffChip>
                )}
                {sizeChanged && (
                  <DiffChip>
                    {SIZE_LABEL[ch.prev_carousel_size]} <ArrowRight className="h-2.5 w-2.5" /> {SIZE_LABEL[ch.carousel_size]}
                  </DiffChip>
                )}
              </div>
            );
          })}
        </div>
      )}

      {proposal.order_preview.length > 0 && (
        <div className="rounded-xl bg-muted/50 p-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Your page will show</p>
          <ol className="space-y-0.5">
            {proposal.order_preview.map((row, i) => (
              <li key={i} className={cn("flex items-center gap-2 text-xs", !row.is_active && "opacity-50")}>
                <span className="w-4 text-right tabular-nums text-muted-foreground">{i + 1}.</span>
                <span className="font-medium text-foreground">{row.name}</span>
                <span className="text-[10px] text-muted-foreground">{SIZE_LABEL[row.carousel_size]}</span>
                {!row.is_active && <EyeOff className="h-3 w-3 text-muted-foreground" />}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function CarouselCreateDiff({ proposal }: { proposal: CarouselCreateProposal }) {
  const preview = proposal.products_preview.slice(0, 6);
  const extra = proposal.product_ids.length - preview.length;
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="rounded-md bg-primary/15 text-foreground">
          {proposal.name}
        </Badge>
        <span className="text-[10px] text-muted-foreground">{SIZE_LABEL[proposal.carousel_size]}</span>
        <span className="text-xs text-muted-foreground">· {proposal.match_label}</span>
      </div>

      {preview.length > 0 && (
        <div className="space-y-1 rounded-xl bg-muted/50 p-2.5">
          {preview.map((p) => (
            <div key={p.id} className="truncate text-xs font-medium text-foreground">{p.name}</div>
          ))}
          {extra > 0 && <p className="pt-0.5 text-[10px] text-muted-foreground">+{extra} more product{extra === 1 ? "" : "s"}</p>}
        </div>
      )}

      {proposal.order_preview.length > 0 && (
        <div className="rounded-xl bg-muted/50 p-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Your page will show</p>
          <ol className="space-y-0.5">
            {proposal.order_preview.map((row, i) => (
              <li key={i} className={cn("flex items-center gap-2 text-xs", !row.is_active && "opacity-50")}>
                <span className="w-4 text-right tabular-nums text-muted-foreground">{i + 1}.</span>
                <span className="font-medium text-foreground">{row.name}</span>
                <span className="text-[10px] text-muted-foreground">{SIZE_LABEL[row.carousel_size]}</span>
                {row.is_new && (
                  <Badge variant="secondary" className="rounded-md bg-primary/15 px-1.5 py-0 text-[9px] text-foreground">
                    New
                  </Badge>
                )}
                {!row.is_active && <EyeOff className="h-3 w-3 text-muted-foreground" />}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function CarouselRenameDiff({ proposal }: { proposal: CarouselRenameProposal }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground line-through">{proposal.prev_name}</span>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <span className="text-xs font-semibold text-foreground">{proposal.name}</span>
    </div>
  );
}

function DiscountApplyDiff({ proposal }: { proposal: DiscountApplyProposal }) {
  const preview = proposal.products_preview.slice(0, 6);
  const extra = proposal.products_preview.length - preview.length;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-md bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          -{Math.round(proposal.discount_percent)}%
        </span>
        <span className="text-xs text-muted-foreground">{proposal.match_label}</span>
        {proposal.ends_at && (
          <span className="text-[10px] text-muted-foreground">· ends {fmtDate(proposal.ends_at)}</span>
        )}
      </div>
      {preview.length > 0 && (
        <div className="space-y-1 rounded-xl bg-muted/50 p-2.5">
          {preview.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium text-foreground">{p.name}</span>
              <span className="flex-shrink-0 whitespace-nowrap">
                <span className="text-muted-foreground line-through">{money(p.price)}</span>
                <span className="ml-1.5 font-semibold text-red-600 dark:text-red-400">{money(p.sale_price)}</span>
              </span>
            </div>
          ))}
          {extra > 0 && <p className="pt-0.5 text-[10px] text-muted-foreground">+{extra} more product{extra === 1 ? "" : "s"}</p>}
        </div>
      )}
    </div>
  );
}

function DiscountRemoveDiff({ proposal }: { proposal: DiscountRemoveProposal }) {
  const preview = proposal.products_preview.slice(0, 6);
  const extra = proposal.products_preview.length - preview.length;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{proposal.match_label}</p>
      {preview.length > 0 && (
        <div className="space-y-1 rounded-xl bg-muted/50 p-2.5">
          {preview.map((p) => (
            <div key={p.id} className="truncate text-xs font-medium text-foreground">{p.name}</div>
          ))}
          {extra > 0 && <p className="pt-0.5 text-[10px] text-muted-foreground">+{extra} more product{extra === 1 ? "" : "s"}</p>}
        </div>
      )}
    </div>
  );
}

function PriceUpdateDiff({ proposal }: { proposal: PriceUpdateProposal }) {
  const preview = proposal.products_preview.slice(0, 8);
  const extra = proposal.products_preview.length - preview.length;
  const fmt = (v: number) => `$${v.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{proposal.match_label}</p>
      {preview.length > 0 && (
        <div className="space-y-1.5 rounded-xl bg-muted/50 p-2.5">
          {preview.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs text-foreground">{p.name}</span>
              <div className="flex flex-shrink-0 items-center gap-1">
                <span className="text-[10px] text-muted-foreground line-through">{fmt(p.current_price)}</span>
                <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                <span className="text-[10px] font-semibold text-foreground">{fmt(p.new_price)}</span>
                {p.margin_percent !== null && (
                  <span className="ml-0.5 text-[9px] font-medium text-emerald-600">{p.margin_percent}%</span>
                )}
              </div>
            </div>
          ))}
          {extra > 0 && <p className="pt-0.5 text-[10px] text-muted-foreground">+{extra} more product{extra === 1 ? "" : "s"}</p>}
        </div>
      )}
    </div>
  );
}

function DefaultGenieProposalCard({
  proposal,
}: {
  proposal: Exclude<
    GenieProposal,
    | { kind: "product_brand_category_update" }
    | { kind: "lightspeed_category_create" }
    | { kind: "gmail_email_action" }
    | { kind: "lightspeed_purchase_order_create" }
  >;
}) {
  const [status, setStatus] = React.useState<"idle" | "applying" | "applied" | "error">("idle");
  const [resultMsg, setResultMsg] = React.useState("");

  const apply = async () => {
    setStatus("applying");
    setResultMsg("");
    try {
      const res = await fetch("/api/genie/agent/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setStatus("error");
        setResultMsg(data?.error || "Could not apply the change. Please try again.");
        return;
      }
      setStatus("applied");
      setResultMsg((data as ApplyResult).message);
    } catch {
      setStatus("error");
      setResultMsg("Connection error. Please try again.");
    }
  };

  const meta =
    proposal.kind === "carousel_layout"
      ? { Icon: LayoutGrid, title: "Carousel layout", cta: "Apply layout" }
      : proposal.kind === "carousel_create"
        ? { Icon: FolderPlus, title: "New carousel", cta: `Create "${proposal.name}"` }
        : proposal.kind === "carousel_rename"
          ? { Icon: Pencil, title: "Rename carousel", cta: "Apply rename" }
          : proposal.kind === "discount_apply"
            ? { Icon: Tag, title: "Apply discount", cta: `Apply ${Math.round(proposal.discount_percent)}% discount` }
            : proposal.kind === "price_update"
              ? { Icon: DollarSign, title: "Price update", cta: `Update ${proposal.product_ids.length} price${proposal.product_ids.length === 1 ? "" : "s"}` }
              : { Icon: Tag, title: "Remove discount", cta: "Remove discount" };
  const { Icon } = meta;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card size="sm" className="max-w-3xl gap-0 overflow-hidden rounded-3xl bg-white py-0 ring-1 ring-gray-200">
        <CardHeader className="grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-gray-200 px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl border border-gray-200 bg-white text-foreground">
            <Icon className="h-3.5 w-3.5" />
          </div>
          <CardTitle className="text-xs">{meta.title}</CardTitle>
          <Badge variant="secondary" className="rounded-md bg-gray-100 text-foreground">Preview</Badge>
        </CardHeader>

        <CardContent className="space-y-2.5 px-4 py-3">
          {proposal.summary ? <p className="text-xs leading-snug text-muted-foreground">{proposal.summary}</p> : null}

          {proposal.kind === "carousel_layout" && <CarouselDiff proposal={proposal} />}
          {proposal.kind === "carousel_create" && <CarouselCreateDiff proposal={proposal} />}
          {proposal.kind === "carousel_rename" && <CarouselRenameDiff proposal={proposal} />}
          {proposal.kind === "discount_apply" && <DiscountApplyDiff proposal={proposal} />}
          {proposal.kind === "discount_remove" && <DiscountRemoveDiff proposal={proposal} />}
          {proposal.kind === "price_update" && <PriceUpdateDiff proposal={proposal} />}

          {status === "applied" ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              {resultMsg || "Done."}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Button onClick={apply} disabled={status === "applying"} className="w-full rounded-xl">
                {status === "applying" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Applying…
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    {meta.cta}
                  </>
                )}
              </Button>
              {status === "error" && (
                <div className="flex items-center gap-1.5 px-1 text-[11px] text-destructive">
                  <AlertCircle className="h-3 w-3 flex-shrink-0" />
                  {resultMsg}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function GenieProposalCard({ proposal }: { proposal: GenieProposal }) {
  if (proposal.kind === "gmail_email_action") {
    return <GmailEmailActionCard proposal={proposal} />;
  }
  if (proposal.kind === "lightspeed_purchase_order_create") {
    return <LightspeedPurchaseOrderCard proposal={proposal} />;
  }
  if (proposal.kind === "product_brand_category_update") {
    return <LightspeedProductEditCard proposal={proposal} />;
  }
  if (proposal.kind === "lightspeed_category_create") {
    return <LightspeedCategoryCreateCard proposal={proposal} />;
  }
  return <DefaultGenieProposalCard proposal={proposal} />;
}
