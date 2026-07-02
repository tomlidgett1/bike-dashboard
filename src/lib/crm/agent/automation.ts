// Process due CRM scheduled campaigns (cron).

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { orchestrateCrmAgent } from "./orchestrate";
import { createCampaignFromAgent } from "./create-campaign";
import { sendCrmCampaign } from "../send-campaign";
import type { AudienceRule } from "./types";

export type AutomationSummary = {
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
};

function nextScheduledAt(current: Date, scheduleType: string): Date {
  const next = new Date(current);
  if (scheduleType === "weekly") {
    next.setDate(next.getDate() + 7);
  } else if (scheduleType === "monthly") {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

async function runSchedule(
  supabase: SupabaseClient,
  schedule: {
    id: string;
    user_id: string;
    name: string;
    prompt: string | null;
    preset_id: string | null;
    schedule_type: string;
    scheduled_at: string;
    auto_send: boolean;
  },
): Promise<void> {
  let presetRules: AudienceRule[] | undefined;
  let prompt = schedule.prompt?.trim() ?? "";

  if (schedule.preset_id) {
    const { data: preset } = await supabase
      .from("crm_audience_presets")
      .select("prompt, audience_rules")
      .eq("id", schedule.preset_id)
      .eq("user_id", schedule.user_id)
      .maybeSingle();
    if (preset) {
      presetRules = (preset.audience_rules ?? []) as AudienceRule[];
      if (!prompt && preset.prompt) prompt = String(preset.prompt);
    }
  }

  if (!prompt) {
    throw new Error(`Schedule "${schedule.name}" has no prompt`);
  }

  const result = await orchestrateCrmAgent(supabase, schedule.user_id, {
    prompt,
    presetRules,
  });

  const { campaignId } = await createCampaignFromAgent(supabase, schedule.user_id, {
    subject: result.campaign.subject,
    templateKey: result.campaign.templateKey,
    content: result.campaign.content,
    contactIds: result.audience.contactIds,
    agentRunId: result.runId,
  });

  if (schedule.auto_send) {
    await sendCrmCampaign(supabase, schedule.user_id, campaignId);
  }

  const scheduledAt = new Date(schedule.scheduled_at);
  const nextAt =
    schedule.schedule_type === "once"
      ? null
      : nextScheduledAt(scheduledAt, schedule.schedule_type).toISOString();

  await supabase
    .from("crm_scheduled_campaigns")
    .update({
      last_run_at: new Date().toISOString(),
      last_agent_run_id: result.runId,
      last_campaign_id: campaignId,
      scheduled_at: nextAt ?? schedule.scheduled_at,
      enabled: schedule.schedule_type === "once" ? false : true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", schedule.id);
}

export async function processDueCrmSchedules(): Promise<AutomationSummary> {
  const supabase = createServiceRoleClient();
  const now = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("crm_scheduled_campaigns")
    .select(
      "id, user_id, name, prompt, preset_id, schedule_type, scheduled_at, auto_send",
    )
    .eq("enabled", true)
    .lte("scheduled_at", now)
    .order("scheduled_at")
    .limit(5);

  if (error) throw error;

  const summary: AutomationSummary = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  for (const schedule of due ?? []) {
    summary.processed++;
    try {
      await runSchedule(supabase, schedule);
      summary.succeeded++;
    } catch (err) {
      summary.failed++;
      summary.errors.push(
        `${schedule.name}: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }

  return summary;
}
