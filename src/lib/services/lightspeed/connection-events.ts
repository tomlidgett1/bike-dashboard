/**
 * Durable audit trail for Lightspeed OAuth / token lifecycle.
 * Never log raw tokens or secrets — metadata only.
 */

import { createServiceRoleClient } from '@/lib/supabase/server'
import type { LightspeedConnectionStatus } from './types'

export type LightspeedConnectionEventType =
  | 'oauth_initiated'
  | 'oauth_callback_success'
  | 'oauth_callback_failed'
  | 'token_refresh_started'
  | 'token_refresh_success'
  | 'token_refresh_failed'
  | 'stale_refresh_suppressed'
  | 'lock_contention'
  | 'lock_failed'
  | 'status_changed'
  | 'manual_disconnect'
  | 'already_connected_skipped'

export interface LogLightspeedConnectionEventInput {
  userId: string
  connectionId?: string | null
  eventType: LightspeedConnectionEventType
  source?: string
  previousStatus?: LightspeedConnectionStatus | null
  newStatus?: LightspeedConnectionStatus | null
  tokenGeneration?: number | null
  tokenExpiresAt?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  metadata?: Record<string, unknown>
}

export async function logLightspeedConnectionEvent(
  input: LogLightspeedConnectionEventInput,
): Promise<void> {
  try {
    const supabase = createServiceRoleClient()
    const { error } = await supabase.from('lightspeed_connection_events').insert({
      user_id: input.userId,
      connection_id: input.connectionId ?? null,
      event_type: input.eventType,
      source: input.source ?? null,
      previous_status: input.previousStatus ?? null,
      new_status: input.newStatus ?? null,
      token_generation: input.tokenGeneration ?? null,
      token_expires_at: input.tokenExpiresAt ?? null,
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
      metadata: input.metadata ?? null,
    })

    if (error) {
      console.error('[Lightspeed] Failed to log connection event:', error)
    }
  } catch (error) {
    console.error('[Lightspeed] Connection event logger error:', error)
  }
}
