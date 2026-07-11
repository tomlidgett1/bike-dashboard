/**
 * PATCH /api/store/crm/lifecycle/programs/[id] — enable/pause a program,
 * switch review/auto mode, adjust cadence or offer policy.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  updateLifecycleProgram,
  type LifecycleProgramUpdate,
} from "@/lib/crm/lifecycle/programs";
import type { LifecycleOfferPolicy, LifecycleProgramMode } from "@/lib/crm/lifecycle/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const update: LifecycleProgramUpdate = {};
    if (typeof body.enabled === "boolean") update.enabled = body.enabled;
    if (body.mode === "review" || body.mode === "auto") {
      update.mode = body.mode as LifecycleProgramMode;
    }
    if (Number.isFinite(Number(body.entry_delay_days))) {
      update.entry_delay_days = Number(body.entry_delay_days);
    }
    if (Number.isFinite(Number(body.cooldown_days))) {
      update.cooldown_days = Number(body.cooldown_days);
    }
    if (body.offer_policy === "none" || body.offer_policy === "soft" || body.offer_policy === "winback") {
      update.offer_policy = body.offer_policy as LifecycleOfferPolicy;
    }
    if (body.config && typeof body.config === "object" && !Array.isArray(body.config)) {
      const config = body.config as Record<string, unknown>;
      const next: Record<string, unknown> = {};
      if ("templateId" in config) {
        next.templateId =
          config.templateId === null || config.templateId === ""
            ? null
            : String(config.templateId);
      }
      if ("templateKey" in config) {
        next.templateKey =
          config.templateKey === null || config.templateKey === ""
            ? null
            : String(config.templateKey);
      }
      if ("templateLabel" in config) {
        next.templateLabel =
          config.templateLabel === null || config.templateLabel === ""
            ? null
            : String(config.templateLabel);
      }
      // Store-designed campaign: null clears it (back to automatic copy).
      if ("custom_email" in config) {
        const custom = config.custom_email as Record<string, unknown> | null;
        if (custom && typeof custom === "object") {
          const subject = String(custom.subject ?? "").trim();
          const templateKey = String(custom.templateKey ?? "").trim();
          const content = custom.content;
          if (subject && templateKey && content && typeof content === "object") {
            next.custom_email = {
              subject,
              templateKey,
              templateLabel:
                custom.templateLabel === null || custom.templateLabel === undefined
                  ? null
                  : String(custom.templateLabel),
              content,
              updated_at: new Date().toISOString(),
            };
          }
        } else {
          next.custom_email = null;
        }
      }
      // Subject A/B test config.
      if ("ab" in config) {
        const ab = config.ab as Record<string, unknown> | null;
        next.ab = ab && typeof ab === "object"
          ? { enabled: Boolean(ab.enabled), subject_b: String(ab.subject_b ?? "").trim() }
          : null;
      }
      if (Object.keys(next).length > 0) update.config = next;
    }

    const program = await updateLifecycleProgram(supabase, user.id, id, update);
    return NextResponse.json({ program });
  } catch (error) {
    console.error("[crm/lifecycle/programs] PATCH failed:", error);
    return NextResponse.json({ error: "Failed to update program" }, { status: 500 });
  }
}
