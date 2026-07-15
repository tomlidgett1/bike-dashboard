/**
 * CRM SMS blast
 *
 * POST /api/store/crm/sms-blast
 * { message, recipientMode, contactIds?, groupId?, dryRun? }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveSmsRecipients, type SmsRecipientMode } from "@/lib/crm/resolve-sms-recipients";
import { sendSmsBroadcast } from "@/lib/sms/smsbroadcast";
import { recordSmsSends } from "@/lib/sms/sms-sends";

const SMS_BATCH_SIZE = 5;

type BlastBody = {
  message?: string;
  recipientMode?: SmsRecipientMode;
  contactIds?: string[];
  phones?: string[];
  groupId?: string;
  dryRun?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const body = (await request.json()) as BlastBody;
    const message = String(body.message ?? "").trim();
    const recipientMode =
      body.recipientMode === "selected"
        ? "selected"
        : body.recipientMode === "group"
          ? "group"
          : "all";
    const contactIds = Array.isArray(body.contactIds) ? body.contactIds : [];
    const phones = Array.isArray(body.phones)
      ? body.phones.map((entry) => String(entry ?? "").trim()).filter(Boolean)
      : [];
    const groupId = String(body.groupId ?? "").trim();
    const dryRun = body.dryRun === true;

    if (!dryRun && !message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }
    if (recipientMode === "selected" && contactIds.length === 0 && phones.length === 0) {
      return NextResponse.json({ error: "Select at least one contact" }, { status: 400 });
    }
    if (recipientMode === "group" && !groupId) {
      return NextResponse.json({ error: "Select a cohort" }, { status: 400 });
    }

    const { recipients, optedOutCount, excludedNoPhone } = await resolveSmsRecipients({
      supabase,
      userId: user.id,
      recipientMode,
      contactIds,
      groupId,
      extraPhones: phones,
    });

    if (recipients.length === 0) {
      return NextResponse.json(
        {
          error:
            "No eligible recipients — numbers are SMS opted out or have no valid mobile",
        },
        { status: 400 },
      );
    }

    if (dryRun) {
      return NextResponse.json({
        recipientCount: recipients.length,
        optedOutCount,
        excludedNoPhone,
        sample: recipients.slice(0, 5).map((recipient) => ({
          id: recipient.id,
          phone: recipient.phone,
          name: [recipient.first_name, recipient.last_name].filter(Boolean).join(" ") || null,
        })),
      });
    }

    let sent = 0;
    let failed = 0;
    const failures: { phone: string; error: string }[] = [];
    const successfulSends: { phone: string; contactId: string | null }[] = [];

    for (let i = 0; i < recipients.length; i += SMS_BATCH_SIZE) {
      const batch = recipients.slice(i, i + SMS_BATCH_SIZE);
      const results = await Promise.all(
        batch.map((recipient) => sendSmsBroadcast(recipient.phone, message)),
      );
      for (let j = 0; j < results.length; j++) {
        const result = results[j]!;
        const recipient = batch[j]!;
        if (result.success) {
          sent++;
          successfulSends.push({
            phone: recipient.phone,
            contactId: recipient.id.startsWith("phone:") ? null : recipient.id,
          });
        } else {
          failed++;
          if (failures.length < 10) {
            failures.push({ phone: result.phone, error: result.result });
          }
        }
      }
    }

    if (successfulSends.length > 0) {
      await recordSmsSends({
        supabase,
        userId: user.id,
        sends: successfulSends,
      });
    }

    return NextResponse.json({
      success: failed === 0,
      sent,
      failed,
      recipientCount: recipients.length,
      optedOutCount,
      excludedNoPhone,
      failures,
    });
  } catch (error) {
    console.error("[crm] sms blast failed:", error);
    return NextResponse.json({ error: "Failed to send SMS blast" }, { status: 500 });
  }
}
