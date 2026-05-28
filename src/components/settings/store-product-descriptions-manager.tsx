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
  ChevronDown,
  ChevronUp,
  X,
  RotateCcw,
  Dot,
  Globe,
  PenLine,
  Zap,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DescriptionProduct {
  id: string;
  description: string;
  display_name?: string | null;
  product_description?: string | null;
  product_specs?: string | null;
  brand?: string | null;
  model?: string | null;
  marketplace_category?: string | null;
  price: number;
  qoh: number;
  primary_image_url: string | null;
  resolved_image_url: string | null;
  is_active: boolean;
}

type GenStatus = 'idle' | 'searching' | 'writing_desc' | 'writing_specs' | 'done' | 'error';

interface GenState {
  status: GenStatus;
  description: string | null;
  specs: string | null;
  error: string | null;
}

// ── Inline bold renderer ──────────────────────────────────────────────────
function InlineText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <strong key={i} className="font-semibold text-gray-800">{part}</strong>
          : part || null
      )}
    </>
  );
}

// ── Markdown block renderer (xs text for settings panel) ─────────────────
function ContentPreview({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter(b => b.trim());
  return (
    <div className="space-y-2.5">
      {blocks.map((block, bi) => {
        const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length === 1 && /^#{1,3}\s/.test(lines[0])) {
          return (
            <h4 key={bi} className="text-xs font-semibold text-gray-800">
              <InlineText text={lines[0].replace(/^#+\s/, '')} />
            </h4>
          );
        }
        const isBullet = (l: string) => /^[•\-\*]\s/.test(l);
        const bulletLines = lines.filter(isBullet);
        const nonBulletLines = lines.filter(l => !isBullet(l));
        if (bulletLines.length > 0) {
          const rawHeader = nonBulletLines.length === 1 ? nonBulletLines[0] : null;
          const header = rawHeader?.replace(/^\*\*(.+)\*\*$/, '$1') ?? rawHeader;
          return (
            <div key={bi} className="space-y-1">
              {header && (
                <p className="text-xs font-semibold text-gray-800">
                  <InlineText text={header} />
                </p>
              )}
              <ul className="space-y-0.5">
                {bulletLines.map((line, li) => (
                  <li key={li} className="flex gap-1.5 text-xs text-gray-600 leading-relaxed">
                    <span className="text-gray-400 mt-[2px] flex-shrink-0 select-none">•</span>
                    <span><InlineText text={line.replace(/^[•\-\*]\s/, '')} /></span>
                  </li>
                ))}
              </ul>
            </div>
          );
        }
        return (
          <p key={bi} className="text-xs text-gray-600 leading-relaxed">
            <InlineText text={lines.join(' ')} />
          </p>
        );
      })}
    </div>
  );
}

// ── Status label during generation ───────────────────────────────────────
const STATUS_LABEL: Record<GenStatus, string> = {
  idle: '',
  searching: 'Searching web...',
  writing_desc: 'Writing description...',
  writing_specs: 'Writing specs...',
  done: 'Done',
  error: 'Failed',
};

const STATUS_ICON: Record<GenStatus, React.ReactNode> = {
  idle: null,
  searching: <Globe className="h-3 w-3 animate-pulse" />,
  writing_desc: <PenLine className="h-3 w-3 animate-pulse" />,
  writing_specs: <ListChecks className="h-3 w-3 animate-pulse" />,
  done: <CheckCircle2 className="h-3 w-3" />,
  error: <AlertCircle className="h-3 w-3" />,
};

type GenerateMode = 'both' | 'description' | 'specs'

const MODE_CONFIG: Record<GenerateMode, { label: string; icon: React.ReactNode; color: string }> = {
  both:        { label: 'Description & Specs', icon: <Sparkles className="h-3 w-3" />,  color: 'text-gray-700' },
  description: { label: 'Description only',   icon: <PenLine className="h-3 w-3" />,    color: 'text-emerald-700' },
  specs:       { label: 'Specs only',          icon: <ListChecks className="h-3 w-3" />, color: 'text-blue-700' },
}

// ── Main component ────────────────────────────────────────────────────────
export function StoreProductDescriptionsManager() {
  const [products, setProducts] = React.useState<DescriptionProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [mode, setMode] = React.useState<GenerateMode>('both');
  const [filter, setFilter] = React.useState<'all' | 'needs' | 'has'>('all');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [genStates, setGenStates] = React.useState<Record<string, GenState>>({});
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const abortRef = React.useRef<AbortController | null>(null);

  const fetchProducts = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/products?pageSize=500&status=active');
      if (res.ok) {
        const data = await res.json();
        setProducts((data.products ?? []).filter((p: DescriptionProduct) => p.is_active));
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
    const withBoth = products.filter(p => p.product_description && p.product_specs).length;
    const missingDesc = products.filter(p => !p.product_description).length;
    const missingSpecs = products.filter(p => !p.product_specs).length;
    const needsAny = products.filter(p => !p.product_description || !p.product_specs).length;
    return { total, withBoth, missingDesc, missingSpecs, needsAny };
  }, [products]);

  const filtered = React.useMemo(() => {
    let list = products;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        (p.display_name || p.description).toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.marketplace_category?.toLowerCase().includes(q)
      );
    }
    if (filter === 'needs') list = list.filter(p => !p.product_description || !p.product_specs);
    if (filter === 'has') list = list.filter(p => !!p.product_description && !!p.product_specs);
    return list;
  }, [products, search, filter]);

  // Products that need content based on the current mode
  const needsContentIds = React.useMemo(() => {
    return products.filter(p => {
      if (mode === 'description') return !p.product_description
      if (mode === 'specs')       return !p.product_specs
      return !p.product_description || !p.product_specs
    }).map(p => p.id)
  }, [products, mode]);

  const toggleSelect = (id: string) => {
    if (isGenerating) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const generateDescriptions = async (ids: string[], overrideMode?: GenerateMode) => {
    if (!ids.length || isGenerating) return;
    const activeMode = overrideMode ?? mode;
    setIsGenerating(true);
    setSelected(new Set());
    abortRef.current = new AbortController();

    setGenStates(prev => {
      const next = { ...prev };
      for (const id of ids) {
        next[id] = { status: 'searching', description: null, specs: null, error: null };
      }
      return next;
    });

    try {
      const res = await fetch('/api/products/generate-product-descriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: ids, mode: activeMode }),
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
            handleEvent(event);
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Generation error:', err);
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
      await fetchProducts();
    }
  };

  const handleEvent = (event: Record<string, unknown>) => {
    const id = event.productId as string;

    if (event.event === 'product_start') {
      setGenStates(prev => ({
        ...prev,
        [id]: { status: 'searching', description: null, specs: null, error: null },
      }));
    }

    if (event.event === 'product_phase') {
      const phase = event.phase as string;
      setGenStates(prev => ({
        ...prev,
        [id]: {
          ...(prev[id] ?? { description: null, specs: null, error: null }),
          status: phase === 'specs' ? 'writing_specs' : 'writing_desc',
        },
      }));
    }

    if (event.event === 'product_complete') {
      const description = event.description as string | null;
      const specs = event.specs as string | null;
      setGenStates(prev => ({
        ...prev,
        [id]: {
          status: event.success ? 'done' : 'error',
          description,
          specs,
          error: event.error as string | null,
        },
      }));
      if (event.success) {
        setExpandedIds(prev => new Set([...prev, id]));
        setProducts(prev =>
          prev.map(p => p.id === id
            ? {
                ...p,
                ...(description ? { product_description: description } : {}),
                ...(specs ? { product_specs: specs } : {}),
              }
            : p
          )
        );
      }
    }
  };

  const stopGeneration = () => { abortRef.current?.abort(); };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="py-16 text-center">
        <Package className="h-8 w-8 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-500">No active products found</p>
        <p className="text-xs text-gray-400 mt-1">Sync your inventory to get started</p>
      </div>
    );
  }

  const coveragePct = stats.total > 0
    ? Math.round((stats.withBoth / stats.total) * 100)
    : 0;

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Products</p>
        </div>
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-center">
          <p className="text-xl font-bold text-emerald-700">{stats.withBoth}</p>
          <p className="text-xs text-emerald-600 mt-0.5">Fully Generated</p>
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-center">
          <p className="text-xl font-bold text-amber-700">{stats.needsAny}</p>
          <p className="text-xs text-amber-600 mt-0.5">Needs Content</p>
        </div>
      </div>

      {/* Sub-stats for desc vs specs */}
      <div className="flex gap-4 text-xs text-gray-500">
        <span>
          <span className="font-medium text-gray-700">{stats.total - stats.missingDesc}</span> with description
        </span>
        <span className="text-gray-300">·</span>
        <span>
          <span className="font-medium text-gray-700">{stats.total - stats.missingSpecs}</span> with specs
        </span>
      </div>

      {/* Progress bar */}
      {stats.total > 0 && (
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-500">Full AI coverage</span>
            <span className="text-xs font-medium text-gray-700">{coveragePct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-emerald-500"
              initial={{ width: 0 }}
              animate={{ width: `${coveragePct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

      {/* Mode selector */}
      <div>
        <p className="text-xs text-gray-500 mb-2">Generate</p>
        <div className="flex gap-0.5 p-1 bg-gray-100 rounded-md w-fit text-xs">
          {(Object.keys(MODE_CONFIG) as GenerateMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={isGenerating}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded font-medium transition-all",
                mode === m
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700 disabled:opacity-50"
              )}
            >
              {MODE_CONFIG[m].icon}
              {MODE_CONFIG[m].label}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        {needsContentIds.length > 0 && !isGenerating && (
          <Button
            onClick={() => generateDescriptions(needsContentIds)}
            size="sm"
            className="gap-1.5 bg-gray-900 hover:bg-gray-800 text-white h-8 text-xs whitespace-nowrap"
          >
            <Zap className="h-3 w-3" />
            Generate All ({needsContentIds.length})
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-0.5 p-1 bg-gray-100 rounded-md w-fit text-xs">
        {(['all', 'needs', 'has'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-2.5 py-1 rounded font-medium transition-all",
              filter === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            {f === 'all' && `All (${stats.total})`}
            {f === 'needs' && `Needs content (${stats.needsAny})`}
            {f === 'has' && `Fully generated (${stats.withBoth})`}
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
            <div className="flex items-center gap-3 px-3 py-2 bg-gray-900 text-white rounded-md">
              <span className="text-xs font-medium">{selected.size} selected</span>
              <Button
                size="sm"
                onClick={() => generateDescriptions(Array.from(selected))}
                className="h-6 gap-1 bg-white text-gray-900 hover:bg-gray-100 text-xs px-2"
              >
                <Sparkles className="h-3 w-3" />
                Generate selected ({MODE_CONFIG[mode].label.toLowerCase()})
              </Button>
              <button
                onClick={() => setSelected(new Set())}
                className="ml-auto text-gray-400 hover:text-white transition-colors"
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
                Generating {MODE_CONFIG[mode].label.toLowerCase()} with AI...
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
            <Package className="h-7 w-7 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No products match your filter</p>
          </div>
        ) : (
          filtered.map(product => {
            const genState = genStates[product.id];
            const isActive = !!genState && genState.status !== 'idle';
            const hasDesc = !!product.product_description;
            const hasSpecs = !!product.product_specs;
            const hasBoth = hasDesc && hasSpecs;
            const name = product.display_name || product.description;
            const imageUrl = product.resolved_image_url || product.primary_image_url;
            const isExpanded = expandedIds.has(product.id);
            const previewDesc = genState?.description || product.product_description;
            const previewSpecs = genState?.specs || product.product_specs;

            return (
              <motion.div
                key={product.id}
                layout
                className={cn(
                  "rounded-md border transition-colors",
                  isActive && genState.status === 'done' ? "border-emerald-200 bg-emerald-50/40" :
                  isActive && genState.status === 'error' ? "border-red-200 bg-red-50/30" :
                  isActive ? "border-blue-200 bg-blue-50/30" :
                  selected.has(product.id) ? "border-gray-400 bg-gray-50" :
                  "border-gray-200 bg-white hover:border-gray-300"
                )}
              >
                <div className="flex items-center gap-3 px-3 py-2.5">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selected.has(product.id)}
                    onChange={() => toggleSelect(product.id)}
                    disabled={isGenerating}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900 cursor-pointer flex-shrink-0"
                  />

                  {/* Image */}
                  <div className="h-9 w-9 rounded bg-gray-100 flex-shrink-0 overflow-hidden">
                    {imageUrl ? (
                      <Image src={imageUrl} alt={name} width={36} height={36} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="h-3.5 w-3.5 text-gray-400" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate leading-tight">{name}</p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {[product.brand, product.marketplace_category].filter(Boolean).join(' · ')}
                      {product.price ? ` · $${product.price.toLocaleString('en-AU')}` : ''}
                    </p>
                  </div>

                  {/* Status */}
                  <div className="flex-shrink-0 flex items-center gap-1.5">
                    {isActive ? (
                      <span className={cn(
                        "flex items-center gap-1 text-xs",
                        genState.status === 'done' ? "text-emerald-600" :
                        genState.status === 'error' ? "text-red-600" :
                        "text-blue-600"
                      )}>
                        {STATUS_ICON[genState.status]}
                        <span className="hidden sm:inline">{STATUS_LABEL[genState.status]}</span>
                      </span>
                    ) : (
                      <>
                        {/* Description badge */}
                        <Badge className={cn(
                          "text-xs border-0 gap-1 py-0 h-5",
                          hasDesc
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-500"
                        )}>
                          {hasDesc ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Dot className="h-3 w-3 -mx-0.5" />}
                          Desc
                        </Badge>
                        {/* Specs badge */}
                        <Badge className={cn(
                          "text-xs border-0 gap-1 py-0 h-5",
                          hasSpecs
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-500"
                        )}>
                          {hasSpecs ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Dot className="h-3 w-3 -mx-0.5" />}
                          Specs
                        </Badge>
                      </>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!isGenerating && (
                      <button
                        onClick={() => generateDescriptions([product.id])}
                        title={`Generate ${MODE_CONFIG[mode].label.toLowerCase()}`}
                        className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                      >
                        {(mode === 'description' ? hasDesc : mode === 'specs' ? hasSpecs : hasBoth)
                          ? <RotateCcw className="h-3.5 w-3.5" />
                          : <Sparkles className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {(previewDesc || previewSpecs) && (
                      <button
                        onClick={() => toggleExpand(product.id)}
                        className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable preview */}
                <AnimatePresence>
                  {isExpanded && (previewDesc || previewSpecs) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mx-3 mb-3 rounded bg-gray-50 border border-gray-100 divide-y divide-gray-100">
                        {previewDesc && (
                          <div className="p-3">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Sparkles className="h-3 w-3 text-emerald-500" />
                              <span className="text-xs font-medium text-gray-600">Description</span>
                            </div>
                            <ContentPreview text={previewDesc} />
                          </div>
                        )}
                        {previewSpecs && (
                          <div className="p-3">
                            <div className="flex items-center gap-1.5 mb-2">
                              <ListChecks className="h-3 w-3 text-blue-500" />
                              <span className="text-xs font-medium text-gray-600">Specifications</span>
                            </div>
                            <ContentPreview text={previewSpecs} />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
