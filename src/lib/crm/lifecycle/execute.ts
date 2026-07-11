// Execute a lifecycle action through the existing CRM rails:
// draft campaign → Resend send → touch ledger (incl. holdouts).

import type { SupabaseClient } from "@supabase/supabase-js";
import { contactHoldoutBucket } from "@/lib/domestique/guardrails";
import { createCampaignFromAgent } from "../agent/create-campaign";
import { sendCrmCampaign } from "../send-campaign";
import type { LifecycleAction, LifecycleActionPayload, LifecycleEmailDraft } from "./types";
import { lifecycleEmailToContent } from "./template-config";

/** Below this many live recipients an A/B split has no statistical value. */
const MIN_AB_SPLIT_SIZE = 20;

export type LifecycleExecutionResult = {
  campaignId: string | null;
  emailsSent: number;
  emailsFailed: number;
  holdouts: number;
  /** Present when the send ran a subject A/B split. */
  ab?: { campaignBId: string; aCount: number; bCount: number };
};

export type LifecycleActionEdit = {
  subject?: string;
  title?: string;
  body?: string;
  ctaText?: string;
  templateKey?: string;
  content?: LifecycleEmailDraft["content"] | null;
  templateLabel?: string;
};

function applyEdit(email: LifecycleEmailDraft, edit: LifecycleActionEdit | undefined): LifecycleEmailDraft {
  if (!edit) return email;
  const next: LifecycleEmailDraft = {
    ...email,
    subject: edit.subject?.trim() || email.subject,
    title: edit.title?.trim() || email.title,
    body: edit.body?.trim() || email.body,
    ctaText: edit.ctaText?.trim() ?? email.ctaText,
  };
  if (edit.templateKey?.trim()) next.templateKey = edit.templateKey.trim();
  if (edit.templateLabel !== undefined) next.templateLabel = edit.templateLabel;
  if (edit.content !== undefined) {
    next.content = edit.content
      ? {
          ...edit.content,
          title: next.title,
          body: next.body,
          ctaText: next.ctaText ?? edit.content.ctaText,
          ctaUrl: next.ctaUrl ?? edit.content.ctaUrl,
        }
      : undefined;
  } else if (next.content) {
    next.content = {
      ...next.content,
      title: next.title,
      body: next.body,
      ctaText: next.ctaText ?? next.content.ctaText,
      ctaUrl: next.ctaUrl ?? next.content.ctaUrl,
    };
  }
  return next;
}

/**
 * Claim + execute an action. Safe to call from the approval API (review
 * mode) or the engine (auto mode): the status-guarded claim means an action
 * can only ever be executed once.
 */
export async function executeLifecycleAction(
  supabase: SupabaseClient,
  userId: string,
  actionId: string,
  edit?: LifecycleActionEdit,
): Promise<LifecycleExecutionResult> {
  const { data: claimed, error: claimError } = await supabase
    .from("crm_lifecycle_actions")
    .update({ status: "executing" })
    .eq("id", actionId)
    .eq("user_id", userId)
    .in("status", ["awaiting_approval", "approved"])
    .select("*")
    .single();
  if (claimError || !claimed) {
    throw new Error("Action is no longer pending — it may have already been sent or expired.");
  }

  const action = claimed as unknown as LifecycleAction;
  const payload = (action.payload ?? {}) as LifecycleActionPayload;
  const email = applyEdit(payload.email, edit);
  const targets = payload.targets ?? [];
  const live = targets.filter((t) => !t.is_holdout);
  const holdouts = targets.filter((t) => t.is_holdout);

  try {
    if (live.length === 0) throw new Error("No live recipients in this action");

    // Subject A/B split: enough volume + a distinct B subject → two campaigns
    // with identical content, deterministic 50/50 assignment by contact id.
    const abSubjectB = String(payload.ab?.subject_b ?? "").trim();
    const runAb =
      abSubjectB.length > 0 && abSubjectB !== email.subject && live.length >= MIN_AB_SPLIT_SIZE;

    let campaignId: string;
    let send: { sent: number; failed: number };
    let abResult: LifecycleExecutionResult["ab"];

    if (runAb) {
      const groupA = live.filter((t) => contactHoldoutBucket(t.contact_id) % 2 === 0);
      const groupB = live.filter((t) => contactHoldoutBucket(t.contact_id) % 2 === 1);
      const content = lifecycleEmailToContent(email);

      const a = await createCampaignFromAgent(supabase, userId, {
        subject: email.subject,
        templateKey: email.templateKey,
        content,
        contactIds: groupA.map((t) => t.contact_id),
      });
      const b = await createCampaignFromAgent(supabase, userId, {
        subject: abSubjectB,
        templateKey: email.templateKey,
        content,
        contactIds: groupB.map((t) => t.contact_id),
      });

      const [sendA, sendB] = [
        await sendCrmCampaign(supabase, userId, a.campaignId),
        await sendCrmCampaign(supabase, userId, b.campaignId),
      ];

      campaignId = a.campaignId;
      send = { sent: sendA.sent + sendB.sent, failed: sendA.failed + sendB.failed };
      abResult = { campaignBId: b.campaignId, aCount: groupA.length, bCount: groupB.length };
    } else {
      const created = await createCampaignFromAgent(supabase, userId, {
        subject: email.subject,
        templateKey: email.templateKey,
        content: lifecycleEmailToContent(email),
        contactIds: live.map((t) => t.contact_id),
      });
      campaignId = created.campaignId;
      const result = await sendCrmCampaign(supabase, userId, campaignId);
      send = { sent: result.sent, failed: result.failed };
    }

    // Touch ledger — live sends and withheld holdouts alike.
    const nowIso = new Date().toISOString();
    const touchRows = [
      ...live.map((t) => ({
        user_id: userId,
        action_id: action.id,
        program_key: action.program_key,
        stage_at_touch: action.stage,
        contact_id: t.contact_id,
        lightspeed_customer_id: t.lightspeed_customer_id,
        is_holdout: false,
        touched_at: nowIso,
      })),
      ...holdouts.map((t) => ({
        user_id: userId,
        action_id: action.id,
        program_key: action.program_key,
        stage_at_touch: action.stage,
        contact_id: t.contact_id,
        lightspeed_customer_id: t.lightspeed_customer_id,
        is_holdout: true,
        touched_at: nowIso,
      })),
    ];
    for (let i = 0; i < touchRows.length; i += 500) {
      const { error } = await supabase
        .from("crm_lifecycle_touches")
        .insert(touchRows.slice(i, i + 500));
      if (error) console.error("[lifecycle/execute] touch insert failed:", error.message);
    }

    await supabase
      .from("crm_lifecycle_actions")
      .update({
        status: "sent",
        status_detail: null,
        subject: email.subject,
        payload: {
          email,
          targets,
          ...(payload.ab || abResult
            ? {
                ab: {
                  subject_b: abSubjectB || payload.ab?.subject_b || "",
                  ...(abResult
                    ? {
                        campaign_b_id: abResult.campaignBId,
                        a_count: abResult.aCount,
                        b_count: abResult.bCount,
                      }
                    : {}),
                },
              }
            : {}),
        },
        campaign_id: campaignId,
        executed_at: nowIso,
      })
      .eq("id", action.id)
      .eq("user_id", userId);

    if (action.program_id) {
      await supabase
        .from("crm_lifecycle_programs")
        .update({ last_run_at: nowIso })
        .eq("id", action.program_id)
        .eq("user_id", userId);
    }

    return {
      campaignId,
      emailsSent: send.sent,
      emailsFailed: send.failed,
      holdouts: holdouts.length,
      ab: abResult,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Execution failed";
    await supabase
      .from("crm_lifecycle_actions")
      .update({ status: "failed", status_detail: message.slice(0, 500) })
      .eq("id", action.id)
      .eq("user_id", userId)
      .eq("status", "executing");
    throw error;
  }
}

export async function skipLifecycleAction(
  supabase: SupabaseClient,
  userId: string,
  actionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("crm_lifecycle_actions")
    .update({ status: "skipped", status_detail: "Skipped by store owner" })
    .eq("id", actionId)
    .eq("user_id", userId)
    .in("status", ["awaiting_approval", "approved"]);
  if (error) throw error;
}
