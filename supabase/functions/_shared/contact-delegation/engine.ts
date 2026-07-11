import type { NormalisedIncomingMessage } from '../linq.ts';
import { getContactDelegationConfig, isHandleAllowedForContactDelegation } from './config.ts';
import { resolveDelegationContact, formatContactAmbiguity } from './contacts.ts';
import { classifyContactCardObjectiveWithReasoning, detectContactDelegationRequestWithReasoning, shouldFallThroughAfterContactMiss } from './detect.ts';
import { extractCoordinationProgressWithReasoning } from './extract.ts';
import { createContactDelegationRuntime } from './linq.ts';
import { parseContactCardFromMessage } from './vcard.ts';
import {
  buildCompletionReceipt,
  buildIncompleteReceipt,
  buildOwnerApprovalPrompt,
  buildRecipientOptInPrompt,
  buildRecipientFinalReviewPrompt,
  buildTargetFinalConfirmation,
  buildTargetOpener,
  buildTargetOpenerWithReasoning,
} from './prompts.ts';
import {
  buildIdentityRedisclosure,
  classifyTargetReplyIntent,
  isNoAdditionalRecipientInfo,
  isOwnerApproval,
  isOwnerRejectionOrCancel,
  isRecipientOptIn,
  isUnsafeOwnerDelegationRequest,
} from './safety.ts';
import {
  createDelegationTask,
  findActiveTargetTask,
  findOpenOwnerTask,
  findRecentTargetTask,
  getTask,
  hasDurableOptOut,
  listDueTargetFollowups,
  listExpiredTasks,
  recordTaskMessage,
  updateTask,
  writeDurableOptOut,
} from './store.ts';
import type {
  ContactDelegationStatus,
  ContactDelegationTask,
  DelegationRuntime,
  DelegationStartResult,
  ExpiryResult,
} from './types.ts';
import { getAdminClient } from '../supabase.ts';

function ownerNameFromHandle(handle: string): string {
  return handle;
}

function resolveOwnerName(handle: string, displayName?: string | null): string {
  const trimmed = displayName?.trim();
  if (trimmed) return trimmed;
  return ownerNameFromHandle(handle);
}

async function resolveStoredOwnerName(handle: string, fallback?: string | null): Promise<string> {
  const fallbackName = resolveOwnerName(handle, fallback);
  try {
    const { data, error } = await getAdminClient()
      .from('user_profiles')
      .select('display_name, name')
      .eq('handle', handle)
      .maybeSingle();
    if (error) return fallbackName;
    const row = data as { display_name?: string | null; name?: string | null } | null;
    return row?.display_name?.trim() || row?.name?.trim() || fallbackName;
  } catch {
    return fallbackName;
  }
}

function expiryIso(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function minutesFromNowIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function hoursFromNowIso(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function initialFieldsFromObjective(objective: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (/\btomorrow\b/i.test(objective)) fields.date = 'tomorrow';
  if (/\btoday|tonight\b/i.test(objective)) fields.date = 'today';
  const weekday = objective.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)?.[0];
  if (weekday) fields.date = weekday;
  const tz = objective.match(/\b(tokyo|japan|jst|sydney|melbourne|australia|aest|aedt|utc|gmt)\b/i)?.[0];
  if (tz) fields.timezone_or_context = tz;
  return fields;
}

function isAwaitingOwnerLocation(task: ContactDelegationTask): boolean {
  return task.status === 'active' && task.metadata.awaiting_owner_location === true;
}

function isAwaitingOwnerClarification(task: ContactDelegationTask): boolean {
  return task.status === 'active' && task.metadata.awaiting_owner_clarification === true;
}

function isAwaitingFinalRecipientNote(task: ContactDelegationTask): boolean {
  return task.status === 'active' && task.metadata.awaiting_final_recipient_note === true;
}

function toneAwareTargetFollowup(task: ContactDelegationTask, text: string): string {
  const tone = typeof task.metadata.requested_tone === 'string' ? task.metadata.requested_tone : null;
  if (!tone) return text;
  if (tone === 'funny' || tone === 'playful' || tone === 'cheeky') {
    return text
      .replace(/^Thanks\./, 'Thanks, nearly there.')
      .replace(/^Got it\./, 'Got it, my tiny clipboard is ready.');
  }
  if (tone === 'warm' || tone === 'friendly' || tone === 'casual') {
    return text.replace(/^Thanks\./, 'Thanks, that helps.').replace(/^Got it\./, 'Got it, thank you.');
  }
  return text;
}

function isAwaitingRecipientName(task: ContactDelegationTask): boolean {
  return task.status === 'draft' && task.metadata.awaiting_recipient_name === true;
}

function isAwaitingContactCardObjective(task: ContactDelegationTask): boolean {
  return task.status === 'draft' && task.metadata.awaiting_contact_card_objective === true;
}

function normaliseRecipientNameReply(text: string): string | null {
  const cleaned = text
    .trim()
    .replace(/^(no\s+)?(just|it'?s|its|name is|he'?s called|she'?s called|called)\s+/i, '')
    .replace(/[.!?]+$/g, '')
    .trim();
  if (!cleaned || cleaned.length > 80) return null;
  if (/\d{5,}/.test(cleaned)) return null;
  return cleaned;
}

async function sendAndRecordOwner(
  task: ContactDelegationTask,
  text: string,
  runtime: DelegationRuntime,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const effect = metadata.effect === 'confetti'
    ? { type: 'screen' as const, name: 'confetti' }
    : undefined;
  const providerMessageId = await runtime.sendOwnerMessage(task.ownerChatId, text, effect);
  await recordTaskMessage({
    taskId: task.id,
    chatId: task.ownerChatId,
    senderRole: 'nest_to_owner',
    content: text,
    providerMessageId,
    metadata: { ...metadata, dry_run: runtime.dryRun },
  });
}

async function sendAndRecordTarget(
  task: ContactDelegationTask,
  text: string,
  runtime: DelegationRuntime,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  if (!task.targetChatId) throw new Error('target chat id is missing');
  const providerMessageId = await runtime.sendTargetMessage(task.targetChatId, text);
  await recordTaskMessage({
    taskId: task.id,
    chatId: task.targetChatId,
    senderRole: 'nest_to_target',
    content: text,
    providerMessageId,
    metadata: { ...metadata, dry_run: runtime.dryRun },
  });
}

async function transitionTerminal(
  task: ContactDelegationTask,
  status: ContactDelegationStatus,
  reason: string,
  runtime: DelegationRuntime,
): Promise<void> {
  const terminal = await updateTask(task.id, {
    status,
    terminal_reason: reason,
    completed_at: status === 'completed' ? new Date().toISOString() : task.completedAt,
  });

  if (terminal.ownerReceiptSentAt) return;

  let taskForReceipt = terminal;
  if (
    status === 'completed' &&
    terminal.targetChatId &&
    terminal.metadata.target_final_confirmation_sent_at !== true
  ) {
    const targetConfirmation = buildTargetFinalConfirmation(terminal);
    await sendAndRecordTarget(terminal, targetConfirmation, runtime, {
      terminal_status: status,
      final_confirmation: true,
    });
    taskForReceipt = await updateTask(terminal.id, {
      metadata: {
        ...terminal.metadata,
        target_final_confirmation_sent_at: true,
      },
    });
  }

  const receipt = status === 'completed'
    ? buildCompletionReceipt(taskForReceipt)
    : buildIncompleteReceipt(taskForReceipt, reason);
  await sendAndRecordOwner(taskForReceipt, receipt, runtime, {
    terminal_status: status,
    reason,
    ...(status === 'completed' ? { effect: 'confetti' } : {}),
  });
  await updateTask(taskForReceipt.id, {
    owner_receipt_sent_at: new Date().toISOString(),
    last_owner_notified_at: new Date().toISOString(),
  });
}

async function startTargetThread(task: ContactDelegationTask, runtime: DelegationRuntime): Promise<void> {
  const openerIdempotencyKey = task.openerIdempotencyKey ?? `contact_delegation:${task.id}:opener`;
  const pending = await updateTask(task.id, {
    status: 'awaiting_target_start',
    opener_idempotency_key: openerIdempotencyKey,
  });

  try {
    const taskOpener = pending.taskOpenerText ?? pending.openerText ?? buildTargetOpener({
      ownerName: ownerNameFromHandle(pending.ownerHandle),
      targetName: pending.targetDisplayName ?? pending.targetHandle,
      objective: pending.objective,
      reasonForMessage: typeof pending.metadata.reason_for_message === 'string'
        ? pending.metadata.reason_for_message
        : pending.objective,
      requestedTone: typeof pending.metadata.requested_tone === 'string'
        ? pending.metadata.requested_tone
        : null,
    });
    const optInText = buildRecipientOptInPrompt({
      ownerName: typeof pending.metadata.sender_name === 'string' ? pending.metadata.sender_name : ownerNameFromHandle(pending.ownerHandle),
      targetName: pending.targetDisplayName ?? pending.targetHandle,
      reasonForMessage: typeof pending.metadata.reason_for_message === 'string' ? pending.metadata.reason_for_message : pending.objective,
    });
    const created = await runtime.createTargetChat(pending.ownerBotNumber, [pending.selectedPhoneE164], optInText);
    if (!created.chatId) {
      throw new Error('Linq createChat returned no chat id');
    }

    const active = await updateTask(pending.id, {
      status: 'recipient_opt_in',
      target_chat_id: created.chatId,
      next_target_followup_at: minutesFromNowIso(15),
      target_response_deadline_at: hoursFromNowIso(3.25),
      task_opener_text: taskOpener,
      metadata: {
        ...pending.metadata,
        target_start_delivery_status: created.deliveryStatus ?? null,
        dry_run: runtime.dryRun,
      },
    });
    await recordTaskMessage({
      taskId: active.id,
      chatId: created.chatId,
      senderRole: 'nest_to_target',
      content: optInText,
      providerMessageId: created.messageId,
      metadata: {
        recipient_opt_in: true,
        dry_run: runtime.dryRun,
        delivery_status: created.deliveryStatus ?? null,
      },
    });
  } catch (error) {
    const failed = await updateTask(pending.id, {
      status: 'failed_to_start',
      terminal_reason: 'failed_to_start',
      metadata: {
        ...pending.metadata,
        start_error: error instanceof Error ? error.message : String(error),
      },
    });
    await transitionTerminal(failed, 'failed_to_start', 'failed_to_start', runtime);
  }
}

async function handleOwnerContinuation(
  task: ContactDelegationTask,
  message: NormalisedIncomingMessage,
  runtime: DelegationRuntime,
): Promise<DelegationStartResult> {
  const recorded = await recordTaskMessage({
    taskId: task.id,
    chatId: message.chatId,
    senderRole: 'owner',
    senderHandle: message.from,
    content: message.text,
    providerMessageId: message.messageId,
  });
  if (!recorded) return { handled: true, reason: 'duplicate_owner_message' };

  if (isAwaitingRecipientName(task)) {
    const recipientName = normaliseRecipientNameReply(message.text);
    if (!recipientName) {
      const text = "What's their name? Just send the name, like “John” or “Sarah Chen”.";
      await sendAndRecordOwner(task, text, runtime, { reminder: 'recipient_name' });
      return { handled: true, ownerMessage: text, reason: 'recipient_name_unclear' };
    }

    const ownerName = await resolveStoredOwnerName(
      task.ownerHandle,
      typeof task.metadata.sender_name === 'string' ? task.metadata.sender_name : null,
    );
    const reasonForMessage = typeof task.metadata.reason_for_message === 'string'
      ? task.metadata.reason_for_message
      : task.objective;
    const requestedTone = typeof task.metadata.requested_tone === 'string'
      ? task.metadata.requested_tone
      : null;
    const openerText = await buildTargetOpenerWithReasoning({
      ownerName,
      targetName: recipientName,
      objective: task.objective,
      reasonForMessage,
      requestedTone,
    });
    const ownerApprovalText = buildOwnerApprovalPrompt({
      senderName: ownerName,
      targetName: recipientName,
      objective: task.objective,
      reasonForMessage,
      draftMessage: openerText,
    });
    const updated = await updateTask(task.id, {
      status: 'awaiting_owner_approval',
      target_display_name: recipientName,
      opener_text: openerText,
      owner_approval_text: ownerApprovalText,
      metadata: {
        ...task.metadata,
        awaiting_recipient_name: false,
        recipient_name_supplied_by_owner: true,
      },
    });
    await sendAndRecordOwner(updated, ownerApprovalText, runtime, { approval_prompt: true });
    return { handled: true, ownerMessage: ownerApprovalText, reason: 'recipient_name_captured' };
  }

  if (isAwaitingContactCardObjective(task)) {
    const instruction = message.text.trim();
    if (!instruction || isOwnerApproval(instruction)) {
      const text = `What would you like me to message ${task.targetDisplayName ?? task.targetHandle}?`;
      await sendAndRecordOwner(task, text, runtime, { reminder: 'contact_card_objective' });
      return { handled: true, ownerMessage: text, reason: 'contact_card_objective_missing' };
    }
    if (isOwnerRejectionOrCancel(instruction)) {
      await transitionTerminal(task, 'cancelled_by_owner', 'owner_cancelled', runtime);
      return { handled: true, reason: 'contact_card_cancelled' };
    }

    const ownerName = await resolveStoredOwnerName(
      task.ownerHandle,
      typeof task.metadata.sender_name === 'string' ? task.metadata.sender_name : null,
    );
    const objective = await classifyContactCardObjectiveWithReasoning({
      contactName: task.targetDisplayName ?? task.targetHandle,
      contactPhone: task.selectedPhoneE164,
      userMessage: instruction,
    });
    if (!objective.isObjective) {
      await updateTask(task.id, {
        status: 'cancelled_by_owner',
        terminal_reason: 'contact_card_abandoned_unrelated_message',
        metadata: {
          ...task.metadata,
          abandoned_at: new Date().toISOString(),
          abandoned_reason: objective.reason,
        },
      });
      return { handled: false, reason: 'contact_card_unrelated_message' };
    }

    const reasonForMessage = objective.reasonForMessage ?? instruction;
    const requestedTone = objective.requestedTone ?? (typeof task.metadata.requested_tone === 'string' ? task.metadata.requested_tone : null);
    const openerText = await buildTargetOpenerWithReasoning({
      ownerName,
      targetName: task.targetDisplayName ?? task.targetHandle,
      objective: instruction,
      reasonForMessage,
      requestedTone,
    });
    const ownerApprovalText = buildOwnerApprovalPrompt({
      senderName: ownerName,
      targetName: task.targetDisplayName ?? task.targetHandle,
      objective: instruction,
      reasonForMessage,
      draftMessage: openerText,
    });
    const updated = await updateTask(task.id, {
      status: 'awaiting_owner_approval',
      objective: instruction,
      opener_text: null,
      task_opener_text: openerText,
      owner_approval_text: ownerApprovalText,
      metadata: {
        ...task.metadata,
        awaiting_contact_card_objective: false,
        reason_for_message: reasonForMessage,
        requested_tone: requestedTone,
      },
    });
    await sendAndRecordOwner(updated, ownerApprovalText, runtime, { approval_prompt: true, from_contact_card: true });
    return { handled: true, ownerMessage: ownerApprovalText, reason: 'contact_card_objective_captured' };
  }

  if (task.status === 'awaiting_owner_approval') {
    if (isOwnerApproval(message.text)) {
      await startTargetThread(task, runtime);
      return { handled: true, reason: 'owner_approved' };
    }
    if (isOwnerRejectionOrCancel(message.text)) {
      await transitionTerminal(task, 'cancelled_by_owner', 'owner_cancelled', runtime);
      return { handled: true, reason: 'owner_cancelled' };
    }
    const ownerName = await resolveStoredOwnerName(
      task.ownerHandle,
      typeof task.metadata.sender_name === 'string' ? task.metadata.sender_name : null,
    );
    const targetName = task.targetDisplayName ?? task.targetHandle;
    const reasonForMessage = typeof task.metadata.reason_for_message === 'string'
      ? task.metadata.reason_for_message
      : task.objective;
    const requestedTone = typeof task.metadata.requested_tone === 'string'
      ? task.metadata.requested_tone
      : null;
    const openerText = await buildTargetOpenerWithReasoning({
      ownerName,
      targetName,
      objective: task.objective,
      reasonForMessage,
      requestedTone,
      revisionInstruction: message.text,
    });
    const ownerApprovalText = buildOwnerApprovalPrompt({
      senderName: ownerName,
      targetName,
      objective: task.objective,
      reasonForMessage,
      draftMessage: openerText,
    });
    const updated = await updateTask(task.id, {
      opener_text: openerText,
      owner_approval_text: ownerApprovalText,
      metadata: {
        ...task.metadata,
        last_owner_revision_instruction: message.text,
      },
    });
    await sendAndRecordOwner(updated, ownerApprovalText, runtime, { approval_prompt: true, revised: true });
    return { handled: true, reason: 'owner_revision_applied' };
  }

  if (task.status === 'active' && isOwnerRejectionOrCancel(message.text)) {
    await transitionTerminal(task, 'cancelled_by_owner', 'owner_cancelled', runtime);
    return { handled: true, reason: 'owner_cancelled_active_task' };
  }

  if (isAwaitingOwnerClarification(task)) {
    const instruction = message.text.trim();
    if (!instruction || instruction.length > 500) {
      const text = 'What should I tell them? Send the exact detail or instruction you want me to pass on.';
      await sendAndRecordOwner(task, text, runtime, { reminder: 'owner_clarification' });
      return { handled: true, ownerMessage: text, reason: 'owner_clarification_unclear' };
    }
    const missingFields = typeof task.metadata.missing_fields_for_owner === 'string'
      ? task.metadata.missing_fields_for_owner
      : '';
    const isSupplyingLocation = missingFields.includes('location');
    const fields = isSupplyingLocation
      ? { ...task.collectedFields, location: instruction }
      : task.collectedFields;
    const updated = await updateTask(task.id, {
      collected_fields: fields,
      metadata: {
        ...task.metadata,
        awaiting_owner_clarification: false,
        owner_clarification: instruction,
        ...(isSupplyingLocation ? { owner_suggested_location: instruction } : {}),
      },
      next_target_followup_at: minutesFromNowIso(15),
    });
    await sendAndRecordTarget(
      updated,
      `Thanks, ${task.metadata.sender_name ?? 'they'} said: ${instruction}. Does that work?`,
      runtime,
      { intent: 'owner_clarification_supplied' },
    );
    return { handled: true, reason: 'owner_clarification_sent_to_target' };
  }

  if (isAwaitingOwnerLocation(task)) {
    const location = message.text.trim().replace(/[.!?]+$/g, '');
    if (!location || location.length > 120) {
      const text = 'What location should I suggest? Send just the venue or area.';
      await sendAndRecordOwner(task, text, runtime, { reminder: 'owner_location' });
      return { handled: true, ownerMessage: text, reason: 'owner_location_unclear' };
    }

    const fields = { ...task.collectedFields, location };
    const updated = await updateTask(task.id, {
      collected_fields: fields,
      metadata: {
        ...task.metadata,
        awaiting_owner_location: false,
        owner_suggested_location: location,
      },
    });

    if (updated.targetChatId) {
      await sendAndRecordTarget(
        updated,
        `Great, ${location} works from our side. Can you confirm ${updated.collectedFields.time ?? 'that time'} there?`,
        runtime,
        { intent: 'owner_location_supplied' },
      );
      return { handled: true, reason: 'owner_location_sent_to_target' };
    }
  }

  return { handled: false, reason: 'no_owner_continuation_match' };
}

async function handleTargetReply(
  task: ContactDelegationTask,
  message: NormalisedIncomingMessage,
  runtime: DelegationRuntime,
): Promise<DelegationStartResult> {
  const recorded = await recordTaskMessage({
    taskId: task.id,
    chatId: message.chatId,
    senderRole: 'target',
    senderHandle: message.from,
    content: message.text,
    providerMessageId: message.messageId,
  });
  if (!recorded) return { handled: true, reason: 'duplicate_target_message' };

  if (task.status === 'recipient_opt_in') {
    const classifiedIntent = classifyTargetReplyIntent(message.text);
    if (classifiedIntent === 'opt_out' || classifiedIntent === 'wrong_number' || classifiedIntent === 'refusal') {
      await transitionTerminal(task, 'cancelled_by_target', classifiedIntent, runtime);
      return { handled: true, reason: 'recipient_declined_opt_in' };
    }
    if (!isRecipientOptIn(message.text)) {
      await sendAndRecordTarget(
        task,
        `No worries. I won't continue unless you're okay with it. Is it alright for me to pass on ${task.metadata.sender_name ?? 'their'} message here?`,
        runtime,
        { intent: 'recipient_opt_in_retry' },
      );
      await updateTask(task.id, {
        no_response_followup_count: 0,
        next_target_followup_at: minutesFromNowIso(15),
      });
      return { handled: true, reason: 'recipient_opt_in_unclear' };
    }

    const active = await updateTask(task.id, {
      status: 'active',
      no_response_followup_count: 0,
      next_target_followup_at: minutesFromNowIso(15),
      metadata: {
        ...task.metadata,
        recipient_opted_in_at: new Date().toISOString(),
      },
    });
    await sendAndRecordTarget(
      active,
      active.taskOpenerText ?? active.openerText ?? 'Thanks. Here is the message.',
      runtime,
      { opener: true, after_recipient_opt_in: true },
    );
    return { handled: true, reason: 'recipient_opted_in_task_sent' };
  }

  if (isAwaitingFinalRecipientNote(task)) {
    const note = isNoAdditionalRecipientInfo(message.text) ? null : message.text.trim();
    const updated = await updateTask(task.id, {
      metadata: {
        ...task.metadata,
        awaiting_final_recipient_note: false,
        final_recipient_note: note,
      },
      next_target_followup_at: null,
      no_response_followup_count: 0,
      last_target_message_at: new Date().toISOString(),
    });
    await transitionTerminal(updated, 'completed', 'completed', runtime);
    return { handled: true, reason: note ? 'completed_with_recipient_note' : 'completed_no_recipient_note' };
  }

  const extraction = await extractCoordinationProgressWithReasoning(task, message.text);
  const updated = await updateTask(task.id, {
    collected_fields: extraction.collectedFields,
    last_target_message_at: new Date().toISOString(),
    next_target_followup_at: null,
    no_response_followup_count: 0,
    metadata: {
      ...task.metadata,
      last_target_intent: extraction.intent,
      last_target_reason: extraction.reason,
    },
  });

  if (extraction.intent === 'identity_clarification') {
    if (updated.targetFollowupCount >= getContactDelegationConfig().maxTargetFollowups) {
      await transitionTerminal(updated, 'expired', 'too_many_followups', runtime);
      return { handled: true, reason: 'identity_followup_limit' };
    }
    await sendAndRecordTarget(updated, buildIdentityRedisclosure(ownerNameFromHandle(updated.ownerHandle), updated.objective), runtime, {
      intent: extraction.intent,
    });
    await updateTask(updated.id, { target_followup_count: updated.targetFollowupCount + 1 });
    return { handled: true, reason: 'identity_redisclosed' };
  }

  if (extraction.intent === 'opt_out') {
    await writeDurableOptOut({
      botNumber: updated.ownerBotNumber,
      targetPhoneE164: updated.selectedPhoneE164,
      targetHandle: updated.targetHandle,
      sourceTaskId: updated.id,
      reason: 'target_opt_out',
    });
    await transitionTerminal(updated, 'cancelled_by_target', 'opt_out', runtime);
    return { handled: true, reason: 'target_opted_out' };
  }

  if (extraction.intent === 'wrong_number') {
    await transitionTerminal(updated, 'cancelled_by_target', 'wrong_number', runtime);
    return { handled: true, reason: 'wrong_number' };
  }

  if (extraction.intent === 'unsafe') {
    await transitionTerminal(updated, 'blocked_unsafe', 'unsafe', runtime);
    return { handled: true, reason: 'unsafe_target_reply' };
  }

  if (extraction.intent === 'refusal') {
    await transitionTerminal(updated, 'cancelled_by_target', 'refusal', runtime);
    return { handled: true, reason: 'target_refused' };
  }

  if (extraction.intent === 'needs_owner_input' && extraction.messageToOwner) {
    await updateTask(updated.id, {
      metadata: {
        ...updated.metadata,
        awaiting_owner_location: extraction.reason === 'target_left_location_to_owner',
      },
    });
    await sendAndRecordOwner(updated, extraction.messageToOwner, runtime, { intent: extraction.intent });
    return { handled: true, reason: 'needs_owner_input' };
  }

  if (extraction.intent === 'complete_answer') {
    const completedForReview = await updateTask(updated.id, {
      metadata: {
        ...updated.metadata,
        final_recipient_answer: message.text.trim(),
      },
    });
    const finalReviewPrompt = buildRecipientFinalReviewPrompt(completedForReview);
    await updateTask(updated.id, {
      metadata: {
        ...completedForReview.metadata,
        awaiting_final_recipient_note: true,
      },
      next_target_followup_at: minutesFromNowIso(15),
    });
    await sendAndRecordTarget(completedForReview, finalReviewPrompt, runtime, {
      intent: 'final_recipient_review',
      reason: extraction.reason,
    });
    return { handled: true, reason: 'asked_recipient_for_final_note' };
  }

  if (extraction.nextMessageToTarget && updated.targetFollowupCount < getContactDelegationConfig().maxTargetFollowups) {
    await sendAndRecordTarget(updated, toneAwareTargetFollowup(updated, extraction.nextMessageToTarget), runtime, {
      intent: extraction.intent,
      reason: extraction.reason,
    });
    await updateTask(updated.id, { target_followup_count: updated.targetFollowupCount + 1 });
    return { handled: true, reason: 'asked_target_clarification' };
  }

  const missing = ['date', 'time', 'timezone_or_context', 'location']
    .filter((field) => !(updated.collectedFields as Record<string, unknown>)[field])
    .join(', ');
  await updateTask(updated.id, {
    metadata: {
      ...updated.metadata,
      awaiting_owner_clarification: true,
      missing_fields_for_owner: missing,
    },
  });
  await sendAndRecordOwner(updated, `I still need ${missing || 'one more detail'} to finish this. What should I tell ${updated.targetDisplayName ?? updated.targetHandle}?`, runtime, {
    intent: extraction.intent,
    reason: extraction.reason,
  });
  return { handled: true, reason: 'asked_owner_for_missing_info' };
}

async function processDueTargetFollowup(task: ContactDelegationTask, runtime: DelegationRuntime): Promise<'sent' | 'finalised' | 'skipped'> {
  if (!task.targetChatId) return 'skipped';
  const maxNoResponseFollowups = 4;
  if (task.noResponseFollowupCount >= maxNoResponseFollowups) {
    if (isAwaitingFinalRecipientNote(task)) {
      const updated = await updateTask(task.id, {
        metadata: {
          ...task.metadata,
          awaiting_final_recipient_note: false,
          final_recipient_note: null,
          final_recipient_note_skipped_after_followups: true,
        },
        next_target_followup_at: null,
      });
      await transitionTerminal(updated, 'completed', 'completed', runtime);
      return 'finalised';
    }
    await transitionTerminal(task, 'expired', 'recipient_no_response', runtime);
    return 'finalised';
  }

  const targetName = task.targetDisplayName ?? task.targetHandle;
  const message = isAwaitingFinalRecipientNote(task)
    ? `Before I confirm this with ${task.metadata.sender_name ?? 'them'}, anything else you want me to pass on?`
    : task.noResponseFollowupCount === 0
    ? `Just following up on this for ${task.metadata.sender_name ?? 'them'}. Are you able to confirm?`
    : `Quick follow-up for ${task.metadata.sender_name ?? 'them'}: any update on this?`;

  await sendAndRecordTarget(task, message, runtime, {
    intent: 'scheduled_no_response_followup',
    followup_number: task.noResponseFollowupCount + 1,
  });

  await updateTask(task.id, {
    no_response_followup_count: task.noResponseFollowupCount + 1,
    next_target_followup_at: task.noResponseFollowupCount + 1 >= maxNoResponseFollowups
      ? minutesFromNowIso(60)
      : minutesFromNowIso(60),
    metadata: {
      ...task.metadata,
      last_no_response_followup_target: targetName,
    },
  });
  return 'sent';
}

export async function handleContactDelegationTurn(
  message: NormalisedIncomingMessage,
  authUserId: string | null,
  ownerDisplayName?: string | null,
  runtime = createContactDelegationRuntime(),
): Promise<DelegationStartResult> {
  const config = getContactDelegationConfig();
  if (!config.enabled) return { handled: false, reason: 'disabled' };
  if (!isHandleAllowedForContactDelegation(message.from, config)) {
    return { handled: false, reason: 'owner_not_allowlisted' };
  }

  const targetTask = await findActiveTargetTask(message.chatId);
  if (targetTask) {
    return handleTargetReply(targetTask, message, runtime);
  }

  const contactCard = await parseContactCardFromMessage(message);
  if (contactCard) {
    const staleTask = await findOpenOwnerTask(message.chatId);
    if (staleTask) {
      await updateTask(staleTask.id, {
        status: 'cancelled_by_owner',
        terminal_reason: 'superseded_by_contact_card',
        metadata: {
          ...staleTask.metadata,
          superseded_at: new Date().toISOString(),
        },
      });
    }

    if (await hasDurableOptOut(message.conversation.fromNumber, contactCard.phoneE164)) {
      const text = `${contactCard.name ?? 'That contact'} has asked not to be contacted by Nest before, so I won't message them.`;
      await runtime.sendOwnerMessage(message.chatId, text);
      return { handled: true, ownerMessage: text, reason: 'contact_card_target_opted_out' };
    }

    const ownerName = await resolveStoredOwnerName(message.from, ownerDisplayName);
    const task = await createDelegationTask({
      ownerChatId: message.chatId,
      ownerHandle: message.from,
      ownerAuthUserId: authUserId,
      ownerBotNumber: message.conversation.fromNumber,
      targetHandle: contactCard.phoneE164,
      targetDisplayName: contactCard.name,
      selectedContactResourceName: null,
      selectedContactAccount: null,
      selectedContactProvider: 'vcard',
      selectedPhoneE164: contactCard.phoneE164,
      originalPhone: contactCard.originalPhone,
      objective: 'contact_card_pending_message',
      expiresAt: expiryIso(config.defaultExpiryHours),
      status: 'draft',
      metadata: {
        sender_name: ownerName,
        awaiting_contact_card_objective: true,
        contact_card_source: contactCard.source,
        dry_run: runtime.dryRun,
      },
    });
    await recordTaskMessage({
      taskId: task.id,
      chatId: message.chatId,
      senderRole: 'owner',
      senderHandle: message.from,
      content: message.text || '[contact card]',
      providerMessageId: message.messageId,
      metadata: { contact_card: true, contact_name: contactCard.name, phone: contactCard.phoneE164 },
    });
    const text = `I got ${contactCard.name ?? 'this contact'} at ${contactCard.phoneE164}. Do you want me to message them? If so, what should I say?`;
    await sendAndRecordOwner(task, text, runtime, { contact_card_prompt: true });
    return { handled: true, ownerMessage: text, reason: 'contact_card_captured' };
  }

  const detection = await detectContactDelegationRequestWithReasoning(message.text);
  const openOwnerTask = await findOpenOwnerTask(message.chatId);
  if (
    openOwnerTask &&
    detection.matched &&
    !isAwaitingRecipientName(openOwnerTask) &&
    !isAwaitingContactCardObjective(openOwnerTask) &&
    !isAwaitingOwnerLocation(openOwnerTask) &&
    !isAwaitingOwnerClarification(openOwnerTask)
  ) {
    await updateTask(openOwnerTask.id, {
      status: 'cancelled_by_owner',
      terminal_reason: 'superseded_by_new_delegation_request',
      metadata: {
        ...openOwnerTask.metadata,
        superseded_at: new Date().toISOString(),
      },
    });
  } else if (openOwnerTask) {
    const continuation = await handleOwnerContinuation(openOwnerTask, message, runtime);
    if (continuation.handled) return continuation;
  }
  if (!detection.matched) return { handled: false, reason: detection.reason };

  if (detection.reason === 'unsafe_request' || isUnsafeOwnerDelegationRequest(message.text)) {
    const text = "I can't message them for that.";
    const providerMessageId = await runtime.sendOwnerMessage(message.chatId, text);
    console.warn('[contact-delegation] blocked unsafe owner request', { chatId: message.chatId, from: message.from });
    return { handled: true, ownerMessage: text, reason: `unsafe_blocked:${providerMessageId ?? 'no_provider_id'}` };
  }

  if (!detection.directPhone && !authUserId) {
    if (shouldFallThroughAfterContactMiss(message.text, detection)) {
      return { handled: false, reason: 'contact_lookup_unavailable_fallthrough' };
    }
    const text = "I need your contacts connected before I can look up who to message. Send me their phone number and I can draft it from there.";
    await runtime.sendOwnerMessage(message.chatId, text);
    return { handled: true, ownerMessage: text, reason: 'missing_auth_for_contacts' };
  }

  const contact = await resolveDelegationContact({
    authUserId,
    contactQuery: detection.contactQuery,
    directPhone: detection.directPhone,
    recipientName: detection.recipientName,
  });
  if (!contact) {
    if (shouldFallThroughAfterContactMiss(message.text, detection)) {
      return { handled: false, reason: 'contact_not_resolved_fallthrough' };
    }
    const text = detection.contactQuery
      ? `I couldn't find a phone number for ${detection.contactQuery}. Can you send me their number?`
      : 'Who should I message? Send me a contact name or phone number.';
    await runtime.sendOwnerMessage(message.chatId, text);
    return { handled: true, ownerMessage: text, reason: 'contact_not_resolved' };
  }
  if (contact.ambiguityReason) {
    const text = formatContactAmbiguity(contact, detection.contactQuery ?? 'that contact');
    await runtime.sendOwnerMessage(message.chatId, text);
    return { handled: true, ownerMessage: text, reason: contact.ambiguityReason };
  }

  if (await hasDurableOptOut(message.conversation.fromNumber, contact.selectedPhoneE164)) {
    const text = "They've asked not to be contacted by Nest before, so I won't message them.";
    await runtime.sendOwnerMessage(message.chatId, text);
    return { handled: true, ownerMessage: text, reason: 'target_opted_out_previously' };
  }

  const objective = detection.objective ?? message.text;
  if (!contact.targetDisplayName?.trim()) {
    const ownerName = await resolveStoredOwnerName(message.from, ownerDisplayName);
    const text = `What's the recipient's name? I need it before I draft the message.`;
    const task = await createDelegationTask({
      ownerChatId: message.chatId,
      ownerHandle: message.from,
      ownerAuthUserId: authUserId,
      ownerBotNumber: message.conversation.fromNumber,
      targetHandle: contact.targetHandle,
      targetDisplayName: null,
      selectedContactResourceName: contact.selectedContactResourceName,
      selectedContactAccount: contact.selectedContactAccount,
      selectedContactProvider: contact.selectedContactProvider,
      selectedPhoneE164: contact.selectedPhoneE164,
      originalPhone: contact.originalPhone,
      objective,
      expiresAt: expiryIso(config.defaultExpiryHours),
      collectedFields: initialFieldsFromObjective(objective),
      status: 'draft',
      metadata: {
        detection_reason: detection.reason,
        requested_tone: detection.requestedTone,
        reason_for_message: detection.reasonForMessage ?? objective,
        sender_name: ownerName,
        awaiting_recipient_name: true,
        dry_run: runtime.dryRun,
      },
    });
    await recordTaskMessage({
      taskId: task.id,
      chatId: message.chatId,
      senderRole: 'owner',
      senderHandle: message.from,
      content: message.text,
      providerMessageId: message.messageId,
    });
    await sendAndRecordOwner(task, text, runtime, { reminder: 'recipient_name' });
    return { handled: true, ownerMessage: text, reason: 'missing_recipient_name' };
  }
  const targetName = contact.targetDisplayName;
  const ownerName = await resolveStoredOwnerName(message.from, ownerDisplayName);
  const reasonForMessage = detection.reasonForMessage ?? objective;
  const openerText = await buildTargetOpenerWithReasoning({
    ownerName,
    targetName,
    objective,
    reasonForMessage,
    requestedTone: detection.requestedTone,
  });
  const ownerApprovalText = buildOwnerApprovalPrompt({
    senderName: ownerName,
    targetName,
    objective,
    reasonForMessage,
    draftMessage: openerText,
  });
  const task = await createDelegationTask({
    ownerChatId: message.chatId,
    ownerHandle: message.from,
    ownerAuthUserId: authUserId,
    ownerBotNumber: message.conversation.fromNumber,
    targetHandle: contact.targetHandle,
    targetDisplayName: contact.targetDisplayName,
    selectedContactResourceName: contact.selectedContactResourceName,
    selectedContactAccount: contact.selectedContactAccount,
    selectedContactProvider: contact.selectedContactProvider,
    selectedPhoneE164: contact.selectedPhoneE164,
    originalPhone: contact.originalPhone,
    objective,
    expiresAt: expiryIso(config.defaultExpiryHours),
    collectedFields: initialFieldsFromObjective(objective),
    openerText,
    ownerApprovalText,
    metadata: {
      detection_reason: detection.reason,
      requested_tone: detection.requestedTone,
      reason_for_message: reasonForMessage,
      dry_run: runtime.dryRun,
    },
  });

  await recordTaskMessage({
    taskId: task.id,
    chatId: message.chatId,
    senderRole: 'owner',
    senderHandle: message.from,
    content: message.text,
    providerMessageId: message.messageId,
  });
  await sendAndRecordOwner(task, ownerApprovalText, runtime, { approval_prompt: true });
  return { handled: true, ownerMessage: ownerApprovalText, reason: 'awaiting_owner_approval' };
}

export async function handleContactDelegationContactCardTurn(
  message: NormalisedIncomingMessage,
  runtime = createContactDelegationRuntime(),
): Promise<DelegationStartResult> {
  const config = getContactDelegationConfig();
  if (!config.enabled) return { handled: false, reason: 'disabled' };
  if (!isHandleAllowedForContactDelegation(message.from, config)) {
    return { handled: false, reason: 'owner_not_allowlisted' };
  }

  const contactCard = await parseContactCardFromMessage(message);
  if (!contactCard) return { handled: false, reason: 'no_contact_card' };

  const staleTask = await findOpenOwnerTask(message.chatId);
  if (staleTask) {
    await updateTask(staleTask.id, {
      status: 'cancelled_by_owner',
      terminal_reason: 'superseded_by_contact_card',
      metadata: {
        ...staleTask.metadata,
        superseded_at: new Date().toISOString(),
      },
    });
  }

  if (await hasDurableOptOut(message.conversation.fromNumber, contactCard.phoneE164)) {
    const text = `${contactCard.name ?? 'That contact'} has asked not to be contacted by Nest before, so I won't message them.`;
    await runtime.sendOwnerMessage(message.chatId, text);
    return { handled: true, ownerMessage: text, reason: 'contact_card_target_opted_out' };
  }

  const ownerName = await resolveStoredOwnerName(message.from, null);
  const task = await createDelegationTask({
    ownerChatId: message.chatId,
    ownerHandle: message.from,
    ownerAuthUserId: null,
    ownerBotNumber: message.conversation.fromNumber,
    targetHandle: contactCard.phoneE164,
    targetDisplayName: contactCard.name,
    selectedContactResourceName: null,
    selectedContactAccount: null,
    selectedContactProvider: 'vcard',
    selectedPhoneE164: contactCard.phoneE164,
    originalPhone: contactCard.originalPhone,
    objective: 'contact_card_pending_message',
    expiresAt: expiryIso(config.defaultExpiryHours),
    status: 'draft',
    metadata: {
      sender_name: ownerName,
      awaiting_contact_card_objective: true,
      contact_card_source: contactCard.source,
      dry_run: runtime.dryRun,
    },
  });
  await recordTaskMessage({
    taskId: task.id,
    chatId: message.chatId,
    senderRole: 'owner',
    senderHandle: message.from,
    content: message.text || '[contact card]',
    providerMessageId: message.messageId,
    metadata: { contact_card: true, contact_name: contactCard.name, phone: contactCard.phoneE164 },
  });
  const text = `I got ${contactCard.name ?? 'this contact'} at ${contactCard.phoneE164}. Do you want me to message them? If so, what should I say?`;
  await sendAndRecordOwner(task, text, runtime, { contact_card_prompt: true });
  return { handled: true, ownerMessage: text, reason: 'contact_card_captured' };
}

export async function handleContactDelegationTargetReply(
  message: NormalisedIncomingMessage,
  runtime = createContactDelegationRuntime(),
): Promise<DelegationStartResult> {
  if (!getContactDelegationConfig().enabled) return { handled: false, reason: 'disabled' };
  const targetTask = await findActiveTargetTask(message.chatId);
  if (!targetTask) {
    const recentTask = await findRecentTargetTask(message.chatId);
    if (!recentTask) return { handled: false, reason: 'no_active_target_task' };
    if (recentTask.status === 'completed') {
      return { handled: false, reason: 'completed_task_released_to_normal_nest' };
    }

    const recorded = await recordTaskMessage({
      taskId: recentTask.id,
      chatId: message.chatId,
      senderRole: 'target',
      senderHandle: message.from,
      content: message.text,
      providerMessageId: message.messageId,
      metadata: { after_terminal_state: true, task_status: recentTask.status },
    });
    if (!recorded) return { handled: true, reason: 'duplicate_recent_target_message' };

    const senderName = typeof recentTask.metadata.sender_name === 'string' ? recentTask.metadata.sender_name : 'the sender';
    await sendAndRecordOwner(
      recentTask,
      `${recentTask.targetDisplayName ?? recentTask.targetHandle} replied after that outreach thread had closed: "${message.text.trim()}".`,
      runtime,
      { after_terminal_target_reply: true, task_status: recentTask.status },
    );
    if (message.text.trim()) {
      await sendAndRecordTarget(
        recentTask,
        `Thanks, I've passed that on to ${senderName}.`,
        runtime,
        { after_terminal_ack: true, task_status: recentTask.status },
      );
    }
    return { handled: true, reason: 'recent_terminal_target_reply_forwarded' };
  }
  return handleTargetReply(targetTask, message, runtime);
}

export async function expireDueContactDelegationTasks(
  limit = 25,
  runtime = createContactDelegationRuntime(),
): Promise<ExpiryResult> {
  const tasks = await listExpiredTasks(limit);
  const followups = await listDueTargetFollowups(limit);
  let expired = 0;
  let followupSent = 0;
  let failed = 0;
  const taskIds: string[] = [];

  for (const task of followups) {
    try {
      const fresh = await getTask(task.id);
      if (!fresh || fresh.status !== 'active') continue;
      const result = await processDueTargetFollowup(fresh, runtime);
      if (result === 'sent') followupSent++;
      if (result === 'finalised') expired++;
      taskIds.push(task.id);
    } catch (error) {
      failed++;
      console.error('[contact-delegation] follow-up failed', { taskId: task.id, error });
    }
  }

  for (const task of tasks) {
    try {
      const fresh = await getTask(task.id);
      if (!fresh || !['awaiting_owner_approval', 'awaiting_target_start', 'active'].includes(fresh.status)) continue;
      await transitionTerminal(fresh, 'expired', 'expired', runtime);
      expired++;
      taskIds.push(task.id);
    } catch (error) {
      failed++;
      console.error('[contact-delegation] expiry failed', { taskId: task.id, error });
    }
  }

  return {
    processed: tasks.length,
    expired,
    receiptRetried: followupSent,
    failed,
    taskIds,
  };
}
