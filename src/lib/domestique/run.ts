// The Domestique nightly loop: sense → think → act → (prove happens in
// attribution.ts) for a single store.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DomestiqueConfig,
  DomestiqueOpportunity,
} from "@/lib/types/domestique";
import { buildDetectorContext, runDetectors, type DetectedOpportunity } from "./detectors";
import { composeActionPlan, loadComposeContext } from "./compose";
import { applyContactGuardrails, fetchRecentlyTouchedContactIds } from "./guardrails";
import { getPlaybook } from "./playbooks";
import { executeOpportunity } from "./execute";
import { sendMorningBrief } from "./brief";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RunSummary {
  runId: string;
  detectorsRun: number;
  found: number;
  proposed: number;
  autoExecuted: number;
  briefSent: boolean;
}

/** Playbooks that proposed (non-terminal) recently are on cooldown. */
async function fetchPlaybooksOnCooldown(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const maxCooldown = 14;
  const since = new Date(Date.now() - maxCooldown * DAY_MS).toISOString();
  const { data, error } = await supabase
    .from("domestique_opportunities")
    .select("playbook_key, created_at, status")
    .eq("user_id", userId)
    .gte("created_at", since)
    .limit(500);
  if (error) {
    console.error("[domestique/run] cooldown fetch failed:", error.message);
    return new Set();
  }

  const onCooldown = new Set<string>();
  const now = Date.now();
  for (const row of (data ?? []) as Array<{ playbook_key: string; created_at: string; status: string }>) {
    const playbook = getPlaybook(row.playbook_key);
    if (!playbook) continue;
    const age = now - new Date(row.created_at).getTime();
    if (age < playbook.cooldown_days * DAY_MS) onCooldown.add(row.playbook_key);
  }
  return onCooldown;
}

/** End of the store's local day, used as the approval deadline. */
function endOfLocalDay(timezone: string, now: Date): Date {
  try {
    const formatter = new Intl.DateTimeFormat("en-AU", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    const localHour = parseInt(formatter.format(now), 10);
    const hoursLeft = Math.max(1, 24 - (Number.isFinite(localHour) ? localHour : 0));
    return new Date(now.getTime() + hoursLeft * 60 * 60 * 1000);
  } catch {
    return new Date(now.getTime() + 20 * 60 * 60 * 1000);
  }
}

/** Expire stale proposals from previous days. */
async function expireStaleProposals(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase
    .from("domestique_opportunities")
    .update({ status: "expired", status_detail: "Approval window lapsed" })
    .eq("user_id", userId)
    .eq("status", "proposed")
    .lt("expires_at", new Date().toISOString());
}

/** Run the full nightly loop for one store. */
export async function runDomestiqueForStore(
  supabase: SupabaseClient,
  userId: string,
  config: DomestiqueConfig,
  trigger: "cron" | "manual" = "cron",
): Promise<RunSummary> {
  const now = new Date();

  const { data: runRow, error: runError } = await supabase
    .from("domestique_runs")
    .insert({ user_id: userId, status: "running", trigger })
    .select("id")
    .single();
  if (runError || !runRow) throw runError ?? new Error("Could not create run");
  const runId = String(runRow.id);

  try {
    await expireStaleProposals(supabase, userId);

    const [ctx, recentlyTouched, onCooldown, composeCtx] = await Promise.all([
      buildDetectorContext(supabase, userId, config, now),
      fetchRecentlyTouchedContactIds(supabase, userId, config.contact_cooldown_days),
      fetchPlaybooksOnCooldown(supabase, userId),
      loadComposeContext(supabase, userId),
    ]);

    const rawFindings = await runDetectors(ctx);

    // Guardrails: cooldowns + contact budget + holdout split, then re-check viability.
    const viable: DetectedOpportunity[] = [];
    for (const found of rawFindings) {
      if (onCooldown.has(found.playbook_key)) continue;
      const contacts = applyContactGuardrails(found.contacts, recentlyTouched, config);
      const liveCount = contacts.filter((c) => !c.is_holdout).length;
      const isDiscountPlay = (found.discounts?.length ?? 0) > 0;
      if (!isDiscountPlay && liveCount < 2) continue;
      viable.push({ ...found, contacts });
    }

    // Score: expected value × confidence, best plays first, capped per day.
    viable.sort((a, b) => b.expected_value * b.confidence - a.expected_value * a.confidence);
    const plays = viable.slice(0, config.max_plays_per_day);

    const expiresAt = endOfLocalDay(config.timezone, now).toISOString();
    const autopilot = new Set(config.autopilot_playbooks);
    const proposed: DomestiqueOpportunity[] = [];
    let autoExecuted = 0;

    for (const play of plays) {
      const actionPlan = await composeActionPlan(play, composeCtx);
      const liveContacts = (actionPlan.contacts ?? []).filter((c) => !c.is_holdout);

      const { data: inserted, error: insertError } = await supabase
        .from("domestique_opportunities")
        .insert({
          user_id: userId,
          run_id: runId,
          playbook_key: play.playbook_key,
          title: play.title,
          summary: play.summary,
          evidence: play.evidence,
          action_plan: actionPlan,
          expected_value: play.expected_value,
          confidence: play.confidence,
          customer_count: liveContacts.length,
          product_count: actionPlan.discounts?.length ?? 0,
          status: "proposed",
          expires_at: expiresAt,
        })
        .select("*")
        .single();
      if (insertError || !inserted) {
        console.error("[domestique/run] opportunity insert failed:", insertError?.message);
        continue;
      }

      const opportunity = inserted as DomestiqueOpportunity;
      proposed.push(opportunity);

      const shouldAutoExecute =
        config.mode === "autopilot" && autopilot.has(play.playbook_key) && trigger === "cron";
      if (shouldAutoExecute) {
        await supabase
          .from("domestique_opportunities")
          .update({ status: "executing", approved_at: new Date().toISOString() })
          .eq("id", opportunity.id)
          .eq("user_id", userId);
        try {
          await executeOpportunity(supabase, userId, config, opportunity);
          autoExecuted += 1;
        } catch (error) {
          console.error("[domestique/run] autopilot execution failed:", error);
          await supabase
            .from("domestique_opportunities")
            .update({
              status: "failed",
              status_detail: error instanceof Error ? error.message : "Execution failed",
            })
            .eq("id", opportunity.id)
            .eq("user_id", userId);
        }
      }
    }

    // Morning brief — one text with today's plays (copilot/suggest modes).
    let briefSent = false;
    if (proposed.length > 0 && config.send_brief_via_nest && config.brief_phone) {
      briefSent = await sendMorningBrief(supabase, userId, config, proposed);
      if (briefSent) {
        await supabase
          .from("domestique_config")
          .update({ last_brief_sent_at: new Date().toISOString() })
          .eq("user_id", userId);
      }
    }

    await supabase
      .from("domestique_runs")
      .update({
        status: "completed",
        detectors_run: config.enabled_playbooks.length,
        opportunities_found: rawFindings.length,
        opportunities_proposed: proposed.length,
        auto_executed: autoExecuted,
        finished_at: new Date().toISOString(),
        summary: {
          playbooks: proposed.map((p) => p.playbook_key),
          expected_value_total: proposed.reduce((sum, p) => sum + Number(p.expected_value), 0),
          brief_sent: briefSent,
        },
      })
      .eq("id", runId);

    await supabase
      .from("domestique_config")
      .update({ last_run_at: new Date().toISOString() })
      .eq("user_id", userId);

    return {
      runId,
      detectorsRun: config.enabled_playbooks.length,
      found: rawFindings.length,
      proposed: proposed.length,
      autoExecuted,
      briefSent,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Run failed";
    await supabase
      .from("domestique_runs")
      .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
      .eq("id", runId);
    throw error;
  }
}
