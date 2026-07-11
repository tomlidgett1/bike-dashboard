"use client";

// Campaign setup — a simple list, then one page per campaign.
//
// The list answers one question: what runs, and is it on?
// Each campaign's own page holds everything about it — what it does, the
// email it sends, when it fires, and its results — one section at a time.

import * as React from "react";
import {
  AltArrowLeft,
  AltArrowRight,
  MagicStick3,
  Pen,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { renderCampaignEmail, type StoreBranding } from "@/lib/crm/templates";
import { applyMergeTags } from "@/lib/crm/merge-tags";
import { buildPremadeTemplates } from "@/lib/crm/premade-templates";
import type { CrmEmailTemplateRecord } from "@/lib/crm/agent/chat-types";
import { PROGRAM_DEFINITIONS } from "@/lib/crm/lifecycle/programs";
import {
  mergeDraftOntoTemplateContent,
  readProgramAbConfig,
  readProgramCustomEmail,
} from "@/lib/crm/lifecycle/template-config";
import type { LifecycleOverview } from "@/lib/crm/lifecycle/overview";
import type {
  LifecycleAction,
  LifecycleEmailDraft,
  LifecycleOfferPolicy,
  LifecycleProgram,
} from "@/lib/crm/lifecycle/types";
import { formatMoney, formatRate, STAGE_LABELS, STAGE_PLAIN } from "./lifecycle-shared";
import { LifecycleDesigner } from "./lifecycle-designer";

type Notice = { kind: "success" | "error"; text: string };
type ProgramWithExtras = LifecycleOverview["programs"][number];

/** Best seed for the designer: saved design → latest composed email. */
function seedEmailFor(
  program: LifecycleProgram,
  actions: LifecycleAction[],
): LifecycleEmailDraft | null {
  const custom = readProgramCustomEmail(program);
  if (custom) {
    return {
      subject: custom.subject,
      title: String(custom.content.title ?? custom.subject),
      body: String(custom.content.body ?? ""),
      ctaText: custom.content.ctaText,
      ctaUrl: custom.content.ctaUrl,
      templateKey: custom.templateKey,
      templateLabel: custom.templateLabel ?? "Your design",
      content: custom.content,
    };
  }
  const latest = actions.find((a) => a.program_key === program.key && a.payload?.email);
  return latest?.payload.email ?? null;
}

export function LifecycleSetup({
  programs,
  actions,
  store,
  onChanged,
  onNotice,
}: {
  programs: ProgramWithExtras[];
  actions: LifecycleAction[];
  store: StoreBranding;
  onChanged: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const openProgram = programs.find((p) => p.key === openKey) ?? null;

  if (openProgram) {
    return (
      <CampaignPage
        program={openProgram}
        actions={actions}
        store={store}
        onBack={() => setOpenKey(null)}
        onChanged={onChanged}
        onNotice={onNotice}
      />
    );
  }

  const liveCount = programs.filter((p) => p.enabled).length;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold tracking-[-0.01em] text-foreground">
            Your campaigns
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            One for each customer group. Tap one to control everything about it.
          </p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {liveCount} of {programs.length} live
        </span>
      </div>
      <ul className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-white">
        {programs.map((program) => {
          const definition = PROGRAM_DEFINITIONS.find((d) => d.key === program.key);
          const statusText = !program.enabled
            ? "Off"
            : program.mode === "auto"
              ? "On · sends automatically"
              : "On · asks you first";
          return (
            <li key={program.id}>
              <button
                type="button"
                onClick={() => setOpenKey(program.key)}
                className="flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-gray-50/70"
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    program.enabled ? "bg-emerald-500" : "bg-gray-300",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">
                    {program.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {definition?.objective ?? program.description}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{statusText}</span>
                <AltArrowRight className="size-4 shrink-0 text-gray-400" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// One campaign, one page
// ─────────────────────────────────────────────────────────────

function SectionCard({
  title,
  children,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-5 py-3">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {aside}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function CampaignPage({
  program,
  actions,
  store,
  onBack,
  onChanged,
  onNotice,
}: {
  program: ProgramWithExtras;
  actions: LifecycleAction[];
  store: StoreBranding;
  onBack: () => void;
  onChanged: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const definition = PROGRAM_DEFINITIONS.find((d) => d.key === program.key);
  const custom = readProgramCustomEmail(program);
  const ab = readProgramAbConfig(program);
  const stats = program.stats;

  const [busy, setBusy] = React.useState(false);
  const [designerOpen, setDesignerOpen] = React.useState(false);
  const [savedTemplates, setSavedTemplates] = React.useState<CrmEmailTemplateRecord[]>([]);
  const premadeTemplates = React.useMemo(() => buildPremadeTemplates(store), [store]);
  const [entryDelay, setEntryDelay] = React.useState(String(program.entry_delay_days));
  const [cooldown, setCooldown] = React.useState(String(program.cooldown_days));
  const [abSubjectB, setAbSubjectB] = React.useState(ab.subject_b);

  React.useEffect(() => {
    setEntryDelay(String(program.entry_delay_days));
    setCooldown(String(program.cooldown_days));
  }, [program.entry_delay_days, program.cooldown_days]);

  React.useEffect(() => {
    setAbSubjectB(readProgramAbConfig(program).subject_b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program.id]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/store/crm/templates", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setSavedTemplates(data.templates ?? []);
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = async (body: Record<string, unknown>, successText?: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/store/crm/lifecycle/programs/${program.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({})))?.error || "Update failed");
      }
      if (successText) onNotice({ kind: "success", text: successText });
      onChanged();
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Update failed" });
    } finally {
      setBusy(false);
    }
  };

  const commitTiming = () => {
    const nextDelay = Math.max(0, Math.round(Number(entryDelay) || 0));
    const nextCooldown = Math.max(7, Math.round(Number(cooldown) || 7));
    if (nextDelay === program.entry_delay_days && nextCooldown === program.cooldown_days) return;
    void patch({ entry_delay_days: nextDelay, cooldown_days: nextCooldown }, "Timing updated.");
  };

  const previewEmail = seedEmailFor(program, actions);
  const previewHtml = React.useMemo(() => {
    if (!previewEmail) return null;
    const { html } = renderCampaignEmail({
      templateKey: previewEmail.templateKey,
      content: mergeDraftOntoTemplateContent(previewEmail, previewEmail.content),
      store,
      unsubscribeUrl: "https://example.com/unsubscribe-preview",
    });
    return applyMergeTags(html, { firstName: null });
  }, [previewEmail, store]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      {/* Back + header */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <AltArrowLeft className="size-3.5" />
          All campaigns
        </button>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-xl font-semibold tracking-[-0.01em] text-foreground">
              {program.name}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              For customers who {STAGE_PLAIN[program.stage].toLowerCase()} (
              {STAGE_LABELS[program.stage]}). {definition?.objective ?? program.description}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 pt-1">
            <Switch
              checked={program.enabled}
              disabled={busy}
              onCheckedChange={(checked) =>
                void patch(
                  { enabled: checked },
                  checked ? `${program.name} is live.` : `${program.name} is off.`,
                )
              }
              aria-label={`Turn ${program.name} on or off`}
            />
            <span className="text-[11px] text-muted-foreground">
              {program.enabled ? "Live" : "Off"}
            </span>
          </div>
        </div>
      </div>

      {/* The email */}
      <SectionCard
        title="The email it sends"
        aside={
          <Button size="sm" className="rounded-full" onClick={() => setDesignerOpen(true)}>
            {custom ? <Pen className="mr-1.5 size-3.5" /> : <MagicStick3 className="mr-1.5 size-3.5" />}
            {custom ? "Edit design" : "Design it"}
          </Button>
        }
      >
        <p className="text-xs text-muted-foreground">
          {custom
            ? "Your saved design goes out exactly like this, every send."
            : "You haven't designed this one, so the AI writes it fresh each send in your store's voice — and improves it from results. Design it yourself to take full control."}
        </p>
        {previewHtml ? (
          <button
            type="button"
            onClick={() => setDesignerOpen(true)}
            className="mt-3 block w-full overflow-hidden rounded-lg border border-border/60 bg-white text-left shadow-sm transition-opacity hover:opacity-85"
            aria-label="Open the email designer"
          >
            <iframe
              title={`${program.name} email preview`}
              sandbox=""
              srcDoc={previewHtml}
              tabIndex={-1}
              className="pointer-events-none h-[420px] w-full bg-white"
            />
          </button>
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-border bg-gray-50/60 px-4 py-8 text-center text-xs text-muted-foreground">
            The first email appears here after the next engine check — or design it now.
          </div>
        )}
      </SectionCard>

      {/* How it runs */}
      <SectionCard title="How it runs">
        <div className="divide-y divide-border/40">
          <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
            <div>
              <p className="text-sm text-foreground">Before it sends</p>
              <p className="text-xs text-muted-foreground">
                Ask first shows you every email; Automatic sends on its own.
              </p>
            </div>
            <div className="flex shrink-0 items-center rounded-full bg-gray-100 p-0.5">
              {(["review", "auto"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    program.mode !== mode &&
                    void patch(
                      { mode },
                      mode === "auto"
                        ? `${program.name} now sends automatically.`
                        : `${program.name} now asks you first.`,
                    )
                  }
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    program.mode === mode
                      ? "bg-white text-gray-800 shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/70",
                  )}
                >
                  {mode === "review" ? "Ask first" : "Automatic"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm text-foreground">Wait after a customer qualifies</p>
              <p className="text-xs text-muted-foreground">
                Days between entering {STAGE_LABELS[program.stage]} and getting this email.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Input
                type="number"
                min={0}
                max={90}
                value={entryDelay}
                onChange={(e) => setEntryDelay(e.target.value)}
                onBlur={commitTiming}
                className="h-8 w-16 text-sm"
                disabled={busy}
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm text-foreground">Never repeat within</p>
              <p className="text-xs text-muted-foreground">
                The same customer can't get this email twice inside this window.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Input
                type="number"
                min={7}
                max={365}
                value={cooldown}
                onChange={(e) => setCooldown(e.target.value)}
                onBlur={commitTiming}
                className="h-8 w-16 text-sm"
                disabled={busy}
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
            <div>
              <p className="text-sm text-foreground">Discounts</p>
              <p className="text-xs text-muted-foreground">
                Whether the copy is allowed to include a sweetener.
              </p>
            </div>
            <select
              value={program.offer_policy}
              disabled={busy}
              onChange={(e) => void patch({ offer_policy: e.target.value }, "Updated.")}
              className="h-8 shrink-0 rounded-md border border-border/60 bg-white px-2 text-xs"
            >
              <option value="none">Never</option>
              <option value="soft">Small sweetener OK</option>
              <option value="winback">Win-back offer OK</option>
            </select>
          </div>
        </div>
      </SectionCard>

      {/* Subject test */}
      <SectionCard
        title="Test two subject lines"
        aside={
          <Switch
            checked={ab.enabled}
            disabled={busy}
            onCheckedChange={(checked) => {
              if (checked && !abSubjectB.trim()) {
                onNotice({ kind: "error", text: "Add a second subject line first." });
                return;
              }
              void patch(
                { config: { ab: { enabled: checked, subject_b: abSubjectB.trim() } } },
                checked ? "Subject test is on — each send splits 50/50." : "Subject test is off.",
              );
            }}
            aria-label="Toggle subject line test"
          />
        }
      >
        <p className="text-xs text-muted-foreground">
          Each send splits the audience 50/50 between your subject line and this one, so you learn
          what your customers actually open.
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            value={abSubjectB}
            onChange={(e) => setAbSubjectB(e.target.value)}
            placeholder="Second subject line to test"
            className="h-9 flex-1"
            disabled={busy}
          />
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={busy || abSubjectB.trim() === ab.subject_b}
            onClick={() =>
              void patch(
                { config: { ab: { enabled: ab.enabled, subject_b: abSubjectB.trim() } } },
                "Saved.",
              )
            }
          >
            Save
          </Button>
        </div>
        {program.abLast ? (
          <p className="mt-3 text-xs tabular-nums text-muted-foreground">
            Last test: “{program.abLast.subject_a}” {formatRate(program.abLast.a_open_rate)} opens
            vs “{program.abLast.subject_b}” {formatRate(program.abLast.b_open_rate)} —{" "}
            {program.abLast.a_open_rate != null && program.abLast.b_open_rate != null
              ? Math.abs(program.abLast.a_open_rate - program.abLast.b_open_rate) < 0.02
                ? "too close to call."
                : program.abLast.b_open_rate > program.abLast.a_open_rate
                  ? "the test subject won."
                  : "your subject won."
              : "results still coming in."}
          </p>
        ) : null}
      </SectionCard>

      {/* Why it exists */}
      {definition ? (
        <SectionCard title="Why this campaign exists">
          <p className="text-sm leading-relaxed text-foreground">{definition.why}</p>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            How it decides who gets it
          </p>
          <ul className="mt-1.5 space-y-1">
            {definition.mechanics.map((line, index) => (
              <li key={index} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                <span className="mt-[7px] size-1 shrink-0 rounded-full bg-gray-400" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {/* Results */}
      <SectionCard title="Results so far">
        {stats && stats.emails_sent > 0 ? (
          <p className="text-sm leading-relaxed text-foreground">
            {stats.emails_sent.toLocaleString()} emails sent · {formatRate(stats.open_rate)}{" "}
            opened · {stats.conversions.toLocaleString()} customer
            {stats.conversions === 1 ? "" : "s"} bought something ·{" "}
            <span className="font-semibold">{formatMoney(stats.incremental_revenue)}</span> in
            extra sales beyond the control group
            {stats.unsubscribes > 0 ? ` · ${stats.unsubscribes} unsubscribed` : ""}.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nothing sent yet — results land here about a week after the first send, measured
            honestly against customers who were deliberately left out.
          </p>
        )}
      </SectionCard>

      <LifecycleDesigner
        program={program}
        seedEmail={previewEmail}
        store={store}
        savedTemplates={savedTemplates}
        premadeTemplates={premadeTemplates}
        open={designerOpen}
        onOpenChange={setDesignerOpen}
        onSaved={onChanged}
        onNotice={onNotice}
      />
    </div>
  );
}
