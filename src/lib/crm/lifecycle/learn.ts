// The learning loop: turn matured results into lessons the engine
// actually applies.
//
// Two mechanisms, both grounded in real data:
// 1. Send-hour tuning — the store's median historical open hour is stored
//    in settings.learned.send_hour; the engine only auto-sends inside a
//    window around it.
// 2. Program lessons — once an action's attribution window has matured,
//    its results (open rate, conversions vs holdout, unsubscribes) are
//    summarised into a crm_lifecycle_insights row. Active lessons are
//    injected into the next compose call for that program, closing the loop.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CRM_AGENT_MODEL,
  extractOutputText,
  getCrmOpenAI,
  parseJsonFromModel,
} from "../agent/openai";
import { markLifecycleEngineState } from "./settings";
import type { LifecycleSettings } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Median local open hour across recent campaign opens (fallback 10am). */
export async function learnSendHour(
  supabase: SupabaseClient,
  userId: string,
  settings: LifecycleSettings,
): Promise<number> {
  const since = new Date(Date.now() - 90 * DAY_MS).toISOString();
  const { data } = await supabase
    .from("crm_campaign_recipients")
    .select("opened_at")
    .eq("user_id", userId)
    .not("opened_at", "is", null)
    .gte("opened_at", since)
    .limit(5_000);

  const hours: number[] = [];
  for (const row of data ?? []) {
    const opened = new Date(String(row.opened_at));
    if (Number.isNaN(opened.getTime())) continue;
    try {
      const hour = parseInt(
        new Intl.DateTimeFormat("en-AU", {
          timeZone: settings.timezone,
          hour: "numeric",
          hour12: false,
        }).format(opened),
        10,
      );
      if (Number.isFinite(hour)) hours.push(hour);
    } catch {
      // bad timezone — fall through to default
    }
  }

  let sendHour = 10;
  if (hours.length >= 30) {
    hours.sort((a, b) => a - b);
    const median = hours[Math.floor(hours.length / 2)];
    // Clamp into working hours so an evening-opener store still sends at a
    // respectable time rather than 10pm.
    sendHour = Math.min(17, Math.max(8, median));
  }

  if (settings.learned.send_hour !== sendHour) {
    await markLifecycleEngineState(supabase, userId, {
      learned: { ...settings.learned, send_hour: sendHour },
    });
  }
  return sendHour;
}

type MaturedAction = {
  id: string;
  program_key: string;
  subject: string;
  contact_count: number;
  holdout_count: number;
  executed_at: string;
  campaign: {
    sent_count?: number;
    delivered_count?: number;
    opened_count?: number;
    clicked_count?: number;
  } | null;
};

const LESSON_INSTRUCTIONS = `You write ONE short lesson for a bike store's automated lifecycle email engine, based on the measured result of a single program send. The lesson will be injected into the prompt that writes this program's NEXT email, so make it actionable copy/cadence guidance, not a report. Rules:
- One or two sentences, plain Australian English, no emoji, no percentages beyond one decimal.
- Ground it only in the numbers provided. Never invent causes.
- If results were strong, say what to keep doing. If weak, say what to change.
- Return JSON: {"title": string (≤60 chars), "lesson": string}.`;

/**
 * Generate lessons for sent actions whose attribution window has matured
 * and which don't yet have an insight. Cheap and idempotent.
 */
export async function generateProgramLessons(
  supabase: SupabaseClient,
  userId: string,
  settings: LifecycleSettings,
): Promise<{ created: number }> {
  const maturedBefore = new Date(
    Date.now() - settings.attribution_window_days * DAY_MS,
  ).toISOString();

  const [{ data: actionRows }, { data: insightRows }] = await Promise.all([
    supabase
      .from("crm_lifecycle_actions")
      .select(
        "id, program_key, subject, contact_count, holdout_count, executed_at, campaign:crm_campaigns(sent_count, delivered_count, opened_count, clicked_count)",
      )
      .eq("user_id", userId)
      .eq("status", "sent")
      .lt("executed_at", maturedBefore)
      .order("executed_at", { ascending: false })
      .limit(20),
    supabase
      .from("crm_lifecycle_insights")
      .select("evidence")
      .eq("user_id", userId)
      .limit(200),
  ]);

  const coveredActionIds = new Set(
    (insightRows ?? [])
      .map((row) => String((row.evidence as Record<string, unknown>)?.action_id ?? ""))
      .filter(Boolean),
  );

  let created = 0;
  for (const raw of (actionRows ?? []) as unknown as MaturedAction[]) {
    if (coveredActionIds.has(raw.id)) continue;

    // Touch outcomes for this action.
    const { data: touchRows } = await supabase
      .from("crm_lifecycle_touches")
      .select("is_holdout, attributed_revenue, attributed_sale_count, unsubscribed, reactivated")
      .eq("user_id", userId)
      .eq("action_id", raw.id)
      .limit(2_000);

    let liveCount = 0;
    let liveRevenue = 0;
    let liveConversions = 0;
    let holdoutCount = 0;
    let holdoutRevenue = 0;
    let unsubs = 0;
    let reactivations = 0;
    for (const t of touchRows ?? []) {
      const revenue = Number(t.attributed_revenue ?? 0);
      if (t.is_holdout) {
        holdoutCount += 1;
        holdoutRevenue += revenue;
      } else {
        liveCount += 1;
        liveRevenue += revenue;
        if (Number(t.attributed_sale_count ?? 0) > 0) liveConversions += 1;
        if (t.unsubscribed) unsubs += 1;
        if (t.reactivated) reactivations += 1;
      }
    }
    if (liveCount === 0) continue;

    const delivered =
      Number(raw.campaign?.delivered_count ?? 0) || Number(raw.campaign?.sent_count ?? 0);
    const openRate = delivered > 0 ? Number(raw.campaign?.opened_count ?? 0) / delivered : null;
    const clickRate = delivered > 0 ? Number(raw.campaign?.clicked_count ?? 0) / delivered : null;
    const baseline = holdoutCount > 0 ? (holdoutRevenue / holdoutCount) * liveCount : 0;
    const incremental = Math.round((liveRevenue - baseline) * 100) / 100;
    const unsubRate = unsubs / liveCount;

    const evidence = {
      action_id: raw.id,
      subject: raw.subject,
      live_count: liveCount,
      holdout_count: holdoutCount,
      open_rate: openRate,
      click_rate: clickRate,
      conversions: liveConversions,
      attributed_revenue: Math.round(liveRevenue * 100) / 100,
      holdout_baseline: Math.round(baseline * 100) / 100,
      incremental_revenue: incremental,
      unsubscribes: unsubs,
      reactivations,
    };

    // Deterministic fallback lesson; LLM phrases it better when available.
    let title = `${raw.program_key}: ${incremental > 0 ? "positive" : "flat"} lift`;
    let lesson =
      incremental > 0
        ? `The last send ("${raw.subject}") produced $${incremental.toLocaleString()} incremental revenue from ${liveCount} emails — keep the same tone and framing.`
        : `The last send ("${raw.subject}") showed no measurable lift over the control group — try a different angle or subject style next time.`;
    if (unsubRate > 0.01) {
      title = `${raw.program_key}: unsubscribes above 1%`;
      lesson = `The last send ("${raw.subject}") cost ${unsubs} unsubscribes from ${liveCount} emails — soften the pitch and reduce urgency next time.`;
    }

    if (process.env.OPENAI_API_KEY) {
      try {
        const openai = getCrmOpenAI();
        const response = await openai.responses.create({
          model: CRM_AGENT_MODEL,
          instructions: LESSON_INSTRUCTIONS,
          input: JSON.stringify({ program: raw.program_key, result: evidence }),
        });
        const parsed = parseJsonFromModel<{ title: string; lesson: string }>(
          extractOutputText(response),
        );
        if (parsed?.lesson?.trim()) {
          title = parsed.title?.trim().slice(0, 60) || title;
          lesson = parsed.lesson.trim();
        }
      } catch (error) {
        console.error("[lifecycle/learn] lesson phrasing failed, using fallback:", error);
      }
    }

    // Newest lesson per program supersedes older ones so compose stays focused.
    await supabase
      .from("crm_lifecycle_insights")
      .update({ status: "superseded" })
      .eq("user_id", userId)
      .eq("program_key", raw.program_key)
      .eq("kind", "lesson")
      .eq("status", "active");

    const { error } = await supabase.from("crm_lifecycle_insights").insert({
      user_id: userId,
      program_key: raw.program_key,
      kind: unsubRate > 0.01 ? "cadence" : "lesson",
      title,
      detail: lesson,
      evidence,
      status: "active",
    });
    if (!error) created += 1;
  }

  return { created };
}
