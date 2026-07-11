import { getOptionalEnv } from './env.ts';
import {
  buildPhoneKnowledgeBlock,
  fetchBrandKnowledgeItems,
  injectKnowledgeBlock,
  injectOutboundCallBlock,
  NEST_OUTBOUND_FIRST_MESSAGE,
  stripKnowledgeBlock,
  stripOutboundCallBlock,
} from './brand-knowledge.ts';

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';

export type ElevenLabsAgentRestoreSnapshot = {
  first_message: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function extractAgentSystemPrompt(agentPayload: Record<string, unknown>): string {
  const cc = asRecord(agentPayload.conversation_config);
  const agent = asRecord(cc.agent);
  const prompt = asRecord(agent.prompt);
  return typeof prompt.prompt === 'string' ? prompt.prompt : '';
}

export function extractAgentFirstMessage(agentPayload: Record<string, unknown>): string {
  const cc = asRecord(agentPayload.conversation_config);
  const agent = asRecord(cc.agent);
  return typeof agent.first_message === 'string' ? agent.first_message : '';
}

function buildPatchBody(patch: {
  systemPrompt?: string;
  firstMessage?: string;
}): Record<string, unknown> {
  const agent: Record<string, unknown> = {};
  if (patch.firstMessage !== undefined) agent.first_message = patch.firstMessage;
  if (patch.systemPrompt !== undefined) agent.prompt = { prompt: patch.systemPrompt };
  if (Object.keys(agent).length === 0) return {};
  return { conversation_config: { agent } };
}

export async function fetchElevenLabsAgent(agentId: string): Promise<Record<string, unknown>> {
  const apiKey = getOptionalEnv('ELEVENLABS_API_KEY');
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured');

  const response = await fetch(
    `${ELEVENLABS_API}/convai/agents/${encodeURIComponent(agentId)}`,
    { headers: { 'xi-api-key': apiKey, Accept: 'application/json' } },
  );
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.detail === 'string'
      ? payload.detail
      : `ElevenLabs agent fetch failed: ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

export async function patchElevenLabsAgent(
  agentId: string,
  patch: { systemPrompt?: string; firstMessage?: string },
): Promise<void> {
  const body = buildPatchBody(patch);
  if (Object.keys(body).length === 0) return;

  const apiKey = getOptionalEnv('ELEVENLABS_API_KEY');
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured');

  const response = await fetch(
    `${ELEVENLABS_API}/convai/agents/${encodeURIComponent(agentId)}`,
    {
      method: 'PATCH',
      headers: {
        'xi-api-key': apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    const message = typeof payload.detail === 'string'
      ? payload.detail
      : `ElevenLabs agent patch failed: ${response.status}`;
    throw new Error(message);
  }
}

export function composePhoneAgentSystemPrompt(
  existingPrompt: string,
  phoneKnowledgeBlock: string,
): string {
  const core = stripKnowledgeBlock(stripOutboundCallBlock(existingPrompt));
  const withOutbound = injectOutboundCallBlock(core);
  return injectKnowledgeBlock(withOutbound, phoneKnowledgeBlock);
}

/**
 * Swaps the linked voice agent to an outbound opening + call_goal-aware system prompt.
 * Returns a snapshot so inbound first_message can be restored after the call.
 */
export async function prepareElevenLabsAgentForNestOutbound(
  agentId: string,
  brandKey: string,
  supabase: { from: (table: string) => unknown },
): Promise<ElevenLabsAgentRestoreSnapshot> {
  if ((getOptionalEnv('NEST_OUTBOUND_SKIP_AGENT_PROMPT_SYNC') || 'false') === 'true') {
    return { first_message: '' };
  }

  const agentPayload = await fetchElevenLabsAgent(agentId);
  const restore: ElevenLabsAgentRestoreSnapshot = {
    first_message: extractAgentFirstMessage(agentPayload),
  };

  const items = await fetchBrandKnowledgeItems(supabase, brandKey);
  const phoneKb = buildPhoneKnowledgeBlock(items);
  const nextPrompt = composePhoneAgentSystemPrompt(extractAgentSystemPrompt(agentPayload), phoneKb);

  await patchElevenLabsAgent(agentId, {
    firstMessage: NEST_OUTBOUND_FIRST_MESSAGE,
    systemPrompt: nextPrompt,
  });

  console.log('[nest-outbound] Prepared ElevenLabs agent for outbound (first_message + call_goal prompt)', {
    agentId,
    brandKey,
  });

  return restore;
}

export async function restoreElevenLabsAgentAfterNestOutbound(
  agentId: string,
  snapshot: ElevenLabsAgentRestoreSnapshot | null | undefined,
): Promise<void> {
  if ((getOptionalEnv('NEST_OUTBOUND_SKIP_AGENT_PROMPT_SYNC') || 'false') === 'true') {
    return;
  }
  if (!agentId || !snapshot || typeof snapshot.first_message !== 'string') return;

  await patchElevenLabsAgent(agentId, { firstMessage: snapshot.first_message });
  console.log('[nest-outbound] Restored ElevenLabs agent inbound first_message', { agentId });
}
