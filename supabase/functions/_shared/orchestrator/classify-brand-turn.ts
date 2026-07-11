import {
  getOpenAIClient,
  getResponseText,
  MODEL_MAP,
  REASONING_EFFORT,
} from '../ai/models.ts';
import type { ClassifierResult, Capability, TurnInput } from './types.ts';
import type { RouterContext } from './build-context.ts';

const BRAND_CAPABILITIES: Capability[] = [
  'brand.lightspeed.customer.read',
  'brand.lightspeed.inventory.read',
  'brand.lightspeed.workorders.read',
  'brand.lightspeed.sales.read',
  'brand.booking.read',
  'brand.booking.write',
  'brand.booking.create',
  'brand.deputy.read',
  'brand.deputy.write',
];

const BRAND_CLASSIFIER_INSTRUCTIONS = `You are the routing classifier for Nest brand chats (Nest for business).

Every brand turn MUST pass through you before the assistant replies. Your job is to decide which brand tools are needed for this turn.

Return strict JSON only:
{
  "mode": "smart",
  "primaryDomain": "brand",
  "secondaryDomains": [],
  "confidence": 0.0,
  "requiredCapabilities": [],
  "preferredCapabilities": [],
  "memoryDepth": "light",
  "requiresToolUse": false,
  "isConfirmation": false,
  "pendingActionId": null,
  "style": "normal",
  "reason": ""
}

Allowed capabilities:
- "brand.lightspeed.customer.read" -> identify the caller from their phone number / customer file
- "brand.lightspeed.inventory.read" -> product, stock, price, availability, do-you-carry-this
- "brand.lightspeed.workorders.read" -> workshop status, service history, "is my bike ready?"
- "brand.lightspeed.sales.read" -> internal sales/takings/revenue questions
- "brand.booking.read" -> inspect existing booking draft / booking state
- "brand.booking.write" -> save or amend booking fields
- "brand.booking.create" -> confirm and create the booking from the draft
- "brand.deputy.read" -> internal roster, shifts, timesheets
- "brand.deputy.write" -> internal roster add/delete flow

Rules:
- Always set mode to "smart" and primaryDomain to "brand".
- Use tools whenever the reply depends on live shop data or ongoing booking state.
- If a booking draft already exists, strongly prefer including "brand.booking.read" so the assistant can continue naturally.
- Include "brand.booking.write" when the user is supplying or changing booking details, or when the booking needs to stay coherent across this turn.
- Include "brand.booking.create" only when the user is clearly confirming a complete booking now.
- Include "brand.lightspeed.inventory.read" for pricing/stock/product questions.
- Include "brand.lightspeed.workorders.read" for service status/history/ready-for-pickup questions.
- Include "brand.lightspeed.sales.read" only for internal sales/takings questions.
- Include Deputy capabilities only for internal mode and only when roster/timesheet/shift changes or reads are relevant.
- If the turn is pure business FAQ or conversational handling and no live data/state is needed, requiresToolUse can be false and requiredCapabilities can be [].
- Use memoryDepth "full" when an active booking draft or earlier thread state clearly matters. Otherwise use "light".
- style:
  - "brief" for quick confirmations or tiny replies
  - "normal" for standard chat turns
  - "deep" for detailed internal analysis requests
`;

function buildClassifierInput(
  input: TurnInput,
  context: RouterContext,
): string {
  const brand = input.brandContext;
  if (!brand) {
    throw new Error('buildClassifierInput called without brandContext');
  }

  const recentTurns = context.recentTurns
    .slice(-6)
    .map((turn) => `${turn.role}: ${turn.content.substring(0, 220)}`)
    .join('\n');

  const bookingState = brand.bookingState
    ? [
        `status=${brand.bookingState.status}`,
        `name=${brand.bookingState.customer_name ?? 'missing'}`,
        `bike=${brand.bookingState.bike ?? 'missing'}`,
        `comments=${brand.bookingState.comments ?? 'missing'}`,
        `drop_off_date=${brand.bookingState.drop_off_date ?? 'missing'}`,
      ].join(', ')
    : 'none';

  const lines: string[] = [
    `Mode: ${brand.isInternal ? 'internal' : 'customer'}`,
    `Brand: ${brand.displayName} (${brand.brandKey})`,
    `Recent conversation:\n${recentTurns || '(none)'}`,
    `Working memory active topics: ${context.workingMemory.activeTopics.join(', ') || '(none)'}`,
    `Booking draft: ${bookingState}`,
    `Lightspeed settings: ${JSON.stringify(brand.lightspeedSettings)}`,
    `Current user message: "${input.userMessage}"`,
  ];

  return lines.join('\n\n');
}

function coerceCapabilities(value: unknown): Capability[] {
  if (!Array.isArray(value)) return [];
  return value.filter((cap): cap is Capability =>
    typeof cap === 'string' && BRAND_CAPABILITIES.includes(cap as Capability)
  );
}

function buildFallbackResult(input: TurnInput): ClassifierResult {
  const bookingActive = !!input.brandContext?.bookingState;
  const isInternal = input.brandContext?.isInternal === true;
  const baseCaps: Capability[] = bookingActive
    ? ['brand.booking.read', 'brand.booking.write']
    : [];

  if (isInternal) {
    baseCaps.push('brand.deputy.read', 'brand.lightspeed.sales.read', 'brand.lightspeed.inventory.read', 'brand.lightspeed.workorders.read');
  }

  return {
    mode: 'smart',
    primaryDomain: 'brand',
    secondaryDomains: [],
    confidence: 0.45,
    requiredCapabilities: [...new Set(baseCaps)],
    preferredCapabilities: [],
    memoryDepth: bookingActive ? 'full' : 'light',
    requiresToolUse: baseCaps.length > 0,
    isConfirmation: false,
    pendingActionId: null,
    style: 'normal',
  };
}

export async function classifyBrandTurn(
  input: TurnInput,
  context: RouterContext,
): Promise<ClassifierResult & { reason?: string }> {
  if (!input.brandContext) {
    throw new Error('classifyBrandTurn called without brandContext');
  }

  const client = getOpenAIClient();
  const model = MODEL_MAP.orchestration;

  try {
    const response = await client.responses.create({
      model,
      instructions: BRAND_CLASSIFIER_INSTRUCTIONS,
      input: buildClassifierInput(input, context),
      max_output_tokens: 1200,
      store: false,
      prompt_cache_key: `brand-router-${input.brandContext.baseBrandKey}-${input.brandContext.isInternal ? 'internal' : 'customer'}`,
      reasoning: { effort: REASONING_EFFORT.orchestration },
    } as Parameters<typeof client.responses.create>[0]);

    const text = getResponseText(response) ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[classify-brand-turn] no JSON found:', text.slice(0, 200));
      return buildFallbackResult(input);
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return {
      mode: 'smart',
      primaryDomain: 'brand',
      secondaryDomains: [],
      confidence: typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.7,
      requiredCapabilities: coerceCapabilities(parsed.requiredCapabilities),
      preferredCapabilities: coerceCapabilities(parsed.preferredCapabilities),
      memoryDepth: parsed.memoryDepth === 'full' ? 'full' : 'light',
      requiresToolUse: parsed.requiresToolUse === true,
      isConfirmation: parsed.isConfirmation === true,
      pendingActionId: null,
      style: parsed.style === 'brief' || parsed.style === 'deep'
        ? parsed.style
        : 'normal',
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : undefined,
    };
  } catch (err) {
    console.warn('[classify-brand-turn] failed:', (err as Error).message);
    return buildFallbackResult(input);
  }
}
