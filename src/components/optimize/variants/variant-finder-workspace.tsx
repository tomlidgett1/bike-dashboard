"use client";

import * as React from "react";
import { Loader2, RotateCcw, Sparkles } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VariantScopePicker } from "./variant-scope-picker";
import { VariantProgress } from "./variant-progress";
import { VariantCandidateCard } from "./variant-candidate-card";
import type { Candidate, VariantGroupSummary, VariantRun } from "./types";

type Step = "scope" | "scanning" | "review";

const CONFIDENCE_RANK: Record<Candidate["confidence"], number> = { high: 0, medium: 1, low: 2 };
const STATUS_RANK: Record<Candidate["status"], number> = {
  pending: 0,
  approved: 1,
  failed: 2,
  applied_local: 3,
  applied_lightspeed: 4,
  rejected: 5,
};

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-white px-3 py-2">
      <p className={cn("text-lg font-semibold", tone ?? "text-foreground")}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function VariantFinderWorkspace() {
  const [step, setStep] = React.useState<Step>("scope");
  const [starting, setStarting] = React.useState(false);
  const [run, setRun] = React.useState<VariantRun | null>(null);
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [groups, setGroups] = React.useState<Map<string, VariantGroupSummary>>(new Map());
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmingBulk, setConfirmingBulk] = React.useState(false);

  const runIdRef = React.useRef<string | null>(null);

  const refetchReview = React.useCallback(async (runId: string) => {
    const [cRes, gRes] = await Promise.all([
      fetch(`/api/optimize/variants/runs/${runId}/candidates`),
      fetch(`/api/optimize/variants/groups`),
    ]);
    const cData = await cRes.json().catch(() => ({}));
    const gData = await gRes.json().catch(() => ({}));
    if (cRes.ok) setCandidates((cData.candidates ?? []) as Candidate[]);
    if (gRes.ok) {
      const map = new Map<string, VariantGroupSummary>();
      for (const g of (gData.groups ?? []) as VariantGroupSummary[]) map.set(g.id, g);
      setGroups(map);
    }
  }, []);

  // Poll the run while scanning.
  React.useEffect(() => {
    if (step !== "scanning" || !run) return;
    if (run.status === "ready" || run.status === "failed") return;
    const timer = setInterval(async () => {
      const id = runIdRef.current;
      if (!id) return;
      const res = await fetch(`/api/optimize/variants/runs/${id}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.run) setRun(data.run as VariantRun);
    }, 1500);
    return () => clearInterval(timer);
  }, [step, run]);

  // When the run finishes, load the review.
  React.useEffect(() => {
    if (step !== "scanning" || !run) return;
    if (run.status === "ready") {
      (async () => {
        setLoading(true);
        await refetchReview(run.id);
        setLoading(false);
        setStep("review");
      })();
    } else if (run.status === "failed") {
      setError(run.error_message || "The scan failed. Please try again.");
      setStep("scope");
    }
  }, [step, run, refetchReview]);

  async function startScan(scope: { categories: string[]; brands: string[]; all_products: boolean }) {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/optimize/variants/start-detection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not start the scan");
      runIdRef.current = data.runId;
      setRun({
        id: data.runId,
        status: "queued",
        phase: "preparing",
        message: "Queued…",
        error_message: null,
        products_total: 0,
        buckets_total: 0,
        buckets_done: 0,
        candidates_total: 0,
        created_at: new Date().toISOString(),
        completed_at: null,
      });
      setStep("scanning");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the scan");
    } finally {
      setStarting(false);
    }
  }

  const onChanged = React.useCallback(() => {
    if (runIdRef.current) refetchReview(runIdRef.current);
  }, [refetchReview]);

  const sorted = React.useMemo(
    () =>
      [...candidates].sort(
        (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence],
      ),
    [candidates],
  );

  const counts = React.useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0, applied: 0, failed: 0 };
    for (const cand of candidates) {
      if (cand.status === "pending") c.pending++;
      else if (cand.status === "approved") c.approved++;
      else if (cand.status === "rejected") c.rejected++;
      else if (cand.status === "applied_local" || cand.status === "applied_lightspeed") c.applied++;
      else if (cand.status === "failed") c.failed++;
    }
    return c;
  }, [candidates]);

  const bulkEligible = React.useMemo(
    () => candidates.filter((c) => c.status === "pending" && c.confidence === "high" && c.warnings.length === 0),
    [candidates],
  );

  async function bulkApprove() {
    setConfirmingBulk(false);
    await Promise.all(
      bulkEligible.map((c) =>
        fetch(`/api/optimize/variants/candidates/${c.id}/approve`, { method: "POST" }).catch(() => null),
      ),
    );
    onChanged();
  }

  if (step === "scope") {
    return (
      <div className="space-y-4">
        {error && <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        <VariantScopePicker onScan={startScan} starting={starting} />
      </div>
    );
  }

  if (step === "scanning" && run) {
    return <VariantProgress run={run} />;
  }

  // Review
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Stat label="Products scanned" value={run?.products_total ?? 0} />
        <Stat label="Likely groups" value={candidates.length} />
        <Stat label="To review" value={counts.pending} tone="text-amber-600" />
        <Stat label="Approved" value={counts.approved} tone="text-sky-600" />
        <Stat label="Applied" value={counts.applied} tone="text-emerald-600" />
        <Stat label="Failed" value={counts.failed} tone={counts.failed ? "text-rose-600" : undefined} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {bulkEligible.length > 0 && !confirmingBulk && (
            <Button size="sm" variant="outline" onClick={() => setConfirmingBulk(true)}>
              <Sparkles className="size-4" />
              Approve {bulkEligible.length} high-confidence
            </Button>
          )}
          {confirmingBulk && (
            <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm">
              <span>Approve {bulkEligible.length} high-confidence groups with no warnings?</span>
              <Button size="sm" onClick={bulkApprove}>Yes, approve</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingBulk(false)}>Cancel</Button>
            </div>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={() => { setStep("scope"); setCandidates([]); setRun(null); }}>
          <RotateCcw className="size-4" />
          Scan again
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : candidates.length === 0 ? (
        <div className="rounded-md border border-border/60 bg-white p-8 text-center">
          <p className="text-sm font-medium text-foreground">No likely variants found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            We didn’t spot products that look like variants in this selection. Try a different category or brand.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((candidate) => (
            <VariantCandidateCard
              key={candidate.id}
              candidate={candidate}
              group={candidate.applied_group_id ? groups.get(candidate.applied_group_id) : undefined}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}
