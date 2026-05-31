"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Send, Bike, Loader2, AlertCircle, Globe, Maximize2, Minimize2,
  Clock, Trash2, ArrowLeft, MessageSquarePlus,
  Store, Sparkles, Tag, LayoutGrid, ArrowRight, Check, CheckCircle2, Eye, EyeOff,
  FolderPlus, Pencil,
} from 'lucide-react';
import { useGenie } from '@/components/providers/genie-provider';
import { useAuth } from '@/components/providers/auth-provider';
import { useUserProfile } from '@/components/providers/profile-provider';
import AIMotionOrb from './ai-motion-orb';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import type {
  GenieProposal,
  CarouselLayoutProposal,
  CarouselCreateProposal,
  CarouselRenameProposal,
  DiscountApplyProposal,
  DiscountRemoveProposal,
  ApplyResult,
  CarouselSizeOption,
} from '@/lib/types/genie-agent';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusPhase =
  | 'planning'
  | 'thinking'
  | 'web_search'
  | 'web_search_done'
  | 'product_search'
  | 'tool'
  | 'responding';

interface StatusStep { phase: StatusPhase; text: string }
interface Citation { url: string; title: string }

interface GenieProduct {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  qoh: number;
  listing_type?: string;
  condition?: string | null;
  image: string | null;
  store_name?: string | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  currentStatus?: StatusStep;
  products?: GenieProduct[];
  sources?: Citation[];
  proposals?: GenieProposal[];
  isStreaming?: boolean;
  error?: string;
}

interface SavedConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatPrice(price: number | null | undefined): string {
  if (!price) return '';
  return `$${price.toFixed(2)}`;
}

function stripUrlsAndLinks(s: string): string {
  // Markdown links [text](url) → just text
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Bare URLs → remove entirely
    .replace(/https?:\/\/[^\s<>"')\]]+/g, '');
}

function parseMarkdown(text: string): string {
  const inline = (s: string) =>
    stripUrlsAndLinks(s)
     .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
     .replace(/\*(.+?)\*/g, '<em>$1</em>');

  const lines = text.split('\n');
  const out: string[] = [];
  let inList = false;
  let listType = 'ul';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const isUnordered = /^[•\-*]\s+/.test(trimmed);
    const isOrdered = /^\d+\.\s+/.test(trimmed);
    const isItem = isUnordered || isOrdered;

    if (isItem) {
      const newType = isOrdered ? 'ol' : 'ul';
      if (!inList) { out.push(`<${newType} class="pl-4 my-0.5 space-y-0">`); inList = true; listType = newType; }
      const content = inline(trimmed.replace(/^[•\-*]\s+/, '').replace(/^\d+\.\s+/, ''));
      out.push(`<li class="${isOrdered ? 'list-decimal' : 'list-disc'} leading-snug text-sm">${content}</li>`);
    } else {
      if (inList) { out.push(`</${listType}>`); inList = false; }
      if (trimmed === '') {
        if (i < lines.length - 1 && lines[i + 1]?.trim() !== '') out.push('<div class="h-1"></div>');
      } else if (/^###?\s/.test(trimmed)) {
        out.push(`<p class="font-semibold text-sm leading-snug mt-1">${inline(trimmed.replace(/^###?\s+/, ''))}</p>`);
      } else {
        out.push(`<p class="leading-snug text-sm">${inline(trimmed)}</p>`);
      }
    }
  }

  if (inList) out.push(`</${listType}>`);
  return out.join('');
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

function GenieLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path d="M16 2L28.7 9.5V24.5L16 32L3.3 24.5V9.5L16 2Z" fill="currentColor" fillOpacity="0.18" />
      <path d="M16 6L18.5 13.5H26L20 18L22.5 25.5L16 21L9.5 25.5L12 18L6 13.5H13.5L16 6Z" fill="currentColor" />
      <circle cx="16" cy="16" r="2.5" fill="white" fillOpacity="0.9" />
    </svg>
  );
}

// ─── Shimmer Status ───────────────────────────────────────────────────────────

const PHASE_LABELS: Partial<Record<StatusPhase, string>> = {
  planning: 'Thinking...',
  thinking: 'Thinking...',
  web_search: 'Searching the web...',
  web_search_done: 'Web research done',
  product_search: 'Searching the marketplace...',
  responding: 'Composing answer...',
};

function ShimmerStatus({ step }: { step: StatusStep }) {
  // Known phases get a friendly label; agent tool phases carry their own text.
  const label = PHASE_LABELS[step.phase] ?? step.text ?? 'Working...';
  return (
    <motion.div key={`${step.phase}:${label}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.25 }} className="flex items-center gap-2 py-1">
      <span className="relative flex h-2 w-2 flex-shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-500" />
      </span>
      <span className="relative overflow-hidden text-xs font-medium text-muted-foreground">
        {label}
        <span className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_ease-in-out_infinite]"
          style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(250,204,21,0.5) 50%, transparent 100%)' }} />
      </span>
    </motion.div>
  );
}

// ─── Source Pill ──────────────────────────────────────────────────────────────

function SourcePill({ citation }: { citation: Citation }) {
  let displayName = citation.title;
  try {
    const hostname = new URL(citation.url).hostname.replace(/^www\./, '');
    if (!citation.title || citation.title === citation.url) displayName = hostname;
    else displayName = citation.title.length > 40 ? hostname : citation.title;
  } catch {}
  return (
    <a href={citation.url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:border-yellow-400 hover:text-foreground transition-all whitespace-nowrap max-w-[160px]">
      <Globe className="h-2.5 w-2.5 flex-shrink-0 text-yellow-500" />
      <span className="truncate">{displayName}</span>
    </a>
  );
}

// ─── Product Card ──────────────────────────────────────────────────────────────

function ProductCard({ product }: { product: GenieProduct }) {
  return (
    <motion.a href={`/marketplace/product/${product.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="flex-shrink-0 w-[152px] rounded-xl border border-border bg-background overflow-hidden shadow-sm hover:shadow-md hover:border-yellow-400/50 transition-all cursor-pointer">
      <div className="relative h-[96px] bg-muted flex items-center justify-center overflow-hidden">
        {product.image
          ? <Image src={product.image} alt={product.name} fill className="object-cover" sizes="152px" />
          : <Bike className="h-7 w-7 text-muted-foreground/30" />}
        <div className="absolute top-1.5 right-1.5">
          <span className="rounded-full bg-green-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">In Stock</span>
        </div>
      </div>
      <div className="p-2.5 space-y-0.5">
        <p className="text-xs font-medium leading-tight line-clamp-2 text-foreground">{product.name}</p>
        {product.store_name && <p className="text-[10px] text-yellow-600 dark:text-yellow-400 font-medium truncate">{product.store_name}</p>}
        {product.category && <p className="text-[10px] text-muted-foreground truncate">{product.category}</p>}
        <div className="pt-1">
          {product.price
            ? <span className="text-xs font-semibold text-foreground">{formatPrice(product.price)}</span>
            : <span className="text-[10px] text-muted-foreground">Price on request</span>}
        </div>
      </div>
    </motion.a>
  );
}

// ─── Proposal Card (Store Agent — preview then confirm) ─────────────────────────

const SIZE_LABEL: Record<CarouselSizeOption, string> = {
  featured: 'Featured',
  normal: 'Normal',
  compact: 'Compact',
};

function money(v: number): string {
  const hasCents = Math.round(v * 100) % 100 !== 0;
  return `$${v.toLocaleString('en-AU', { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

/** Small "before → after" chip used in the carousel diff. */
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
          {proposal.changes.map(ch => {
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
                    {ch.is_active
                      ? <span className="text-green-600 dark:text-green-400">Shown</span>
                      : <span className="text-muted-foreground">Hidden</span>}
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
        <div className="rounded-lg bg-muted/50 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Your page will show</p>
          <ol className="space-y-0.5">
            {proposal.order_preview.map((row, i) => (
              <li key={i} className={cn('flex items-center gap-2 text-xs', !row.is_active && 'opacity-50')}>
                <span className="text-muted-foreground tabular-nums w-4 text-right">{i + 1}.</span>
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
        <span className="inline-flex items-center gap-1 rounded-md bg-yellow-400/20 px-1.5 py-0.5 text-[11px] font-semibold text-yellow-700 dark:text-yellow-300">
          {proposal.name}
        </span>
        <span className="text-[10px] text-muted-foreground">{SIZE_LABEL[proposal.carousel_size]}</span>
        <span className="text-xs text-muted-foreground">· {proposal.match_label}</span>
      </div>

      {preview.length > 0 && (
        <div className="rounded-lg bg-muted/50 p-2.5 space-y-1">
          {preview.map(p => (
            <div key={p.id} className="text-xs font-medium text-foreground truncate">{p.name}</div>
          ))}
          {extra > 0 && <p className="text-[10px] text-muted-foreground pt-0.5">+{extra} more product{extra === 1 ? '' : 's'}</p>}
        </div>
      )}

      {proposal.order_preview.length > 0 && (
        <div className="rounded-lg bg-muted/50 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Your page will show</p>
          <ol className="space-y-0.5">
            {proposal.order_preview.map((row, i) => (
              <li key={i} className={cn('flex items-center gap-2 text-xs', !row.is_active && 'opacity-50')}>
                <span className="text-muted-foreground tabular-nums w-4 text-right">{i + 1}.</span>
                <span className={cn('font-medium text-foreground', row.is_new && 'text-yellow-700 dark:text-yellow-300')}>{row.name}</span>
                <span className="text-[10px] text-muted-foreground">{SIZE_LABEL[row.carousel_size]}</span>
                {row.is_new && <span className="rounded-full bg-yellow-400/20 px-1.5 py-0.5 text-[9px] font-semibold text-yellow-700 dark:text-yellow-300">New</span>}
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
        <div className="rounded-lg bg-muted/50 p-2.5 space-y-1">
          {preview.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-foreground truncate">{p.name}</span>
              <span className="flex-shrink-0 whitespace-nowrap">
                <span className="text-muted-foreground line-through">{money(p.price)}</span>
                <span className="ml-1.5 font-semibold text-red-600 dark:text-red-400">{money(p.sale_price)}</span>
              </span>
            </div>
          ))}
          {extra > 0 && <p className="text-[10px] text-muted-foreground pt-0.5">+{extra} more product{extra === 1 ? '' : 's'}</p>}
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
        <div className="rounded-lg bg-muted/50 p-2.5 space-y-1">
          {preview.map(p => (
            <div key={p.id} className="text-xs font-medium text-foreground truncate">{p.name}</div>
          ))}
          {extra > 0 && <p className="text-[10px] text-muted-foreground pt-0.5">+{extra} more product{extra === 1 ? '' : 's'}</p>}
        </div>
      )}
    </div>
  );
}

function ProposalCard({ proposal }: { proposal: GenieProposal }) {
  const [status, setStatus] = useState<'idle' | 'applying' | 'applied' | 'error'>('idle');
  const [resultMsg, setResultMsg] = useState('');

  const apply = async () => {
    setStatus('applying');
    setResultMsg('');
    try {
      const res = await fetch('/api/genie/agent/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setStatus('error');
        setResultMsg(data?.error || 'Could not apply the change. Please try again.');
        return;
      }
      setStatus('applied');
      setResultMsg((data as ApplyResult).message);
    } catch {
      setStatus('error');
      setResultMsg('Connection error. Please try again.');
    }
  };

  const meta =
    proposal.kind === 'carousel_layout'
      ? { Icon: LayoutGrid, title: 'Carousel layout', cta: 'Apply layout' }
      : proposal.kind === 'carousel_create'
      ? { Icon: FolderPlus, title: 'New carousel', cta: `Create "${proposal.name}"` }
      : proposal.kind === 'carousel_rename'
      ? { Icon: Pencil, title: 'Rename carousel', cta: 'Apply rename' }
      : proposal.kind === 'discount_apply'
      ? { Icon: Tag, title: 'Apply discount', cta: `Apply ${Math.round(proposal.discount_percent)}% discount` }
      : { Icon: Tag, title: 'Remove discount', cta: 'Remove discount' };
  const { Icon } = meta;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-yellow-400/40 bg-yellow-50/40 dark:bg-yellow-400/[0.04] overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-yellow-400/20 text-yellow-600 dark:text-yellow-400">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <p className="text-xs font-semibold text-foreground flex-1">{meta.title}</p>
        <span className="rounded-full bg-yellow-400/20 px-2 py-0.5 text-[10px] font-medium text-yellow-700 dark:text-yellow-300">Preview</span>
      </div>

      <div className="px-3.5 pb-3 space-y-2.5">
        {proposal.summary && <p className="text-xs text-muted-foreground leading-snug">{proposal.summary}</p>}

        {proposal.kind === 'carousel_layout' && <CarouselDiff proposal={proposal} />}
        {proposal.kind === 'carousel_create' && <CarouselCreateDiff proposal={proposal} />}
        {proposal.kind === 'carousel_rename' && <CarouselRenameDiff proposal={proposal} />}
        {proposal.kind === 'discount_apply' && <DiscountApplyDiff proposal={proposal} />}
        {proposal.kind === 'discount_remove' && <DiscountRemoveDiff proposal={proposal} />}

        {/* Action / result */}
        {status === 'applied' ? (
          <div className="flex items-center gap-2 rounded-xl bg-green-50 dark:bg-green-900/20 px-3 py-2.5 text-xs font-medium text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            {resultMsg || 'Done.'}
          </div>
        ) : (
          <div className="space-y-1.5">
            <button
              onClick={apply}
              disabled={status === 'applying'}
              className={cn(
                'w-full flex items-center justify-center gap-2 rounded-xl h-10 text-sm font-semibold transition-all',
                status === 'applying'
                  ? 'bg-muted text-muted-foreground cursor-wait'
                  : 'bg-yellow-400 text-yellow-950 hover:bg-yellow-500 shadow-sm shadow-yellow-400/25',
              )}
            >
              {status === 'applying'
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Applying…</>
                : <><Check className="h-4 w-4" /> {meta.cta}</>}
            </button>
            {status === 'error' && (
              <div className="flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400 px-1">
                <AlertCircle className="h-3 w-3 flex-shrink-0" />
                {resultMsg}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[82%] rounded-2xl rounded-br-sm bg-yellow-400 px-4 py-2.5 text-sm font-medium text-yellow-950 shadow-sm">
          {message.content}
        </div>
      </motion.div>
    );
  }

  const noProposals = !message.proposals || message.proposals.length === 0;
  const showShimmer = message.isStreaming && message.currentStatus && !message.content && (!message.products || message.products.length === 0) && noProposals;
  const showSpinner = message.isStreaming && !message.content && !message.currentStatus && (!message.products || message.products.length === 0) && noProposals;

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2">

      {/* 1. Shimmer / spinner — shown while waiting for first content */}
      <AnimatePresence mode="wait">
        {showShimmer && message.currentStatus && <ShimmerStatus key={message.currentStatus.phase} step={message.currentStatus} />}
        {showSpinner && (
          <motion.div key="spinner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Products — rendered first so text reveals below without pushing them */}
      <AnimatePresence>
        {message.products && message.products.length > 0 && (
          <motion.div
            key="products"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-1.5"
          >
            <p className="text-[11px] font-medium text-muted-foreground px-0.5">In stock at Yellow Jersey</p>
            <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {message.products.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Text content — word-by-word reveal, then switches to parsed markdown */}
      <AnimatePresence>
        {(message.content || (!showShimmer && !showSpinner && message.isStreaming)) && (
          <motion.div
            key="text"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="max-w-full rounded-2xl rounded-bl-sm bg-muted/60 px-3.5 py-2.5 text-sm text-foreground"
          >
            {message.isStreaming ? (
              <span style={{ whiteSpace: 'pre-wrap' }} className="leading-snug text-sm">
                {message.content}
                <span className="inline-block h-[1em] w-0.5 ml-0.5 bg-yellow-500 animate-pulse align-text-bottom" />
              </span>
            ) : message.content ? (
              <div
                className="max-w-none [&>p+p]:mt-0.5 [&>p:first-child]:mt-0 [&_ul]:my-0.5 [&_ol]:my-0.5"
                dangerouslySetInnerHTML={{ __html: parseMarkdown(message.content) }}
              />
            ) : (
              <span className="text-muted-foreground text-xs">...</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3b. Proposals — Store Agent action cards (preview → confirm) */}
      {message.proposals && message.proposals.length > 0 && (
        <div className="space-y-2">
          {message.proposals.map((p, i) => <ProposalCard key={i} proposal={p} />)}
        </div>
      )}

      {/* 4. Error */}
      {message.error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {message.error}
        </div>
      )}

      {/* 5. Sources */}
      {message.sources && message.sources.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground/70 px-0.5">Sources</p>
          <div className="flex flex-wrap gap-1.5">
            {message.sources.map((s, i) => <SourcePill key={i} citation={s} />)}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Suggestions ──────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Best road bike under $3,000?",
  "What's in stock right now?",
  "Electronic vs mechanical groupsets",
  "How often should I service my bike?",
];

const AGENT_SUGGESTIONS = [
  "Show my carousels",
  "Put Road Bikes first and feature it",
  "50% off all Clif bars",
  "Show my active discounts",
];

function SuggestionPill({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:border-yellow-400 hover:text-foreground transition-all whitespace-nowrap">
      {text}
    </button>
  );
}

// ─── Genie Panel ──────────────────────────────────────────────────────────────

export function GeniePanel() {
  const { isOpen, isExpanded, close, toggleExpand } = useGenie();
  const { user } = useAuth();
  const { profile } = useUserProfile();

  // Store Agent mode is only offered to verified bicycle stores.
  const isStore = profile?.account_type === 'bicycle_store' && profile?.bicycle_store === true;
  const [mode, setMode] = useState<'advisor' | 'agent'>('advisor');
  const agentActive = isStore && mode === 'agent';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Min-height applied to the last message so a freshly-sent message can scroll to the top
  const [lastMsgMinHeight, setLastMsgMinHeight] = useState<number | undefined>(undefined);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastUserMsgRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const suppressScrollUntilRef = useRef<number>(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom while streaming — suppressed briefly after user sends
  useEffect(() => {
    if (Date.now() < suppressScrollUntilRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  useEffect(() => { if (isOpen) setTimeout(() => inputRef.current?.focus(), 300); }, [isOpen]);
  useEffect(() => { if (!isOpen) abortRef.current?.abort(); }, [isOpen]);
  useEffect(() => { if (view === 'history' && user) loadConversationList(); }, [view, user]);

  const loadConversationList = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/genie/conversations');
      if (res.ok) setConversations((await res.json()).conversations ?? []);
    } finally { setHistoryLoading(false); }
  };

  const loadConversation = async (id: string) => {
    try {
      const res = await fetch(`/api/genie/conversations/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      const loaded: ChatMessage[] = (data.messages ?? []).map((m: any) => ({
        id: crypto.randomUUID(), role: m.role, content: m.content ?? '',
        products: m.products, sources: m.sources,
      }));
      setMessages(loaded);
      setConversationId(id);
      setLastMsgMinHeight(undefined);
      setView('chat');
    } catch {}
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/genie/conversations/${id}`, { method: 'DELETE' });
    setConversations(prev => prev.filter(c => c.id !== id));
    if (conversationId === id) { setConversationId(null); setMessages([]); }
  };

  const startNewChat = () => { setMessages([]); setConversationId(null); setLastMsgMinHeight(undefined); setView('chat'); };

  // Advisor and Store Agent are separate response threads — switching starts a fresh chat.
  const switchMode = (m: 'advisor' | 'agent') => {
    if (m === mode) return;
    abortRef.current?.abort();
    setMode(m);
    setMessages([]);
    setConversationId(null);
    setLastMsgMinHeight(undefined);
    setView('chat');
  };

  const saveConversation = useCallback(async (msgs: ChatMessage[], currentId: string | null) => {
    if (!user) return null;
    try {
      const res = await fetch('/api/genie/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentId ?? undefined,
          messages: msgs.map(m => ({ role: m.role, content: m.content, products: m.products, sources: m.sources })),
        }),
      });
      if (res.ok) return (await res.json()).id as string;
    } catch {}
    return null;
  }, [user]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    // Store Agent mode talks to the authenticated agent endpoint (read + propose);
    // advisor mode uses the public Genie endpoint. They are separate threads.
    const agentMode = isStore && mode === 'agent';
    const endpoint = agentMode ? '/api/genie/agent' : '/api/genie';

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text.trim() };
    const assistantId = crypto.randomUUID();

    // Measure the visible chat area — the last message gets this as min-height so the
    // freshly-sent message always has room to scroll to the very top (ChatGPT technique).
    const containerH = scrollContainerRef.current?.clientHeight ?? 0;

    // flushSync forces React to commit DOM synchronously — refs are live immediately after
    suppressScrollUntilRef.current = Date.now() + 120_000; // suppress for 2 min — cleared on next send
    flushSync(() => {
      setLastMsgMinHeight(containerH);
      setMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', isStreaming: true }]);
      setInput('');
    });
    setIsLoading(true);

    // DOM is committed and there's now enough scroll room — snap user message to the top
    {
      const container = scrollContainerRef.current;
      const el = lastUserMsgRef.current;
      if (container && el) {
        const elRect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        container.scrollTo({ top: container.scrollTop + (elRect.top - containerRect.top) - 12, behavior: 'smooth' });
      }
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const ss = { pending: '', rafId: null as number | null };
    const flushText = () => {
      if (ss.pending) {
        const chunk = ss.pending; ss.pending = '';
        setMessages(prev => prev.map(m =>
          m.id !== assistantId ? m : { ...m, content: m.content + chunk, currentStatus: undefined }
        ));
      }
      ss.rafId = null;
    };

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body!.getReader();
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
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.event === 'status') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, currentStatus: { phase: parsed.phase, text: parsed.text } } : m
              ));
            }
            if (parsed.event === 'text_delta') {
              ss.pending += parsed.text ?? '';
              if (ss.rafId === null) ss.rafId = requestAnimationFrame(flushText);
            }
            if (parsed.event === 'products') {
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, products: parsed.products } : m));
            }
            if (parsed.event === 'proposal' && parsed.proposal) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, proposals: [...(m.proposals ?? []), parsed.proposal as GenieProposal] } : m
              ));
            }
            if (parsed.event === 'sources') {
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, sources: parsed.sources } : m));
            }
            if (parsed.event === 'done') {
              if (ss.rafId !== null) { cancelAnimationFrame(ss.rafId); flushText(); }
              setMessages(prev => {
                const updated = prev.map(m =>
                  m.id === assistantId ? { ...m, isStreaming: false, currentStatus: undefined } : m
                );
                if (!agentMode) {
                  saveConversation(updated, conversationId).then(newId => {
                    if (newId && !conversationId) setConversationId(newId);
                  });
                }
                return updated;
              });
            }
            if (parsed.event === 'error') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, isStreaming: false, currentStatus: undefined, error: 'Something went wrong. Please try again.' }
                  : m
              ));
            }
          } catch { /* skip malformed */ }
        }
      }

      // Stream closed — ensure the message is finalised even if 'done' event was missing
      if (ss.rafId !== null) { cancelAnimationFrame(ss.rafId); flushText(); }
      setMessages(prev => prev.map(m =>
        m.id === assistantId && m.isStreaming
          ? { ...m, isStreaming: false, currentStatus: undefined }
          : m
      ));
    } catch (err) {
      if (ss.rafId !== null) { cancelAnimationFrame(ss.rafId); ss.rafId = null; }
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, isStreaming: false, currentStatus: undefined, error: 'Connection error. Please try again.' }
            : m
        ));
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [isLoading, messages, conversationId, saveConversation, isStore, mode]);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(input); };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const isEmpty = messages.length === 0;

  return (
    <>
      {/* Backdrop — CSS opacity transition, no JS animation */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        style={{
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
        }}
        onClick={close}
      />

      {/* Panel — always mounted, pure CSS transform (compositor thread, no JS per-frame) */}
      <div
        className={cn(
          'fixed right-3 top-[1.5%] z-50 flex flex-col',
          'max-w-[calc(100vw-24px)]',
          'rounded-2xl overflow-hidden',
          'shadow-2xl shadow-black/15 border border-border/50 bg-background',
        )}
        style={{
          height: '97vh',
          width: isExpanded ? 'calc(100vw - 24px)' : '420px',
          transform: isOpen ? 'translateX(0)' : 'translateX(calc(100% + 24px))',
          transition: 'transform 0.38s cubic-bezier(0.32, 0.72, 0, 1), width 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'transform',
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      >
            {/* ── Header ─────────────────────────────────────── */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex-shrink-0">
                  <AIMotionOrb size={30} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-none truncate">Yellow Jersey Genius</p>
                  <AnimatePresence mode="wait">
                    {isLoading
                      ? <motion.p key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="text-[11px] text-yellow-600 dark:text-yellow-400 mt-0.5">Thinking...</motion.p>
                      : <motion.p key="i" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="text-[11px] text-muted-foreground mt-0.5">{agentActive ? 'Store agent · acts on your store' : 'Elite cycling advisor'}</motion.p>}
                  </AnimatePresence>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {user && view === 'chat' && !agentActive && (
                  <button onClick={() => setView('history')} title="History"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                    <Clock className="h-4 w-4" />
                  </button>
                )}
                {view === 'history' && (
                  <button onClick={() => setView('chat')}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <button onClick={toggleExpand} title={isExpanded ? 'Collapse' : 'Expand'}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button onClick={close}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* ── Mode Toggle — verified bicycle stores only ──── */}
            {isStore && view === 'chat' && (
              <div className="flex-shrink-0 px-4 pt-2.5">
                <div className="flex gap-1 rounded-xl bg-muted/60 p-1">
                  <button onClick={() => switchMode('advisor')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all',
                      !agentActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}>
                    <Sparkles className="h-3.5 w-3.5" /> Advisor
                  </button>
                  <button onClick={() => switchMode('agent')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all',
                      agentActive ? 'bg-yellow-400 text-yellow-950 shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}>
                    <Store className="h-3.5 w-3.5" /> Store Agent
                  </button>
                </div>
              </div>
            )}

            {/* ── History View ──────────────────────────────── */}
            {view === 'history' && (
              <div className="flex-1 overflow-y-auto">
                <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Past conversations</p>
                  <button onClick={startNewChat}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium bg-yellow-400 text-yellow-950 hover:bg-yellow-500 transition-colors">
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                    New chat
                  </button>
                </div>
                {historyLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                    <Clock className="h-8 w-8 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No past conversations yet.</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Your chats will appear here.</p>
                  </div>
                ) : (
                  <div className="px-3 pb-4 space-y-1">
                    {conversations.map(conv => (
                      <button key={conv.id} onClick={() => loadConversation(conv.id)}
                        className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted/60 transition-colors group">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-yellow-400/20 text-yellow-600 dark:text-yellow-400">
                          <GenieLogo className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate leading-snug">{conv.title}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(conv.updated_at)}</p>
                        </div>
                        <button onClick={(e) => deleteConversation(conv.id, e)}
                          className="flex-shrink-0 opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-red-500 transition-all">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Chat View ─────────────────────────────────── */}
            {view === 'chat' && (
              <>
                <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {isEmpty ? (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                      className="flex flex-col items-center justify-center h-full text-center px-4 pb-8">
                      <div className="mb-5">
                        <AIMotionOrb size={72} />
                      </div>
                      <h3 className="text-base font-bold text-foreground mb-1.5">{agentActive ? 'Store Agent' : 'Yellow Jersey Genius'}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-[270px]">
                        {agentActive
                          ? 'Reorder your store carousels and run discounts just by asking. I’ll show a preview before anything changes.'
                          : 'Expert cycling advice, real-time web search, and live stock lookup — all in one.'}
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {(agentActive ? AGENT_SUGGESTIONS : SUGGESTIONS).map((s, i) => <SuggestionPill key={i} text={s} onClick={() => sendMessage(s)} />)}
                      </div>
                    </motion.div>
                  ) : (
                    messages.map((msg, i) => {
                      const isLastUser =
                        msg.role === 'user' &&
                        !messages.slice(i + 1).some(m => m.role === 'user');
                      const isLast = i === messages.length - 1;
                      return (
                        <div
                          key={msg.id}
                          ref={isLastUser ? lastUserMsgRef : undefined}
                          style={isLast && lastMsgMinHeight ? { minHeight: lastMsgMinHeight } : undefined}
                        >
                          <MessageBubble message={msg} />
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {!isEmpty && !isLoading && (
                  <div className="flex-shrink-0 flex gap-2 px-4 pb-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                    {(agentActive ? AGENT_SUGGESTIONS : SUGGESTIONS).slice(0, 2).map((s, i) => <SuggestionPill key={i} text={s} onClick={() => sendMessage(s)} />)}
                  </div>
                )}

                <div className="flex-shrink-0 bg-background/80 backdrop-blur px-4 py-3">
                  <form onSubmit={handleSubmit}>
                    <div className="relative">
                      <textarea ref={inputRef} value={input}
                        onChange={e => {
                          setInput(e.target.value);
                          e.target.style.height = 'auto';
                          e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px';
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder={agentActive ? 'Tell the agent what to change…' : 'Ask anything about bikes...'}
                        rows={2} disabled={isLoading}
                        className={cn(
                          'w-full resize-none rounded-2xl border border-border bg-muted/50',
                          'px-4 py-3.5 pr-14 text-sm text-foreground placeholder:text-muted-foreground',
                          'focus:outline-none focus:ring-2 focus:ring-yellow-400/40 focus:border-yellow-400/50',
                          'disabled:opacity-50 disabled:cursor-not-allowed min-h-[84px] max-h-[180px] leading-relaxed',
                        )}
                        style={{ height: '84px' }} />
                      <button type="submit" disabled={!input.trim() || isLoading}
                        className={cn(
                          'absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-150',
                          input.trim() && !isLoading
                            ? 'bg-yellow-400 text-yellow-950 hover:bg-yellow-500 shadow-md shadow-yellow-400/25'
                            : 'bg-muted/80 text-muted-foreground cursor-not-allowed',
                        )}>
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    </div>
                  </form>
                  <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">
                    {agentActive ? 'Store Agent · previews every change before applying' : 'Yellow Jersey Genius · Real-time cycling advice'}
                  </p>
                </div>
              </>
            )}
      </div>
    </>
  );
}
