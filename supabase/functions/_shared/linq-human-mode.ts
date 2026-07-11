import { getAdminClient } from './supabase.ts';

const TABLE = 'linq_human_mode_threads';

export interface ActiveLinqHumanMode {
  id: string;
  chatId: string;
  recipientHandle: string;
  botNumber: string;
  brandKey: string;
  source: string;
}

interface HumanModeRow {
  id: string;
  chat_id: string;
  recipient_handle: string;
  bot_number: string;
  brand_key: string;
  source: string;
}

function normaliseHandle(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

function mapRow(row: HumanModeRow): ActiveLinqHumanMode {
  return {
    id: row.id,
    chatId: row.chat_id,
    recipientHandle: row.recipient_handle,
    botNumber: row.bot_number,
    brandKey: row.brand_key,
    source: row.source,
  };
}

export async function findActiveLinqHumanMode(params: {
  chatId: string;
  recipientHandle?: string | null;
  botNumber?: string | null;
}): Promise<ActiveLinqHumanMode | null> {
  const chatId = normaliseHandle(params.chatId);
  const recipientHandle = normaliseHandle(params.recipientHandle);
  const botNumber = normaliseHandle(params.botNumber);
  const supabase = getAdminClient();

  if (chatId) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, chat_id, recipient_handle, bot_number, brand_key, source')
      .eq('chat_id', chatId)
      .is('released_at', null)
      .maybeSingle<HumanModeRow>();

    if (error) {
      console.warn('[linq-human-mode] lookup by chat failed:', error.message);
    } else if (data) {
      return mapRow(data);
    }
  }

  if (!recipientHandle || !botNumber) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select('id, chat_id, recipient_handle, bot_number, brand_key, source')
    .eq('recipient_handle', recipientHandle)
    .eq('bot_number', botNumber)
    .is('released_at', null)
    .maybeSingle<HumanModeRow>();

  if (error) {
    console.warn('[linq-human-mode] lookup by recipient failed:', error.message);
    return null;
  }

  return data ? mapRow(data) : null;
}

export async function activateLinqHumanMode(params: {
  chatId: string;
  recipientHandle: string;
  botNumber: string;
  brandKey: string;
  source: 'brand_portal_manual_reply' | 'brand_portal_start_message' | 'linq_human_mode_bypass' | 'system';
  activatedBy?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ActiveLinqHumanMode | null> {
  const now = new Date().toISOString();
  const recipientHandle = normaliseHandle(params.recipientHandle);
  const botNumber = normaliseHandle(params.botNumber);
  const chatId = normaliseHandle(params.chatId);
  const brandKey = normaliseHandle(params.brandKey).toLowerCase();

  if (!chatId || !recipientHandle || !botNumber || !brandKey) return null;

  const supabase = getAdminClient();
  const existing = await findActiveLinqHumanMode({ chatId, recipientHandle, botNumber });
  if (existing && existing.brandKey !== brandKey) {
    console.warn('[linq-human-mode] active row belongs to another brand', {
      recipientHandle,
      botNumber,
      existingBrandKey: existing.brandKey,
      requestedBrandKey: brandKey,
    });
    return null;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .upsert({
      chat_id: chatId,
      recipient_handle: recipientHandle,
      bot_number: botNumber,
      brand_key: brandKey,
      source: params.source,
      activated_by: params.activatedBy ?? null,
      activated_at: now,
      last_staff_message_at: now,
      released_at: null,
      released_reason: null,
      release_route: null,
      release_brand_key: null,
      metadata: params.metadata ?? {},
    }, { onConflict: 'recipient_handle,bot_number' })
    .select('id, chat_id, recipient_handle, bot_number, brand_key, source')
    .single<HumanModeRow>();

  if (error) {
    console.error('[linq-human-mode] activate failed:', error.message);
    return null;
  }

  return mapRow(data);
}

export async function touchLinqHumanModeInbound(params: {
  id: string;
  chatId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const patch: Record<string, unknown> = {
    chat_id: params.chatId,
    last_inbound_at: new Date().toISOString(),
  };
  if (params.metadata) patch.metadata = params.metadata;

  const { error } = await getAdminClient()
    .from(TABLE)
    .update(patch)
    .eq('id', params.id)
    .is('released_at', null);

  if (error) {
    console.warn('[linq-human-mode] inbound touch failed:', error.message);
  }
}

export async function releaseLinqHumanMode(params: {
  chatId?: string | null;
  recipientHandle?: string | null;
  botNumber?: string | null;
  reason: 'route_switch' | 'twilio_brand_mode' | 'manual' | 'system';
  releaseRoute?: string | null;
  releaseBrandKey?: string | null;
}): Promise<void> {
  const chatId = normaliseHandle(params.chatId);
  const recipientHandle = normaliseHandle(params.recipientHandle);
  const botNumber = normaliseHandle(params.botNumber);
  const patch = {
    released_at: new Date().toISOString(),
    released_reason: params.reason,
    release_route: params.releaseRoute ?? null,
    release_brand_key: params.releaseBrandKey ?? null,
  };

  if (chatId) {
    const { data, error } = await getAdminClient()
      .from(TABLE)
      .update(patch)
      .eq('chat_id', chatId)
      .is('released_at', null)
      .select('id');

    if (error) {
      console.warn('[linq-human-mode] release by chat failed:', error.message);
    }
    if (!error && Array.isArray(data) && data.length > 0) return;
  }

  if (!recipientHandle || !botNumber) return;

  const { error } = await getAdminClient()
    .from(TABLE)
    .update(patch)
    .eq('recipient_handle', recipientHandle)
    .eq('bot_number', botNumber)
    .is('released_at', null);

  if (error) {
    console.warn('[linq-human-mode] release by recipient failed:', error.message);
  }
}
