"use client";

import * as React from "react";
import { Check, Loader2, Package, Plus, Star, Trash2 } from "@/components/layout/app-sidebar/dashboard-icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatPrice } from "./types";

type Member = {
  product_id: string;
  is_master: boolean;
  value_assignments: Record<string, string>;
  title: string;
  image_url: string | null;
  price: number | null;
  qoh: number | null;
};

type SearchResult = { product_id: string; title: string; price: number | null; qoh: number | null; image_url: string | null };

export function VariantGroupManager({
  groupId,
  open,
  onOpenChange,
  onChanged,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [members, setMembers] = React.useState<Member[]>([]);
  const [visibility, setVisibility] = React.useState<string>("master_only");
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);

  const load = React.useCallback(async () => {
    const res = await fetch(`/api/optimize/variants/groups/${groupId}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMembers(data.members ?? []);
      setVisibility(data.group?.visibility_mode ?? "master_only");
    } else {
      setError(data.error || "Could not load this group");
    }
    setLoading(false);
  }, [groupId]);

  React.useEffect(() => {
    if (open) {
      setLoading(true);
      load();
    }
  }, [open, load]);

  React.useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    const t = setTimeout(async () => {
      const exclude = members.map((m) => m.product_id).join(",");
      const res = await fetch(`/api/optimize/variants/product-search?q=${encodeURIComponent(query)}&exclude=${encodeURIComponent(exclude)}`);
      const data = await res.json();
      if (active) setResults(data.products ?? []);
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, members]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/optimize/variants/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Update failed");
      setMembers(data.members ?? []);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  const masterOnly = visibility === "master_only";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage variant group</DialogTitle>
          <DialogDescription>
            {masterOnly ? "Pick the photo that represents the listing, and add or remove variants." : "Add or remove variants in this group."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {members.map((m) => (
                <div
                  key={m.product_id}
                  className={cn("flex items-center gap-3 rounded-md border p-2", m.is_master ? "border-foreground/40 bg-gray-50" : "border-border/60")}
                >
                  {m.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.image_url} alt={m.title} className="size-12 shrink-0 rounded object-cover" />
                  ) : (
                    <div className="flex size-12 shrink-0 items-center justify-center rounded bg-gray-100">
                      <Package className="size-5 text-gray-400" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {Object.values(m.value_assignments).join(" · ") || "—"} · {formatPrice(m.price)} · {m.qoh ?? 0} in stock
                    </p>
                  </div>
                  {masterOnly && (
                    <button
                      type="button"
                      disabled={busy || m.is_master}
                      onClick={() => patch({ setMasterProductId: m.product_id })}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
                        m.is_master ? "border-foreground bg-foreground text-background" : "border-border/70 text-foreground hover:border-foreground/40",
                      )}
                      title={m.is_master ? "This is the listing photo" : "Use this photo for the listing"}
                    >
                      {m.is_master ? <Check className="size-3" /> : <Star className="size-3" />}
                      {m.is_master ? "Hero" : "Set hero"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy || members.length <= 2}
                    onClick={() => patch({ removeProductIds: [m.product_id] })}
                    className="text-muted-foreground hover:text-rose-600 disabled:opacity-40"
                    title={members.length <= 2 ? "A group needs at least two products" : "Remove from group"}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="manage-add">Add a missing variant</Label>
              <Input id="manage-add" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your products by name…" />
              {results.length > 0 && (
                <div className="rounded-md border border-border/60">
                  {results.map((p) => (
                    <button
                      key={p.product_id}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setQuery("");
                        setResults([]);
                        patch({ addProductIds: [p.product_id] });
                      }}
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
            <p className="text-xs text-muted-foreground">Changes apply to your storefront within about a minute.</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
