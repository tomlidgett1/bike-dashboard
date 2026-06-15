"use client";

import * as React from "react";
import { AlertTriangle, ArrowRight, Check, Loader2, Package, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type StatusTone } from "@/components/dashboard";
import { cn } from "@/lib/utils";
import { VariantCandidateEditor } from "./variant-candidate-editor";
import { VariantApplyDialog } from "./variant-apply-dialog";
import {
  formatPrice,
  optionValueMap,
  WARNING_LABELS,
  type Candidate,
  type CandidateItem,
  type VariantGroupSummary,
} from "./types";

const CONFIDENCE_TONE: Record<Candidate["confidence"], StatusTone> = {
  high: "success",
  medium: "warning",
  low: "neutral",
};

// Thumbnails are shown to the human reviewer only — product images are never
// sent to the AI model.
function Thumb({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return (
      <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-gray-100">
        <Package className="size-5 text-gray-400" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className="size-12 shrink-0 rounded-md object-cover" />;
}

// Show every structured detail we have for a product — the reviewer benefits
// from seeing the colour/size the cleaned Yellow Jersey title may have dropped.
function ItemDetail({ item }: { item: CandidateItem }) {
  const chips: { label: string; value: string }[] = [];
  if (item.color) chips.push({ label: "Colour", value: item.color + (item.color_secondary ? ` / ${item.color_secondary}` : "") });
  if (item.size) chips.push({ label: "Size", value: item.size });
  if (item.frame_size) chips.push({ label: "Frame", value: item.frame_size });
  if (item.wheel_size) chips.push({ label: "Wheel", value: item.wheel_size });
  const showLs = !!item.lightspeed_description && item.lightspeed_description.toLowerCase() !== item.title.toLowerCase();
  if (chips.length === 0 && !showLs) return null;

  return (
    <div className="mt-1 space-y-1">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chips.map((c) => (
            <span key={c.label} className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
              <span className="text-gray-400">{c.label}</span>
              {c.value}
            </span>
          ))}
        </div>
      )}
      {showLs && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          <span className="text-gray-400">Lightspeed:</span> {item.lightspeed_description}
        </p>
      )}
    </div>
  );
}

function statusBadge(candidate: Candidate, group?: VariantGroupSummary): { label: string; tone: StatusTone } | null {
  switch (candidate.status) {
    case "approved":
      return { label: "Approved", tone: "info" };
    case "rejected":
      return { label: "Rejected", tone: "neutral" };
    case "applied_local":
      return group?.lightspeed_status === "failed"
        ? { label: "Lightspeed sync failed", tone: "danger" }
        : { label: "Created · one listing", tone: "success" };
    case "applied_lightspeed":
      return { label: "Created + Lightspeed", tone: "success" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    default:
      return null;
  }
}

export function VariantCandidateCard({
  candidate,
  group,
  onChanged,
}: {
  candidate: Candidate;
  group?: VariantGroupSummary;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const values = optionValueMap(candidate);
  const applied = candidate.status === "applied_local" || candidate.status === "applied_lightspeed";
  const badge = statusBadge(candidate, group);

  async function act(path: string, body?: unknown) {
    setBusy(path);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cn("rounded-lg border bg-white p-5", applied ? "border-emerald-200" : "border-border/70")}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge tone={CONFIDENCE_TONE[candidate.confidence]} label={`${candidate.confidence} confidence`} />
          {candidate.brand && <span className="text-xs text-muted-foreground">{candidate.brand}</span>}
        </div>
        {badge && <StatusBadge tone={badge.tone} label={badge.label} />}
      </div>

      <p className="mt-3 text-sm text-foreground">
        Yellow Jersey thinks these <span className="font-semibold">{candidate.items.length}</span> products are variants of the same product.
      </p>
      {candidate.explanation && <p className="mt-1 text-sm text-muted-foreground">{candidate.explanation}</p>}

      {/* Warnings */}
      {candidate.warnings.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {candidate.warnings.map((w) => (
            <Badge key={w} variant="outline" className="gap-1 border-amber-300 bg-amber-50 font-normal text-amber-700">
              <AlertTriangle className="size-3" />
              {WARNING_LABELS[w] ?? w}
            </Badge>
          ))}
        </div>
      )}

      {/* Current vs Proposed */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-border/60 bg-gray-50/60 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Now ({candidate.items.length} listings)</p>
          <ul className="space-y-2">
            {candidate.items.map((item) => (
              <li key={item.product_id} className="flex items-start gap-2">
                <Thumb url={item.image_url} alt={item.title} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatPrice(item.price)} · {item.qoh ?? 0} in stock
                  </p>
                  <ItemDetail item={item} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-md border border-foreground/15 bg-white p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Proposed (1 master product)</p>
          <div className="flex items-center gap-2">
            <Thumb url={candidate.items[0]?.image_url ?? null} alt={candidate.proposed_master_title} />
            <p className="text-sm font-semibold text-foreground">{candidate.proposed_master_title}</p>
          </div>
          <div className="mt-3 space-y-2">
            {candidate.option_types.map((option) => (
              <div key={option.name} className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">{option.name}:</span>
                {(values[option.name] ?? []).map((v) => (
                  <Badge key={v} variant="outline" className="font-normal">
                    {v}
                  </Badge>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      {applied && group?.lightspeed_status === "failed" && group.lightspeed_error && (
        <p className="mt-3 text-sm text-rose-600">Lightspeed: {group.lightspeed_error}</p>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(candidate.status === "pending" || candidate.status === "approved") && (
          <>
            <Button size="sm" onClick={() => setApplying(true)} disabled={!!busy}>
              {candidate.status === "approved" ? "Apply" : "Approve & apply"}
              <ArrowRight className="size-4" />
            </Button>
            {candidate.status === "pending" && (
              <Button size="sm" variant="outline" onClick={() => act(`/api/optimize/variants/candidates/${candidate.id}/approve`)} disabled={!!busy}>
                {busy?.includes("approve") ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Approve
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={!!busy}>
              <Pencil className="size-4" />
              Edit
            </Button>
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => act(`/api/optimize/variants/candidates/${candidate.id}/reject`)} disabled={!!busy}>
              <X className="size-4" />
              Reject
            </Button>
          </>
        )}

        {candidate.status === "rejected" && (
          <Button size="sm" variant="outline" onClick={() => act(`/api/optimize/variants/candidates/${candidate.id}/approve`)} disabled={!!busy}>
            Move back to review
          </Button>
        )}

        {candidate.status === "applied_local" && group && group.lightspeed_status !== "synced" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => act(`/api/optimize/variants/groups/${group.id}/sync-lightspeed`)}
            disabled={!!busy}
          >
            {busy?.includes("sync-lightspeed") ? <Loader2 className="size-4 animate-spin" /> : null}
            {group.lightspeed_status === "failed" ? "Retry Lightspeed sync" : "Also update Lightspeed"}
          </Button>
        )}
      </div>

      {editing && (
        <VariantCandidateEditor
          candidate={candidate}
          open={editing}
          onOpenChange={setEditing}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
      {applying && (
        <VariantApplyDialog
          candidate={candidate}
          open={applying}
          onOpenChange={setApplying}
          onApplied={() => {
            setApplying(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
