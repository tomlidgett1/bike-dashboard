"use client";

import * as React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  Package,
  X,
  RotateCcw,
  Zap,
  Type,
  Pencil,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TitleProduct {
  id: string;
  description: string;         // raw Lightspeed name — e.g. "WAHOO ELEMNT ROAM BIKE COMPUTER"
  display_name?: string | null; // cleaned ecommerce title shown on the marketplace
  brand?: string | null;
  model?: string | null;
  marketplace_category?: string | null;
  price: number;
  qoh: number;
  primary_image_url: string | null;
  resolved_image_url: string | null;
  is_active: boolean;
}

type GenStatus = 'idle' | 'generating' | 'done' | 'error';

interface RowState {
  status: GenStatus;
  generatedTitle: string | null;
  error: string | null;
  editing: boolean;
  editValue: string;
  saving: boolean;
}

const defaultRow = (): RowState => ({
  status: 'idle',
  generatedTitle: null,
  error: null,
  editing: false,
  editValue: '',
  saving: false,
});

export function StoreProductTitlesManager() {
  const [products, setProducts] = React.useState<TitleProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState<'all' | 'needs' | 'has'>('all');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isApproving, setIsApproving] = React.useState(false);
  const [rowStates, setRowStates] = React.useState<Record<string, RowState>>({});
  const abortRef = React.useRef<AbortController | null>(null);

  const getRow = (id: string) => rowStates[id] ?? defaultRow();
  const setRow = (id: string, patch: Partial<RowState>) =>
    setRowStates(prev => ({ ...prev, [id]: { ...getRow(id), ...patch } }));

  const fetchProducts = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/products?pageSize=500&status=active&stock=in-stock');
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products ?? []);
      }
    } catch (err) {
      console.error('Failed to fetch products:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const stats = React.useMemo(() => {
    const total = products.length;
    const cleaned = products.filter(p => !!p.display_name).length;
    const needsCleaning = total - cleaned;
    return { total, cleaned, needsCleaning };
  }, [products]);

  const filtered = React.useMemo(() => {
    let list = products;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.description.toLowerCase().includes(q) ||
        (p.display_name || '').toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q) ||
        (p.marketplace_category || '').toLowerCase().includes(q)
      );
    }
    if (filter === 'needs') list = list.filter(p => !p.display_name);
    if (filter === 'has') list = list.filter(p => !!p.display_name);
    return list;
  }, [products, search, filter]);

  const needsCleaningIds = React.useMemo(
    () => products.filter(p => !p.display_name).map(p => p.id),
    [products]
  );

  const toggleSelect = (id: string) => {
    if (isGenerating) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Manual edit ──────────────────────────────────────────────────────────
  const startEdit = (product: TitleProduct) => {
    const rs = getRow(product.id);
    // Pre-fill with whatever is currently live on the marketplace
    setRow(product.id, {
      editing: true,
      editValue: rs.generatedTitle || product.display_name || product.description || '',
    });
  };

  const cancelEdit = (id: string) => setRow(id, { editing: false, editValue: '' });

  const saveTitle = async (product: TitleProduct) => {
    const rs = getRow(product.id);
    const value = rs.editValue.trim();
    if (!value) return;
    setRow(product.id, { saving: true });
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: value }),
      });
      if (!res.ok) throw new Error('Save failed');
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, display_name: value } : p));
      setRow(product.id, { editing: false, editValue: '', saving: false, generatedTitle: null, status: 'done' });
    } catch {
      setRow(product.id, { saving: false });
    }
  };

  // ── AI generation (streaming SSE) ────────────────────────────────────────
  const generateTitles = async (ids: string[]) => {
    if (!ids.length || isGenerating) return;
    setIsGenerating(true);
    setSelected(new Set());
    abortRef.current = new AbortController();

    setRowStates(prev => {
      const next = { ...prev };
      for (const id of ids) {
        next[id] = { ...defaultRow(), status: 'generating' };
      }
      return next;
    });

    try {
      const res = await fetch('/api/products/generate-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: ids }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error('Failed to start generation');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            handleStreamEvent(event);
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') console.error('Generation error:', err);
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
      await fetchProducts();
    }
  };

  const handleStreamEvent = (event: Record<string, unknown>) => {
    const id = event.productId as string;
    if (!id) return;

    if (event.event === 'product_complete') {
      const title = event.title as string | null;
      setRowStates(prev => ({
        ...prev,
        [id]: {
          ...defaultRow(),
          status: event.success ? 'done' : 'error',
          generatedTitle: title,
          error: event.error as string | null,
        },
      }));
      if (event.success && title) {
        setProducts(prev => prev.map(p => p.id === id ? { ...p, display_name: title } : p));
      }
    }
  };

  const stopGeneration = () => { abortRef.current?.abort(); };

  // ── Approve all uncleaned ────────────────────────────────────────────────
  // Locks in the current live title (description) as display_name for every
  // product that doesn't yet have a custom title.
  const approveAll = async () => {
    if (!needsCleaningIds.length || isApproving || isGenerating) return;
    setIsApproving(true);
    try {
      const res = await fetch('/api/products/approve-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: needsCleaningIds }),
      });
      if (res.ok) await fetchProducts();
    } catch (err) {
      console.error('Approve all failed:', err);
    } finally {
      setIsApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="py-16 text-center">
        <Package className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No active products found</p>
        <p className="text-xs text-muted-foreground mt-1">Sync your inventory to get started</p>
      </div>
    );
  }

  const coveragePct = stats.total > 0 ? Math.round((stats.cleaned / stats.total) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border border-border bg-muted p-3 text-center">
          <p className="text-xl font-bold text-foreground">{stats.total}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total Products</p>
        </div>
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-center">
          <p className="text-xl font-bold text-emerald-700">{stats.cleaned}</p>
          <p className="text-xs text-emerald-600 mt-0.5">Titles Cleaned</p>
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-center">
          <p className="text-xl font-bold text-amber-700">{stats.needsCleaning}</p>
          <p className="text-xs text-amber-600 mt-0.5">Needs Cleaning</p>
        </div>
      </div>

      {/* Progress bar */}
      {stats.total > 0 && (
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-muted-foreground">Title coverage</span>
            <span className="text-xs font-medium text-foreground">{coveragePct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-emerald-500"
              initial={{ width: 0 }}
              animate={{ width: `${coveragePct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        {needsCleaningIds.length > 0 && !isGenerating && !isApproving && (
          <Button
            onClick={() => generateTitles(needsCleaningIds)}
            size="sm"
            className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground h-8 text-xs whitespace-nowrap"
          >
            <Zap className="h-3 w-3" />
            Clean All ({needsCleaningIds.length})
          </Button>
        )}
        {needsCleaningIds.length > 0 && !isGenerating && (
          <Button
            onClick={approveAll}
            disabled={isApproving}
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 text-xs whitespace-nowrap"
          >
            {isApproving
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <CheckCircle2 className="h-3 w-3" />}
            Approve All ({needsCleaningIds.length})
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-0.5 p-1 bg-muted rounded-md w-fit text-xs">
        {(['all', 'needs', 'has'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-2.5 py-1 rounded font-medium transition-all",
              filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f === 'all' && `All (${stats.total})`}
            {f === 'needs' && `Needs cleaning (${stats.needsCleaning})`}
            {f === 'has' && `Cleaned (${stats.cleaned})`}
          </button>
        ))}
      </div>

      {/* Selected action banner */}
      <AnimatePresence>
        {selected.size > 0 && !isGenerating && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 px-3 py-2 bg-foreground text-background rounded-md">
              <span className="text-xs font-medium">{selected.size} selected</span>
              <Button
                size="sm"
                onClick={() => generateTitles(Array.from(selected))}
                className="h-6 gap-1 bg-background text-foreground hover:bg-background/90 text-xs px-2"
              >
                <Sparkles className="h-3 w-3" />
                Clean selected
              </Button>
              <button
                onClick={() => setSelected(new Set())}
                className="ml-auto text-background/60 hover:text-background transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generating banner */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-center gap-2 text-xs text-blue-700">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating ecommerce titles with AI…
              </div>
              <button
                onClick={stopGeneration}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                Stop
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Product list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Package className="h-7 w-7 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No products match your filter</p>
          </div>
        ) : (
          filtered.map(product => {
            const rs = getRow(product.id);
            const imageUrl = product.resolved_image_url || product.primary_image_url;
            // liveTitle = exactly what buyers see on the marketplace right now
            const liveTitle = product.display_name || product.description;
            const hasCustomTitle = !!product.display_name;
            // Only show the raw description as a reference when it differs from liveTitle
            const showRawRef = hasCustomTitle && product.description && product.description !== product.display_name;
            const isActive = rs.status === 'generating';

            return (
              <motion.div
                key={product.id}
                layout
                className={cn(
                  "rounded-md border transition-colors",
                  isActive ? "border-blue-200 bg-blue-50/30" :
                  rs.status === 'done' && !rs.editing ? "border-emerald-200 bg-emerald-50/40" :
                  rs.status === 'error' ? "border-red-200 bg-red-50/30" :
                  selected.has(product.id) ? "border-foreground/30 bg-accent" :
                  "border-border bg-card hover:border-foreground/20"
                )}
              >
                <div className="flex items-start gap-3 px-3 py-2.5">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selected.has(product.id)}
                    onChange={() => toggleSelect(product.id)}
                    disabled={isGenerating}
                    className="h-3.5 w-3.5 mt-1 rounded border-border text-foreground cursor-pointer flex-shrink-0"
                  />

                  {/* Image */}
                  <div className="h-9 w-9 rounded bg-muted flex-shrink-0 overflow-hidden mt-0.5">
                    {imageUrl ? (
                      <Image src={imageUrl} alt={liveTitle} width={36} height={36} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Titles + edit */}
                  <div className="flex-1 min-w-0">
                    {/* Inline editor */}
                    {rs.editing ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={rs.editValue}
                          onChange={e => setRow(product.id, { editValue: e.target.value })}
                          className="h-7 text-sm flex-1"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveTitle(product);
                            if (e.key === 'Escape') cancelEdit(product.id);
                          }}
                        />
                        <button
                          onClick={() => saveTitle(product)}
                          disabled={rs.saving || !rs.editValue.trim()}
                          className="flex h-7 w-7 items-center justify-center rounded bg-foreground text-background hover:bg-foreground/85 disabled:opacity-40 transition-colors flex-shrink-0"
                        >
                          {rs.saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        </button>
                        <button
                          onClick={() => cancelEdit(product.id)}
                          className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent text-muted-foreground transition-colors flex-shrink-0"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : isActive ? (
                      <div className="flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin flex-shrink-0" />
                        <span className="text-xs text-blue-600 italic">Generating…</span>
                      </div>
                    ) : (
                      /* Live title — exactly what buyers see */
                      <div className="flex items-center gap-1.5 group">
                        <p className={cn(
                          "text-sm truncate leading-tight",
                          hasCustomTitle ? "font-medium text-foreground" : "text-muted-foreground"
                        )}>
                          {liveTitle}
                        </p>
                        <button
                          onClick={() => startEdit(product)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground flex-shrink-0"
                          title="Edit title"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    )}

                    {/* Raw description reference — only shown when display_name overrides it */}
                    {showRawRef && !rs.editing && (
                      <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                        {product.description}
                      </p>
                    )}

                    {rs.status === 'error' && (
                      <p className="text-xs text-red-500 mt-0.5 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {rs.error || 'Generation failed'}
                      </p>
                    )}
                  </div>

                  {/* Status badge + actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                    {!isActive && (
                      <>
                        <Badge className={cn(
                          "text-xs border-0 gap-1 py-0 h-5",
                          hasCustomTitle ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                        )}>
                          {hasCustomTitle
                            ? <CheckCircle2 className="h-2.5 w-2.5" />
                            : <Type className="h-2.5 w-2.5" />}
                          {hasCustomTitle ? 'Cleaned' : 'Raw'}
                        </Badge>
                        {!isGenerating && (
                          <button
                            onClick={() => generateTitles([product.id])}
                            title={hasCustomTitle ? 'Regenerate title' : 'Generate clean title'}
                            className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {hasCustomTitle ? <RotateCcw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        {!isGenerating && (
                          <button
                            onClick={() => startEdit(product)}
                            title="Edit manually"
                            className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
