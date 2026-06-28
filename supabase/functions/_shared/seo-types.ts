// Shared types for the Yellow Jersey Search Dominance Agent edge functions.
import type { AdminDb } from './seo-db.ts';

// Handler execution context (defined here so handlers and the worker don't form
// a circular import through the worker entrypoint).
export interface HandlerCtx {
  db: AdminDb;
  site: string;
}
export type Handler = (task: SeoTask, ctx: HandlerCtx) => Promise<Record<string, unknown>>;

export type SeoTaskType =
  | 'gsc-sync'
  | 'inventory-sync'
  | 'keyword-engine'
  | 'page-planner'
  | 'page-generator'
  | 'page-validator'
  | 'sitemap'
  | 'url-inspection'
  | 'merchant-sync'
  | 'business-profile-sync'
  | 'internal-links'
  | 'alerts';

export interface SeoTask {
  id: string;
  run_id: string | null;
  task_type: SeoTaskType;
  status: 'queued' | 'running' | 'done' | 'error' | 'skipped';
  priority: number;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
}

export type PageType =
  | 'marketplace_category'
  | 'suburb_category'
  | 'store_directory'
  | 'owned_store'
  | 'guide'
  | 'brand_city'
  | 'blog';

export type Indexability = 'index' | 'noindex';
export type PageStatus = 'candidate' | 'draft' | 'published' | 'retired';

export interface SeoPageRow {
  id: string;
  url: string;
  page_type: PageType;
  target_keyword: string | null;
  title: string | null;
  meta_description: string | null;
  h1: string | null;
  status: PageStatus;
  indexability: Indexability;
  canonical_url: string | null;
  quality_score: number;
  spam_risk_score: number;
  supply_count: number;
  params: Record<string, unknown>;
  content: PageContent;
  last_published_at: string | null;
  last_refreshed_at: string | null;
}

export interface PageContent {
  intro?: string;
  blocks?: Array<{ heading: string; body: string }>;
  faqs?: Array<{ q: string; a: string }>;
  internal_links?: Array<{ url: string; anchor: string }>;
  schema?: string[]; // schema.org @types this page should emit
  generated_by?: string; // 'glm' | 'template'
  generated_at?: string;
}

// A scored page opportunity the planner emits.
export interface PageCandidate {
  url: string;
  page_type: PageType;
  target_keyword: string;
  params: Record<string, unknown>;
  supply_count: number;
  signals: ScoreSignals;
}

export interface ScoreSignals {
  searchDemand: number; // GSC impressions for the target keyword (raw)
  position: number; // current avg position (0 = not ranking)
  localIntent: boolean;
  supplyCount: number; // live listings / stores backing the page
  storeBacked: boolean; // an owned/partner store underpins it
  commercialIntent: boolean;
  internalLinkPotential: number; // 0..1
  duplicationRisk: number; // 0..1 (content similarity to an existing page)
  cannibalisationRisk: number; // 0..1 (an existing page already targets this)
}
