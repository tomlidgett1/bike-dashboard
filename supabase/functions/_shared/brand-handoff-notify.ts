/**
 * Text the business handoff mobile (Linq Partner API — new chat with initial message).
 * Uses the same sender resolution as Twilio voice welcome SMS.
 */
import { createChat } from './linq.ts';
import { getListEnv, getOptionalEnv } from './env.ts';

function resolveLinqFrom(): string {
  const explicit = getOptionalEnv('LINQ_VOICE_FROM');
  if (explicit) return explicit;
  const first = getListEnv('LINQ_AGENT_BOT_NUMBERS')[0];
  if (first) return first;
  throw new Error('Configure LINQ_VOICE_FROM or LINQ_AGENT_BOT_NUMBERS for Linq sender (from)');
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Super short ping: business name, customer number, thread snippet.
 * Linq delivers as SMS or iMessage depending on recipient / routing.
 */
export async function sendBrandHandoffStaffPing(params: {
  staffPhoneE164: string;
  businessName: string;
  customerE164: string;
  threadSummary: string;
}): Promise<void> {
  const from = resolveLinqFrom();
  const summary = truncate(params.threadSummary.replace(/\s+/g, ' '), 180);
  const text = truncate(
    [
      `Nest handoff — ${params.businessName}`,
      `Call: ${params.customerE164}`,
      summary ? `Context: ${summary}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    900,
  );
  await createChat(from, [params.staffPhoneE164.trim()], text);
}
