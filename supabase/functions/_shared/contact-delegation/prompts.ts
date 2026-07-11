import type { ContactDelegationTask, DelegationCollectedFields } from './types.ts';
import { getOpenAIClient, getResponseText, MODEL_MAP, REASONING_EFFORT } from '../ai/models.ts';

function isSchedulingTask(task: Pick<ContactDelegationTask, 'objective' | 'collectedFields'>): boolean {
  const text = task.objective.toLowerCase();
  return /\b(dinner|lunch|breakfast|coffee|drink|meet|meeting|catch up|catch-up|schedule|arrange|book)\b/.test(text) ||
    Boolean(task.collectedFields.time || task.collectedFields.location);
}

export function polishQuestionMarks(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => {
      const trimmed = sentence.trim();
      if (!trimmed || /[?]$/.test(trimmed)) return trimmed;
      const isQuestion =
        /^(who|what|when|where|why|how|can|could|would|will|do|does|did|is|are|should)\b/i.test(trimmed) ||
        /\b(let me know|could you let me know|can you let me know|are you able to|would you like to|anything else)\b/i.test(trimmed);
      return isQuestion ? trimmed.replace(/[.!]*$/, '?') : trimmed;
    })
    .join(' ');
}

export function buildOwnerApprovalPrompt(params: {
  senderName: string;
  targetName: string;
  objective: string;
  reasonForMessage: string;
  draftMessage: string;
}): string {
  return [
    'I can send this, but I need your approval first.',
    '',
    `Sender: ${params.senderName}`,
    `Recipient: ${params.targetName}`,
    `Reason: ${params.reasonForMessage}`,
    '',
    'Draft first message:',
    params.draftMessage,
    '',
    'Reply "send it" to approve, or tell me what to change.',
  ].join('\n');
}

export function buildRecipientOptInPrompt(params: {
  ownerName: string;
  targetName: string;
  reasonForMessage: string;
}): string {
  return polishQuestionMarks(
    `Hi ${params.targetName}, I'm Nest, ${params.ownerName}'s AI assistant. ${params.ownerName} asked me to help pass along a message: ${params.reasonForMessage}. Is it okay if I message you about it here?`,
  );
}

export function buildTargetOpener(params: {
  ownerName: string;
  targetName: string;
  objective: string;
  reasonForMessage: string;
  requestedTone?: string | null;
}): string {
  const tone = params.requestedTone ?? 'professional';
  const reason = params.reasonForMessage.trim() || params.objective;
  const assistantDisclosure = `I'm Nest, ${params.ownerName}'s AI assistant.`;
  const lowerReason = reason.toLowerCase();
  const dinnerMatch = /\bdinner\b/.test(lowerReason);
  const dateText = /\btomorrow\b/.test(lowerReason) ? 'tomorrow night' : 'soon';
  const placeText = /\btokyo\b/i.test(reason) ? 'in Tokyo' : '';

  if (dinnerMatch) {
    if (tone === 'funny' || tone === 'playful' || tone === 'cheeky') {
      return `Hey ${params.targetName}, ${assistantDisclosure} ${params.ownerName} asked me to see if you're free for dinner ${dateText} ${placeText}. I realise being asked by an AI bird in your texts is unusual, but here we are. What time works for you, and where should we go?`;
    }

    if (tone === 'casual' || tone === 'warm' || tone === 'friendly') {
      return `Hey ${params.targetName}, ${assistantDisclosure} ${params.ownerName} asked me to help arrange dinner ${dateText} ${placeText}. What time works for you, and where would you like to meet?`;
    }

    return `Hi ${params.targetName}, ${assistantDisclosure} ${params.ownerName} asked me to help arrange dinner ${dateText} ${placeText}. What time works for you, and where would you like to meet?`;
  }

  if (tone === 'funny' || tone === 'playful' || tone === 'cheeky') {
    return `Hey ${params.targetName}, ${assistantDisclosure} ${params.ownerName} asked me to reach out: ${reason}. I promise I'm less awkward than a group chat. Could you let me know?`;
  }

  if (tone === 'casual' || tone === 'warm' || tone === 'friendly') {
    return `Hey ${params.targetName}, ${assistantDisclosure} ${params.ownerName} asked me to reach out: ${reason}. Could you let me know?`;
  }

  return `Hi ${params.targetName}, ${assistantDisclosure} ${params.ownerName} asked me to reach out: ${reason}. Could you let me know?`;
}

export async function buildTargetOpenerWithReasoning(params: {
  ownerName: string;
  targetName: string;
  objective: string;
  reasonForMessage: string;
  requestedTone?: string | null;
  revisionInstruction?: string | null;
}): Promise<string> {
  try {
    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: MODEL_MAP.agent,
      instructions: `You write first outbound iMessage drafts for Nest, an AI assistant texting a recipient on behalf of a sender.

Rules:
- Output ONLY the message body. No labels, no markdown, no quote marks.
- Always disclose that you are Nest, the sender's AI assistant.
- Use the sender's actual name and recipient's actual name.
- Do not parrot the sender's command. Turn it into a natural message to the recipient.
- If the sender requested a tone, use it naturally. If not, be professional and warm.
- Ask a sensible question only if the request needs an answer.
- Do not say "what works for you" unless the task is actually scheduling or coordinating options.
- Keep it under 120 words.
- The message MUST be a complete sentence. Never end mid-sentence.
- If a revision instruction is provided, revise the previous intent accordingly.
- No emojis. No em dashes.`,
      input: `Sender: ${params.ownerName}
Recipient: ${params.targetName}
Requested tone: ${params.requestedTone ?? 'professional'}
Sender request: ${params.objective}
Reason/message intent: ${params.reasonForMessage}
Revision instruction: ${params.revisionInstruction ?? '(none)'}

Write the exact first message Nest should send to ${params.targetName}.`,
      max_output_tokens: 320,
      store: false,
      prompt_cache_key: 'nest-contact-delegation-opener',
      reasoning: { effort: REASONING_EFFORT.agent },
    } as Parameters<typeof client.responses.create>[0]);

    const text = getResponseText(response)
      .replace(/^["“]|["”]$/g, '')
      .trim();
    const looksTruncated = /\b(how is|how are|what is|what are|can you|could you|would you|do you|is|are|the|a|to|and|or|but)$/i.test(text);
    if (
      text.length >= 20 &&
      !looksTruncated &&
      /[.!?]$/.test(text) &&
      /\bNest\b/i.test(text) &&
      new RegExp(params.ownerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)
    ) {
      return polishQuestionMarks(text);
    }
  } catch (error) {
    console.warn('[contact-delegation] reasoning opener failed, using fallback:', (error as Error).message);
  }

  return polishQuestionMarks(buildTargetOpener(params));
}

export function buildCompletionReceipt(task: ContactDelegationTask): string {
  if (!isSchedulingTask(task)) {
    const target = task.targetDisplayName ?? task.targetHandle;
    const answer = typeof task.metadata.final_recipient_answer === 'string' && task.metadata.final_recipient_answer.trim()
      ? task.metadata.final_recipient_answer.trim()
      : typeof task.metadata.final_recipient_note === 'string' && task.metadata.final_recipient_note.trim()
      ? task.metadata.final_recipient_note.trim()
      : 'They replied.';
    const extra = typeof task.metadata.final_recipient_note === 'string' &&
        task.metadata.final_recipient_note.trim() &&
        task.metadata.final_recipient_note.trim() !== answer
      ? ` They also said: "${task.metadata.final_recipient_note.trim()}".`
      : '';
    return `${target} said: "${answer}".${extra}`;
  }

  const fields = task.collectedFields;
  const when = [fields.date, fields.time, fields.timezone_or_context].filter(Boolean).join(' ');
  const where = fields.location ?? 'the location they suggested';
  const target = task.targetDisplayName ?? task.targetHandle;
  const extra = typeof task.metadata.final_recipient_note === 'string' && task.metadata.final_recipient_note.trim()
    ? ` They also said: "${task.metadata.final_recipient_note.trim()}".`
    : '';
  return `${target} is good for ${when} at ${where}.${extra}`;
}

export function buildTargetFinalConfirmation(task: ContactDelegationTask): string {
  if (!isSchedulingTask(task)) {
    const sender = typeof task.metadata.sender_name === 'string'
      ? task.metadata.sender_name
      : 'the sender';
    const extra = typeof task.metadata.final_recipient_note === 'string' && task.metadata.final_recipient_note.trim()
      ? ` I also passed on: "${task.metadata.final_recipient_note.trim()}".`
      : '';
    return `Perfect, thank you. I've let ${sender} know.${extra}`;
  }

  const fields = task.collectedFields;
  const when = [fields.date, fields.time, fields.timezone_or_context].filter(Boolean).join(' ');
  const where = fields.location ?? 'the agreed location';
  const sender = typeof task.metadata.sender_name === 'string'
    ? task.metadata.sender_name
    : 'the sender';
  const extra = typeof task.metadata.final_recipient_note === 'string' && task.metadata.final_recipient_note.trim()
    ? ` I also passed on: "${task.metadata.final_recipient_note.trim()}".`
    : '';
  return `Perfect, thank you. I've let ${sender} know you're confirmed for ${when} at ${where}.${extra}`;
}

export function buildRecipientFinalReviewPrompt(task: ContactDelegationTask): string {
  if (!isSchedulingTask(task)) {
    const sender = typeof task.metadata.sender_name === 'string'
      ? task.metadata.sender_name
      : 'them';
    return `Thanks, I have your reply. Anything else you want me to pass on to ${sender} before I confirm it?`;
  }

  const fields = task.collectedFields;
  const when = [fields.date, fields.time, fields.timezone_or_context].filter(Boolean).join(' ');
  const where = fields.location ?? 'the agreed location';
  const sender = typeof task.metadata.sender_name === 'string'
    ? task.metadata.sender_name
    : 'them';
  return polishQuestionMarks(`Great, I have ${when} at ${where}. Anything else you want me to pass on to ${sender} before I confirm it?`);
}

export function buildIncompleteReceipt(task: ContactDelegationTask, reason: string): string {
  const target = task.targetDisplayName ?? task.targetHandle;
  if (reason === 'opt_out') return `${target} asked not to be contacted, so I stopped.`;
  if (reason === 'wrong_number') return `Looks like the number for ${target} may be wrong, so I stopped.`;
  if (reason === 'failed_to_start') return `I couldn't start a message thread with ${target}. I didn't send anything.`;
  if (reason === 'undeliverable') return `I tried messaging ${target}, but the message didn't deliver. I stopped there.`;
  if (reason === 'unsafe') return `I can't continue that message thread safely, so I stopped.`;
  if (reason === 'owner_cancelled') return `Cancelled. I won't message ${target} about this.`;
  if (reason === 'expired') return `I couldn't get a concrete answer from ${target} before this expired.`;
  return `${target} couldn't give a concrete answer, so I stopped.`;
}

export function hasCompleteDinnerFields(fields: DelegationCollectedFields): boolean {
  return Boolean(
    fields.date &&
      fields.time &&
      fields.timezone_or_context &&
      fields.location &&
      fields.confidence === 'high',
  );
}
