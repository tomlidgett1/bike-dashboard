// The lifecycle engine tick — sense → classify → plan → act → prove → learn
// for one store, plus the multi-store cron entry point.
//
// Called every 5 minutes by the crm-automation cron; internal gating keeps
// the real work to: classification every ~6h, planning once a day inside
// the store's learned send window, attribution every ~6h, lessons daily.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { classifyStore } from "./classify";
import { loadLifecyclePrograms } from "./programs";
import { expireStaleActions, planProgramAction } from "./planner";
import { executeLifecycleAction } from "./execute";
import { refreshLifecycleAttribution } from "./attribution";
import { generateProgramLessons, learnSendHour } from "./learn";
import { loadLifecycleSettings, markLifecycleEngineState } from "./settings";
import type { LifecycleSettings } from "./types";

const HOUR_MS = 60 * 60 * 1000;
const CLASSIFY_EVERY_MS = 6 * HOUR_MS;
const ATTRIBUTE_EVERY_MS = 6 * HOUR_MS;
const PLAN_EVERY_MS = 20 * HOUR_MS;

export type LifecycleTickSummary = {
  userId: string;
  classified: boolean;
  stageChanges: number;
  planned: number;
  autoSent: number;
  attributed: boolean;
  lessonsCreated: number;
  skippedReason?: string;
};

function localHour(timezone: string, now: Date): number {
  try {
    const hour = parseInt(
      new Intl.DateTimeFormat("en-AU", { timeZone: timezone, hour: "numeric", hour12: false }).format(now),
      10,
    );
    return Number.isFinite(hour) ? hour : now.getUTCHours();
  } catch {
    return now.getUTCHours();
  }
}

function isStale(timestamp: string | null, maxAgeMs: number, now: Date): boolean {
  if (!timestamp) return true;
  const t = new Date(timestamp).getTime();
  return !Number.isFinite(t) || now.getTime() - t > maxAgeMs;
}

export async function runLifecycleTickForStore(
  supabase: SupabaseClient,
  userId: string,
  options: { force?: boolean } = {},
): Promise<LifecycleTickSummary> {
  const now = new Date();
  const summary: LifecycleTickSummary = {
    userId,
    classified: false,
    stageChanges: 0,
    planned: 0,
    autoSent: 0,
    attributed: false,
    lessonsCreated: 0,
  };

  const settings = await loadLifecycleSettings(supabase, userId);
  if (!settings.is_enabled && !options.force) {
    summary.skippedReason = "disabled";
    return summary;
  }

  // 1. Classify (stage assignment + transitions + daily snapshot).
  if (options.force || isStale(settings.last_classified_at, CLASSIFY_EVERY_MS, now)) {
    const result = await classifyStore(supabase, userId, settings, now);
    summary.classified = true;
    summary.stageChanges = result.changed;
  }

  // 2. Attribution + lessons (prove → learn).
  if (options.force || isStale(settings.last_attributed_at, ATTRIBUTE_EVERY_MS, now)) {
    await refreshLifecycleAttribution(supabase, userId, settings);
    summary.attributed = true;
    const lessons = await generateProgramLessons(supabase, userId, settings);
    summary.lessonsCreated = lessons.created;
  }

  // 3. Plan + auto-execute, once a day inside the send window.
  const sendHour = settings.learned.send_hour ?? 10;
  const hour = localHour(settings.timezone, now);
  const inSendWindow = hour >= sendHour && hour <= 19;
  const planDue = isStale(settings.last_planned_at, PLAN_EVERY_MS, now);

  if (options.force || (settings.is_enabled && planDue && inSendWindow)) {
    await expireStaleActions(supabase, userId);
    // Refresh the learned send hour once per planning day.
    await learnSendHour(supabase, userId, settings);

    const programs = await loadLifecyclePrograms(supabase, userId);
    for (const program of programs.filter((p) => p.enabled)) {
      try {
        const planned = await planProgramAction(supabase, userId, settings, program);
        if (!planned) continue;
        summary.planned += 1;

        if (program.mode === "auto") {
          try {
            await executeLifecycleAction(supabase, userId, planned.actionId);
            summary.autoSent += 1;
          } catch (error) {
            console.error(
              `[lifecycle/engine] auto-send failed for ${program.key}:`,
              error instanceof Error ? error.message : error,
            );
          }
        }
      } catch (error) {
        console.error(
          `[lifecycle/engine] planning failed for ${program.key}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
    await markLifecycleEngineState(supabase, userId, { last_planned_at: now.toISOString() });
  }

  return summary;
}

export type LifecycleCronSummary = {
  storesProcessed: number;
  planned: number;
  autoSent: number;
  errors: string[];
};

/** Cron entry: tick the (few) stores with the lifecycle engine enabled. */
export async function processLifecycleStores(): Promise<LifecycleCronSummary> {
  const supabase = createServiceRoleClient();
  const summary: LifecycleCronSummary = {
    storesProcessed: 0,
    planned: 0,
    autoSent: 0,
    errors: [],
  };

  const { data: rows, error } = await supabase
    .from("crm_lifecycle_settings")
    .select("user_id")
    .eq("is_enabled", true)
    .order("last_planned_at", { ascending: true, nullsFirst: true })
    .limit(3);
  if (error) {
    summary.errors.push(error.message);
    return summary;
  }

  for (const row of rows ?? []) {
    const userId = String((row as Partial<LifecycleSettings>).user_id);
    try {
      const tick = await runLifecycleTickForStore(supabase, userId);
      summary.storesProcessed += 1;
      summary.planned += tick.planned;
      summary.autoSent += tick.autoSent;
    } catch (err) {
      summary.errors.push(
        `${userId}: ${err instanceof Error ? err.message : "tick failed"}`,
      );
    }
  }

  return summary;
}
