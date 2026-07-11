"use client";

// The Lifecycle tab — the autonomous customer lifecycle machine's cockpit.
//
// Reading order for a busy shop owner:
// 1. Anything waiting for my OK? (email-first approval cards)
// 2. Where do my customers stand? (stage distribution)
// 3. Is it making money? (results vs the control group)
// 4. What runs automatically, and what has it learned?

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cog,
  DollarSign,
  Letter,
  Loader2,
  MagicStick3,
  PlayCircle,
  Pulse,
  Refresh,
  Route,
  Users,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/stat-card";
import { cn } from "@/lib/utils";
import type { StoreBranding } from "@/lib/crm/templates";
import type { LifecycleOverview } from "@/lib/crm/lifecycle/overview";
import { SettingsNavTabs } from "@/components/settings/settings-nav-tabs";
import { LifecycleActivity } from "./lifecycle-activity";
import { LifecycleApprovals } from "./lifecycle-approvals";
import { LifecycleDistribution } from "./lifecycle-distribution";
import { LifecycleSetup } from "./lifecycle-setup";
import { formatMoney } from "./lifecycle-shared";

type Notice = { kind: "success" | "error"; text: string };

const LIFECYCLE_VIEWS = [
  { id: "overview", label: "Overview", icon: Pulse },
  { id: "campaigns", label: "Campaign setup", icon: MagicStick3 },
] as const;

function SectionHeading({
  title,
  subtitle,
  aside,
}: {
  title: string;
  subtitle?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div>
        <h3 className="font-display text-lg font-semibold tracking-[-0.01em] text-foreground">
          {title}
        </h3>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {aside ? <div className="shrink-0 pb-0.5">{aside}</div> : null}
    </div>
  );
}

export function LifecyclePanel({ store }: { store: StoreBranding }) {
  const [overview, setOverview] = React.useState<LifecycleOverview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [enabling, setEnabling] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [view, setView] = React.useState<"overview" | "campaigns">("overview");

  const load = React.useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const res = await fetch("/api/store/crm/lifecycle", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load lifecycle overview");
      const data = await res.json();
      setOverview(data.overview ?? null);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const runNow = React.useCallback(async () => {
    setRunning(true);
    setNotice(null);
    try {
      const res = await fetch("/api/store/crm/lifecycle/run", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Run failed");
      const s = data.summary ?? {};
      setNotice({
        kind: "success",
        text: `Fresh check done — ${(s.stageChanges ?? 0).toLocaleString()} customers changed stage and ${s.planned ?? 0} new email${s.planned === 1 ? "" : "s"} ${s.planned === 1 ? "is" : "are"} ready below.`,
      });
      await load({ silent: true });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Run failed" });
    } finally {
      setRunning(false);
    }
  }, [load]);

  const enable = React.useCallback(async () => {
    setEnabling(true);
    setNotice(null);
    try {
      const res = await fetch("/api/store/crm/lifecycle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_enabled: true }),
      });
      if (!res.ok) throw new Error("Could not turn on the lifecycle engine");
      await fetch("/api/store/crm/lifecycle/run", { method: "POST" });
      await load({ silent: true });
      setNotice({
        kind: "success",
        text: "You're on. Every customer has been sorted, and the first emails are ready for your OK below — nothing sends without you.",
      });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Enable failed" });
    } finally {
      setEnabling(false);
    }
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4 p-5">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16 text-sm text-muted-foreground">
        Could not load the lifecycle engine. Try refreshing.
      </div>
    );
  }

  const noticeBar = notice ? (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm",
        notice.kind === "success"
          ? "border-emerald-100 bg-emerald-50 text-emerald-800"
          : "border-red-100 bg-red-50 text-red-800",
      )}
    >
      {notice.kind === "success" ? (
        <CheckCircle2 className="size-4 shrink-0" />
      ) : (
        <AlertTriangle className="size-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1">{notice.text}</span>
      <button
        type="button"
        onClick={() => setNotice(null)}
        className="text-xs font-medium underline-offset-2 hover:underline"
      >
        Dismiss
      </button>
    </div>
  ) : null;

  // ── Onboarding ─────────────────────────────────────────────
  if (!overview.settings.is_enabled) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        {noticeBar ? <div className="mb-4">{noticeBar}</div> : null}
        <div className="flex flex-col items-center text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gray-100">
            <Route className="size-6 text-gray-500" />
          </div>
          <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.02em] text-foreground">
            The right email, to the right customer, at the right time
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
            The lifecycle engine watches your sales and sorts every customer into simple groups —
            new, regulars, best customers, drifting away, long gone. Then it prepares the right
            email for each group, shows you exactly what it wants to send, and proves the extra
            sales it creates.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          {[
            {
              title: "You see every email before it goes",
              body: "The engine prepares each email and waits for your OK. When you trust a program, flip it to automatic and it runs itself.",
            },
            {
              title: "Nobody gets pestered",
              body: "One email per customer per week at most, across everything you send. Unsubscribed customers are never contacted.",
            },
            {
              title: "It proves the money is real",
              body: "A slice of every audience is deliberately left out. If the customers who got the email don't spend more than the ones who didn't, it doesn't count.",
            },
            {
              title: "It gets better every send",
              body: "Every result — opens, purchases, unsubscribes — feeds back into the next email's timing and tone.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-md border border-border/60 bg-white px-4 py-3.5">
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-center gap-2">
          <Button size="lg" className="rounded-full px-8" onClick={() => void enable()} disabled={enabling}>
            {enabling ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <PlayCircle className="mr-2 size-4" />
            )}
            {enabling ? "Sorting your customers…" : "Turn it on"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Nothing is emailed without your approval
          </p>
        </div>
      </div>
    );
  }

  // ── Dashboard ──────────────────────────────────────────────
  const { impact, pendingActions } = overview;
  const hasResults = impact.emails_sent > 0;
  const lastChecked = overview.settings.last_classified_at
    ? new Date(overview.settings.last_classified_at).toLocaleString("en-AU", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-4 md:p-6">
      {noticeBar}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-foreground">
              Lifecycle engine is on
            </h2>
            <p className="text-xs text-muted-foreground">
              Watching {overview.contactsTracked.toLocaleString()} customers
              {lastChecked ? ` · last checked ${lastChecked}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => void runNow()}
            disabled={running}
          >
            {running ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Refresh className="mr-1.5 size-3.5" />
            )}
            {running ? "Checking…" : "Check now"}
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Lifecycle settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Cog className="size-4" />
          </Button>
        </div>
      </div>

      {/* Sub-navigation */}
      <SettingsNavTabs
        size="sm"
        items={LIFECYCLE_VIEWS}
        value={view}
        onChange={setView}
        layoutId="lifecycle-view-tabs"
      />

      {view === "campaigns" ? (
        <section>
          <LifecycleSetup
            programs={overview.programs}
            actions={[...pendingActions, ...overview.recentActions]}
            store={store}
            onChanged={() => void load({ silent: true })}
            onNotice={setNotice}
          />
        </section>
      ) : (
      <>

      {/* 1. Customers — where the base stands right now */}
      <section>
        <SectionHeading
          title="Your customers right now"
          subtitle="Everyone is sorted automatically from your sales history. Click a group to see who's in it."
        />
        <LifecycleDistribution
          distribution={overview.distribution}
          thresholds={overview.thresholds}
        />
      </section>

      {/* 2. Approvals */}
      {pendingActions.length > 0 ? (
        <section>
          <SectionHeading
            title={
              pendingActions.length === 1
                ? "1 email ready to send"
                : `${pendingActions.length} emails ready to send`
            }
            subtitle="Review each one, then send or skip. Ten seconds each."
          />
          <LifecycleApprovals
            actions={pendingActions}
            store={store}
            onResolved={() => void load({ silent: true })}
            onNotice={setNotice}
          />
        </section>
      ) : (
        <section className="rounded-xl border border-border/60 bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-5 shrink-0 text-gray-500" />
            <div>
              <p className="text-sm font-semibold text-foreground">Nothing waiting on you</p>
              <p className="text-xs text-muted-foreground">
                The engine checks daily and prepares emails only when customers are genuinely due
                one. New ones will appear here.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 3. Results */}
      <section>
        <SectionHeading
          title="Is it working?"
          subtitle={
            hasResults
              ? `Last ${impact.window_days} days. "Extra sales" only counts money the emails actually caused — measured against customers deliberately left out.`
              : undefined
          }
        />
        {hasResults ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Sales after emails"
              value={formatMoney(impact.attributed_revenue)}
              icon={DollarSign}
              hint="Everything emailed customers went on to spend"
              size="compact"
            />
            <StatCard
              label="Extra sales caused"
              value={formatMoney(impact.incremental_revenue)}
              icon={DollarSign}
              hint={`Above the ${formatMoney(impact.holdout_baseline)} those customers would likely have spent anyway`}
              size="compact"
            />
            <StatCard
              label="Emails sent"
              value={impact.emails_sent.toLocaleString()}
              icon={Letter}
              subMetric={
                impact.unsubscribes > 0
                  ? { value: impact.unsubscribes.toLocaleString(), label: "unsubscribed" }
                  : undefined
              }
              size="compact"
            />
            <StatCard
              label="Customers won back"
              value={impact.reactivations.toLocaleString()}
              icon={Users}
              hint="Drifting or lost customers who bought again after an email"
              size="compact"
            />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-gray-50/50 px-5 py-6 text-center">
            <p className="text-sm font-medium text-foreground">No results to show yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              Once your first emails go out, this becomes your scoreboard: the sales they caused,
              customers won back, and unsubscribes — all measured honestly against a control group
              of customers who weren't emailed.
            </p>
          </div>
        )}
      </section>

      {/* 4. Pointer to campaign setup */}
      <section className="rounded-xl border border-border/60 bg-white px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {overview.programs.filter((p) => p.enabled).length} of {overview.programs.length}{" "}
              campaigns are live
            </p>
            <p className="text-xs text-muted-foreground">
              Turn campaigns on or off, tune their timing, and design exactly what each one sends.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setView("campaigns")}
          >
            Set up campaigns
          </Button>
        </div>
      </section>

      {/* 5. Activity + learning */}
      <section>
        <SectionHeading title="What's been happening" />
        <LifecycleActivity
          actions={overview.recentActions}
          insights={overview.insights}
          movements={overview.movements}
        />
      </section>

      </>
      )}

      <LifecycleSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={overview.settings}
        onSaved={() => void load({ silent: true })}
        onNotice={setNotice}
      />
    </div>
  );
}

// ── Settings dialog ──────────────────────────────────────────

function LifecycleSettingsDialog({
  open,
  onOpenChange,
  settings,
  onSaved,
  onNotice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: LifecycleOverview["settings"];
  onSaved: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const [frequencyCap, setFrequencyCap] = React.useState(String(settings.frequency_cap_days));
  const [holdout, setHoldout] = React.useState(String(settings.holdout_percent));
  const [attributionWindow, setAttributionWindow] = React.useState(
    String(settings.attribution_window_days),
  );
  const [saving, setSaving] = React.useState(false);
  const [pausing, setPausing] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setFrequencyCap(String(settings.frequency_cap_days));
    setHoldout(String(settings.holdout_percent));
    setAttributionWindow(String(settings.attribution_window_days));
  }, [open, settings]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/store/crm/lifecycle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frequency_cap_days: Number(frequencyCap),
          holdout_percent: Number(holdout),
          attribution_window_days: Number(attributionWindow),
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      onNotice({ kind: "success", text: "Settings saved." });
      onSaved();
      onOpenChange(false);
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const pauseEverything = async () => {
    setPausing(true);
    try {
      const res = await fetch("/api/store/crm/lifecycle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_enabled: false }),
      });
      if (!res.ok) throw new Error("Pause failed");
      onNotice({
        kind: "success",
        text: "Everything is paused — nothing will be prepared or sent until you turn it back on.",
      });
      onSaved();
      onOpenChange(false);
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Pause failed" });
    } finally {
      setPausing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-md bg-white">
        <DialogHeader>
          <DialogTitle>Lifecycle settings</DialogTitle>
          <DialogDescription>
            These guardrails apply to everything the engine does — and the email limit also counts
            campaigns you send yourself.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Days between emails to the same customer</Label>
            <Input
              type="number"
              min={1}
              max={60}
              value={frequencyCap}
              onChange={(e) => setFrequencyCap(e.target.value)}
              className="mt-1 h-9"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              7 means no customer hears from you more than once a week, no matter what.
            </p>
          </div>
          <div>
            <Label className="text-xs">Control group (% left out of each send)</Label>
            <Input
              type="number"
              min={0}
              max={50}
              value={holdout}
              onChange={(e) => setHoldout(e.target.value)}
              className="mt-1 h-9"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              This is how the engine proves the extra sales are real. 10% is a good default.
            </p>
          </div>
          <div>
            <Label className="text-xs">Days of sales counted after each email</Label>
            <Input
              type="number"
              min={1}
              max={90}
              value={attributionWindow}
              onChange={(e) => setAttributionWindow(e.target.value)}
              className="mt-1 h-9"
            />
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-red-700 hover:text-red-700"
            onClick={() => void pauseEverything()}
            disabled={pausing || saving}
          >
            {pausing ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            Pause everything
          </Button>
          <Button size="sm" className="rounded-full" onClick={() => void save()} disabled={saving || pausing}>
            {saving ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
