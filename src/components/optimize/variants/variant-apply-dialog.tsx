"use client";

import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { optionValueMap, type Candidate, type SyncTarget, type VisibilityMode } from "./types";

function Choice({
  id,
  value,
  current,
  title,
  description,
}: {
  id: string;
  value: string;
  current: string;
  title: string;
  description: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
        current === value ? "border-foreground/40 bg-gray-50" : "border-border/60 hover:border-foreground/20",
      )}
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" />
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </label>
  );
}

export function VariantApplyDialog({
  candidate,
  open,
  onOpenChange,
  onApplied,
}: {
  candidate: Candidate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}) {
  const [visibility, setVisibility] = React.useState<VisibilityMode>("master_only");
  const [target, setTarget] = React.useState<SyncTarget>("local");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const values = optionValueMap(candidate);

  // Default the hero/master to the best-stocked variant.
  const defaultMaster = React.useMemo(() => {
    let best = candidate.items[0]?.product_id ?? null;
    let bestQoh = -Infinity;
    for (const it of candidate.items) {
      const qoh = typeof it.qoh === "number" ? it.qoh : -1;
      if (qoh > bestQoh) {
        bestQoh = qoh;
        best = it.product_id;
      }
    }
    return best;
  }, [candidate.items]);
  const [masterProductId, setMasterProductId] = React.useState<string | null>(defaultMaster);

  async function apply() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/optimize/variants/candidates/${candidate.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibilityMode: visibility, syncTarget: target, masterProductId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not apply this group");
      // Surface a Lightspeed failure but keep the local group (still a success).
      if (target === "lightspeed" && data.lightspeed && data.lightspeed.status === "failed") {
        setError(`Created in Yellow Jersey, but Lightspeed sync failed: ${data.lightspeed.error}. You can retry from the card.`);
        setTimeout(onApplied, 1800);
        return;
      }
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply this group");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply “{candidate.proposed_master_title}”</DialogTitle>
          <DialogDescription>Review what will change before applying.</DialogDescription>
        </DialogHeader>

        {/* Master preview */}
        <div className="rounded-md border border-border/60 bg-gray-50/60 p-3 text-sm">
          <p className="font-semibold text-foreground">{candidate.proposed_master_title}</p>
          <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {candidate.option_types.map((o) => (
              <p key={o.name}>
                {o.name}: {(values[o.name] ?? []).join(", ")}
              </p>
            ))}
            <p>{candidate.items.length} products will be combined.</p>
          </div>
        </div>

        {/* Visibility */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">How should it appear in the marketplace?</p>
          <RadioGroup value={visibility} onValueChange={(v) => setVisibility(v as VisibilityMode)} className="gap-2">
            <Choice id="vis-master" value="master_only" current={visibility} title="Show as one listing" description="Only the master product appears in search and category grids. Shoppers pick the size/colour on the product page." />
            <Choice id="vis-both" value="individual_and_master" current={visibility} title="Keep individual listings too" description="Each product still appears separately, and the variant options also show on every product page." />
          </RadioGroup>
        </div>

        {/* Hero / master image — only relevant when showing one listing */}
        {visibility === "master_only" && candidate.items.length > 1 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Which photo represents the listing?</p>
            <p className="text-xs text-muted-foreground">This variant&apos;s image and details become the product card.</p>
            <div className="flex flex-wrap gap-2">
              {candidate.items.map((it) => {
                const selected = masterProductId === it.product_id;
                return (
                  <button
                    key={it.product_id}
                    type="button"
                    onClick={() => setMasterProductId(it.product_id)}
                    className={cn(
                      "relative w-20 overflow-hidden rounded-md border-2 text-left transition-colors",
                      selected ? "border-foreground" : "border-transparent hover:border-foreground/30",
                    )}
                    title={it.title}
                  >
                    {it.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image_url} alt={it.title} className="h-20 w-20 object-cover" />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center bg-gray-100 text-[10px] text-gray-400">No photo</div>
                    )}
                    <span className="block truncate px-1 py-0.5 text-[10px] text-muted-foreground">
                      {Object.values(it.variant_values).join(" · ") || it.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Sync target */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Where should this be created?</p>
          <RadioGroup value={target} onValueChange={(v) => setTarget(v as SyncTarget)} className="gap-2">
            <Choice id="tgt-local" value="local" current={target} title="Create in Yellow Jersey only" description="Group the products on Yellow Jersey. Your Lightspeed catalogue is not changed." />
            <Choice id="tgt-ls" value="lightspeed" current={target} title="Also update Lightspeed" description="Combine these items into a Lightspeed matrix as well. This changes your Lightspeed catalogue." />
          </RadioGroup>
        </div>

        {target === "lightspeed" && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-4" /> This updates your Lightspeed catalogue
            </p>
            <p className="mt-1 text-xs">
              These {candidate.items.length} items will be combined into a single Lightspeed matrix. Their stock and history stay intact.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {target === "lightspeed" ? "Apply & update Lightspeed" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
