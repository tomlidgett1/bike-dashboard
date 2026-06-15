"use client";

import * as React from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice, type Candidate } from "./types";

type EditItem = {
  product_id: string;
  title: string;
  price: number | null;
  qoh: number | null;
  image_url: string | null;
  values: string[]; // by option index
  removed: boolean;
};

export function VariantCandidateEditor({
  candidate,
  open,
  onOpenChange,
  onSaved,
}: {
  candidate: Candidate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [masterTitle, setMasterTitle] = React.useState(candidate.proposed_master_title);
  const [options, setOptions] = React.useState<string[]>(candidate.option_types.map((o) => o.name));
  const [items, setItems] = React.useState<EditItem[]>(() =>
    candidate.items.map((it) => ({
      product_id: it.product_id,
      title: it.title,
      price: it.price,
      qoh: it.qoh,
      image_url: it.image_url,
      values: candidate.option_types.map((o) => it.variant_values[o.name] ?? ""),
      removed: false,
    })),
  );
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<{ product_id: string; title: string; price: number | null; qoh: number | null; image_url: string | null }[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const setItemValue = (itemIdx: number, optionIdx: number, value: string) => {
    setItems((prev) => prev.map((it, i) => (i === itemIdx ? { ...it, values: it.values.map((v, j) => (j === optionIdx ? value : v)) } : it)));
  };
  const setOptionName = (idx: number, name: string) => setOptions((prev) => prev.map((o, i) => (i === idx ? name : o)));
  const toggleRemoved = (idx: number) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, removed: !it.removed } : it)));

  React.useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const exclude = items.map((i) => i.product_id).join(",");
        const res = await fetch(`/api/optimize/variants/product-search?q=${encodeURIComponent(query)}&exclude=${encodeURIComponent(exclude)}`);
        const data = await res.json();
        if (active) setResults(data.products ?? []);
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, items]);

  const addProduct = (p: { product_id: string; title: string; price: number | null; qoh: number | null; image_url: string | null }) => {
    setItems((prev) => [...prev, { ...p, values: options.map(() => ""), removed: false }]);
    setQuery("");
    setResults([]);
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const cleanOptions = options.map((name) => ({ name: name.trim() })).filter((o) => o.name);
      const payloadItems = items
        .filter((it) => !it.removed)
        .map((it) => {
          const variant_values: Record<string, string> = {};
          cleanOptions.forEach((opt, i) => {
            const v = (it.values[i] ?? "").trim();
            if (v) variant_values[opt.name] = v;
          });
          return { product_id: it.product_id, variant_values };
        });

      if (payloadItems.length < 2) throw new Error("Keep at least two products in the group.");

      const res = await fetch(`/api/optimize/variants/candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposed_master_title: masterTitle.trim(), option_types: cleanOptions, items: payloadItems }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save changes");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit variant group</DialogTitle>
          <DialogDescription>Adjust the master product, the option names, and which products belong.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="master-title">Master product name</Label>
          <Input id="master-title" value={masterTitle} onChange={(e) => setMasterTitle(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>Option names</Label>
          <div className="flex flex-wrap gap-2">
            {options.map((name, i) => (
              <Input key={i} value={name} onChange={(e) => setOptionName(i, e.target.value)} className="w-40" placeholder="e.g. Size" />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Products & their option values</Label>
          <div className="space-y-2">
            {items.map((it, itemIdx) => (
              <div
                key={it.product_id}
                className={`flex flex-wrap items-center gap-2 rounded-md border p-2 ${it.removed ? "border-rose-200 bg-rose-50/50 opacity-60" : "border-border/60"}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{it.title}</p>
                  <p className="text-xs text-muted-foreground">{formatPrice(it.price)} · {it.qoh ?? 0} in stock</p>
                </div>
                {options.map((opt, optionIdx) => (
                  <Input
                    key={optionIdx}
                    value={it.values[optionIdx] ?? ""}
                    onChange={(e) => setItemValue(itemIdx, optionIdx, e.target.value)}
                    placeholder={opt || "value"}
                    disabled={it.removed}
                    className="w-28"
                  />
                ))}
                <Button type="button" size="icon" variant="ghost" onClick={() => toggleRemoved(itemIdx)} title={it.removed ? "Keep" : "Remove"}>
                  {it.removed ? <X className="size-4" /> : <Trash2 className="size-4" />}
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="add-product">Add a product</Label>
          <Input id="add-product" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your products by name…" />
          {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
          {results.length > 0 && (
            <div className="rounded-md border border-border/60">
              {results.map((p) => (
                <button
                  key={p.product_id}
                  type="button"
                  onClick={() => addProduct(p)}
                  className="flex w-full items-center justify-between gap-2 border-b border-border/40 px-3 py-2 text-left text-sm last:border-0 hover:bg-gray-50"
                >
                  <span className="truncate">{p.title}</span>
                  <Plus className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
