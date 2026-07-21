import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupplierDiscoveryEvidence } from "@/lib/scrapers/supplier-universal-discovery";
import {
  getScrapeUrlCounts,
  type ScrapeUrlCounts,
} from "@/lib/supplier-catalogue/url-queue";

export type SupplierCoverageStatus =
  | "verified"
  | "unverified"
  | "incomplete";

export interface SupplierCoverageDecision {
  status: SupplierCoverageStatus;
  runStatus: "succeeded" | "coverage_unverified" | "incomplete";
  catalogueStatus: "ready" | "coverage_unverified" | "incomplete";
  authoritativeTotal: number | null;
  authoritativeSource: string | null;
  counts: ScrapeUrlCounts;
  reason: string;
  summary: Record<string, unknown>;
}

export interface CoverageSource {
  source_type: string;
  endpoint_url: string;
  last_total: number | null;
  is_authoritative: boolean;
  confidence: number;
}

function sourceKey(evidence: SupplierDiscoveryEvidence): string {
  return `${evidence.sourceType}|${evidence.scope}|${evidence.endpointUrl}`;
}

export function mergeDiscoveryEvidence(
  current: SupplierDiscoveryEvidence[] | null | undefined,
  incoming: SupplierDiscoveryEvidence[],
): SupplierDiscoveryEvidence[] {
  const merged = new Map<string, SupplierDiscoveryEvidence>();
  for (const evidence of [...(current ?? []), ...incoming]) {
    const key = sourceKey(evidence);
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, {
        ...evidence,
        // Product URLs belong in the durable URL queue, not checkpoint JSON.
        productUrls: [],
      });
      continue;
    }
    merged.set(key, {
      ...previous,
      requestTemplate:
        Object.keys(evidence.requestTemplate ?? {}).length > 0
          ? evidence.requestTemplate
          : previous.requestTemplate,
      total:
        evidence.total == null
          ? previous.total
          : previous.total == null
            ? evidence.total
            : Math.max(previous.total, evidence.total),
      isAuthoritative:
        previous.isAuthoritative || evidence.isAuthoritative,
      confidence: Math.max(previous.confidence, evidence.confidence),
      productUrls: [],
    });
  }
  return [...merged.values()];
}

export async function persistDiscoveryEvidence(input: {
  admin: SupabaseClient;
  catalogueId: string;
  runId: string;
  evidence: SupplierDiscoveryEvidence[];
}): Promise<void> {
  if (input.evidence.length === 0) return;
  const merged = new Map<string, SupplierDiscoveryEvidence>();
  for (const item of input.evidence) {
    const previous = merged.get(sourceKey(item));
    merged.set(sourceKey(item), {
      ...item,
      total:
        previous?.total != null && item.total != null
          ? Math.max(previous.total, item.total)
          : item.total ?? previous?.total ?? null,
      productUrls: [
        ...new Set([...(previous?.productUrls ?? []), ...item.productUrls]),
      ],
    });
  }

  const rows = [...merged.values()].map((item) => ({
    catalogue_id: input.catalogueId,
    run_id: input.runId,
    source_type: item.sourceType,
    scope: item.scope,
    endpoint_url: item.endpointUrl,
    request_method: item.requestMethod,
    request_template: item.requestTemplate,
    last_total: item.total,
    product_url_count: item.productUrls.length,
    is_authoritative: item.isAuthoritative,
    confidence: item.confidence,
    status: "active",
    last_error: null,
    last_seen_at: new Date().toISOString(),
  }));

  const { error } = await input.admin
    .from("supplier_catalogue_discovery_sources")
    .upsert(rows, {
      onConflict: "catalogue_id,source_type,endpoint_url",
    });
  if (error) {
    throw new Error(error.message || "Failed to persist discovery evidence");
  }
}

export async function reconcileCatalogueCoverage(input: {
  admin: SupabaseClient;
  catalogueId: string;
  runId: string;
}): Promise<SupplierCoverageDecision> {
  const counts = await getScrapeUrlCounts(input.admin, input.runId);
  const { data: sources, error } = await input.admin
    .from("supplier_catalogue_discovery_sources")
    .select(
      "source_type, scope, endpoint_url, last_total, is_authoritative, confidence",
    )
    .eq("run_id", input.runId)
    .eq("scope", "catalogue")
    .eq("is_authoritative", true)
    .not("last_total", "is", null)
    .order("confidence", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to load coverage evidence");
  }

  return decideCatalogueCoverage(counts, (sources ?? []) as CoverageSource[]);
}

export function decideCatalogueCoverage(
  counts: ScrapeUrlCounts,
  sources: CoverageSource[],
): SupplierCoverageDecision {
  const totals = [
    ...new Set(
      sources
        .filter((source) => source.is_authoritative)
        .map((source) => Number(source.last_total))
        .filter((total) => Number.isFinite(total) && total >= 0),
    ),
  ];
  const authoritative =
    totals.length === 1
      ? sources.find(
          (source) =>
            source.is_authoritative &&
            Number(source.last_total) === totals[0],
        ) ?? null
      : null;
  const authoritativeTotal = authoritative ? totals[0] : null;
  const authoritativeSource = authoritative
    ? `${authoritative.source_type}:${authoritative.endpoint_url}`
    : null;

  let status: SupplierCoverageStatus;
  let reason: string;

  if (counts.unresolved > 0 || counts.failed > 0) {
    status = "incomplete";
    reason = `${counts.unresolved} discovered URLs remain unresolved`;
  } else if (totals.length > 1) {
    status = "unverified";
    reason = `Authoritative sources disagree (${totals.join(", ")})`;
  } else if (authoritativeTotal == null) {
    status = "unverified";
    reason =
      "No catalogue-wide authoritative product total or complete feed was available";
  } else if (
    counts.discovered !== authoritativeTotal ||
    counts.ingested !== authoritativeTotal
  ) {
    status = "incomplete";
    reason = `Supplier reports ${authoritativeTotal} products; discovered ${counts.discovered}, ingested ${counts.ingested}`;
  } else {
    status = "verified";
    reason = `All ${authoritativeTotal} supplier products reconciled`;
  }

  const summary = {
    status,
    reason,
    authoritativeTotal,
    authoritativeSource,
    discovered: counts.discovered,
    ingested: counts.ingested,
    pending: counts.pending,
    scraping: counts.scraping,
    failed: counts.failed,
    skipped: counts.skipped,
    unresolved: counts.unresolved,
    reconciledAt: new Date().toISOString(),
  };

  return {
    status,
    runStatus:
      status === "verified"
        ? "succeeded"
        : status === "unverified"
          ? "coverage_unverified"
          : "incomplete",
    catalogueStatus:
      status === "verified"
        ? "ready"
        : status === "unverified"
          ? "coverage_unverified"
          : "incomplete",
    authoritativeTotal,
    authoritativeSource,
    counts,
    reason,
    summary,
  };
}
