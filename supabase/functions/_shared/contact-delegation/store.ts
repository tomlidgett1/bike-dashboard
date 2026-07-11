import { getAdminClient } from '../supabase.ts';
import type {
  ContactDelegationMessage,
  ContactDelegationSenderRole,
  ContactDelegationStatus,
  ContactDelegationTask,
  DelegationCollectedFields,
} from './types.ts';

type JsonRecord = Record<string, unknown>;

const OPEN_OWNER_STATUSES: ContactDelegationStatus[] = [
  'draft',
  'awaiting_owner_approval',
  'awaiting_target_start',
  'active',
];

const ACTIVE_TARGET_STATUSES: ContactDelegationStatus[] = [
  'awaiting_target_start',
  'recipient_opt_in',
  'active',
];

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function rowToTask(row: Record<string, unknown>): ContactDelegationTask {
  return {
    id: row.id as string,
    ownerChatId: row.owner_chat_id as string,
    ownerHandle: row.owner_handle as string,
    ownerAuthUserId: row.owner_auth_user_id as string | null,
    ownerBotNumber: row.owner_bot_number as string,
    targetChatId: row.target_chat_id as string | null,
    targetHandle: row.target_handle as string,
    targetDisplayName: row.target_display_name as string | null,
    selectedContactResourceName: row.selected_contact_resource_name as string | null,
    selectedContactAccount: row.selected_contact_account as string | null,
    selectedContactProvider: row.selected_contact_provider as string | null,
    selectedPhoneE164: row.selected_phone_e164 as string,
    originalPhone: row.original_phone as string | null,
    objective: row.objective as string,
    objectiveType: row.objective_type as string,
    requiredFields: Array.isArray(row.required_fields) ? row.required_fields as string[] : [],
    collectedFields: asRecord(row.collected_fields) as DelegationCollectedFields,
    fieldEvidence: asRecord(row.field_evidence),
    status: row.status as ContactDelegationStatus,
    openerText: row.opener_text as string | null,
    taskOpenerText: row.task_opener_text as string | null,
    ownerApprovalText: row.owner_approval_text as string | null,
    confirmationNonce: row.confirmation_nonce as string,
    targetFollowupCount: (row.target_followup_count as number | null) ?? 0,
    noResponseFollowupCount: (row.no_response_followup_count as number | null) ?? 0,
    ownerOutboundCount: (row.owner_outbound_count as number | null) ?? 0,
    openerIdempotencyKey: row.opener_idempotency_key as string | null,
    ownerReceiptSentAt: row.owner_receipt_sent_at as string | null,
    lastOwnerNotifiedAt: row.last_owner_notified_at as string | null,
    lastTargetMessageAt: row.last_target_message_at as string | null,
    nextTargetFollowupAt: row.next_target_followup_at as string | null,
    targetResponseDeadlineAt: row.target_response_deadline_at as string | null,
    expiresAt: row.expires_at as string,
    completedAt: row.completed_at as string | null,
    terminalReason: row.terminal_reason as string | null,
    metadata: asRecord(row.metadata),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToMessage(row: Record<string, unknown>): ContactDelegationMessage {
  return {
    id: row.id as number,
    taskId: row.task_id as string,
    chatId: row.chat_id as string,
    senderRole: row.sender_role as ContactDelegationSenderRole,
    senderHandle: row.sender_handle as string | null,
    content: row.content as string,
    providerMessageId: row.provider_message_id as string | null,
    metadata: asRecord(row.metadata),
    createdAt: row.created_at as string,
  };
}

export async function findOpenOwnerTask(ownerChatId: string): Promise<ContactDelegationTask | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('contact_delegation_tasks')
    .select('*')
    .eq('owner_chat_id', ownerChatId)
    .in('status', OPEN_OWNER_STATUSES)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToTask(data as Record<string, unknown>) : null;
}

export async function findActiveTargetTask(targetChatId: string): Promise<ContactDelegationTask | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('contact_delegation_tasks')
    .select('*')
    .eq('target_chat_id', targetChatId)
    .in('status', ACTIVE_TARGET_STATUSES)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToTask(data as Record<string, unknown>) : null;
}

export async function findRecentTargetTask(targetChatId: string): Promise<ContactDelegationTask | null> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('contact_delegation_tasks')
    .select('*')
    .eq('target_chat_id', targetChatId)
    .gte('created_at', since)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToTask(data as Record<string, unknown>) : null;
}

export async function getTask(taskId: string): Promise<ContactDelegationTask | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('contact_delegation_tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToTask(data as Record<string, unknown>) : null;
}

export async function hasDurableOptOut(botNumber: string, targetPhoneE164: string): Promise<boolean> {
  const supabase = getAdminClient();
  const { count, error } = await supabase
    .from('contact_delegation_opt_outs')
    .select('id', { count: 'exact', head: true })
    .eq('bot_number', botNumber)
    .eq('target_phone_e164', targetPhoneE164);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function countOwnerTasksToday(ownerChatId: string): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const supabase = getAdminClient();
  const { count, error } = await supabase
    .from('contact_delegation_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('owner_chat_id', ownerChatId)
    .gte('created_at', since.toISOString());
  if (error) throw error;
  return count ?? 0;
}

export async function createDelegationTask(input: {
  ownerChatId: string;
  ownerHandle: string;
  ownerAuthUserId: string | null;
  ownerBotNumber: string;
  targetHandle: string;
  targetDisplayName: string | null;
  selectedContactResourceName: string | null;
  selectedContactAccount: string | null;
  selectedContactProvider: string | null;
  selectedPhoneE164: string;
  originalPhone: string | null;
  objective: string;
  expiresAt: string;
  collectedFields?: Record<string, unknown>;
  openerText?: string | null;
  taskOpenerText?: string | null;
  ownerApprovalText?: string | null;
  status?: ContactDelegationStatus;
  metadata?: JsonRecord;
}): Promise<ContactDelegationTask> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('contact_delegation_tasks')
    .insert({
      owner_chat_id: input.ownerChatId,
      owner_handle: input.ownerHandle,
      owner_auth_user_id: input.ownerAuthUserId,
      owner_bot_number: input.ownerBotNumber,
      target_handle: input.targetHandle,
      target_display_name: input.targetDisplayName,
      selected_contact_resource_name: input.selectedContactResourceName,
      selected_contact_account: input.selectedContactAccount,
      selected_contact_provider: input.selectedContactProvider,
      selected_phone_e164: input.selectedPhoneE164,
      original_phone: input.originalPhone,
      objective: input.objective,
      expires_at: input.expiresAt,
      collected_fields: input.collectedFields ?? {},
      opener_text: input.openerText ?? null,
      task_opener_text: input.taskOpenerText ?? null,
      owner_approval_text: input.ownerApprovalText ?? null,
      status: input.status ?? 'awaiting_owner_approval',
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();

  if (error) throw error;
  return rowToTask(data as Record<string, unknown>);
}

export async function updateTask(taskId: string, patch: Record<string, unknown>): Promise<ContactDelegationTask> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('contact_delegation_tasks')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .select('*')
    .single();
  if (error) throw error;
  return rowToTask(data as Record<string, unknown>);
}

export async function recordTaskMessage(input: {
  taskId: string;
  chatId: string;
  senderRole: ContactDelegationSenderRole;
  senderHandle?: string | null;
  content: string;
  providerMessageId?: string | null;
  metadata?: JsonRecord;
}): Promise<ContactDelegationMessage | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('contact_delegation_messages')
    .insert({
      task_id: input.taskId,
      chat_id: input.chatId,
      sender_role: input.senderRole,
      sender_handle: input.senderHandle ?? null,
      content: input.content,
      provider_message_id: input.providerMessageId ?? null,
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();

  if (error) {
    if ((error as { code?: string }).code === '23505') return null;
    throw error;
  }
  return rowToMessage(data as Record<string, unknown>);
}

export async function writeDurableOptOut(input: {
  botNumber: string;
  targetPhoneE164: string;
  targetHandle: string | null;
  sourceTaskId: string;
  reason: string;
  metadata?: JsonRecord;
}): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase
    .from('contact_delegation_opt_outs')
    .upsert({
      bot_number: input.botNumber,
      target_phone_e164: input.targetPhoneE164,
      target_handle: input.targetHandle,
      source_task_id: input.sourceTaskId,
      reason: input.reason,
      metadata: input.metadata ?? {},
    }, { onConflict: 'bot_number,target_phone_e164' });
  if (error) throw error;
}

export async function listExpiredTasks(limit = 25): Promise<ContactDelegationTask[]> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('contact_delegation_tasks')
    .select('*')
    .in('status', ['awaiting_owner_approval', 'awaiting_target_start', 'active'])
    .lte('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map(rowToTask);
}

export async function listDueTargetFollowups(limit = 25): Promise<ContactDelegationTask[]> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('contact_delegation_tasks')
    .select('*')
    .eq('status', 'active')
    .not('target_chat_id', 'is', null)
    .not('next_target_followup_at', 'is', null)
    .lte('next_target_followup_at', new Date().toISOString())
    .order('next_target_followup_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map(rowToTask);
}
