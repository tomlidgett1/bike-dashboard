import type { BrandBookingState } from './brand-chat-types.ts';
import {
  buildCustomerDeliveryCapstone,
  buildEarlyTurnSpamAvoidance,
  buildHandoffSmsNotifyInstructions,
} from './brand-chat-config.ts';
import { normaliseBusinessTimezone } from './brand-opening-schedule.ts';
import {
  buildBrandVoiceLock,
  buildImagePromptSection,
  buildInternalBasePrompt,
  buildInternalSecurityScope,
  INTERNAL_VOICE_LOCK,
} from './brand-chat-helpers.ts';
import type {
  Capability,
  TurnContext,
  TurnInput,
} from './orchestrator/types.ts';

function hasCapability(
  capabilities: Capability[] | undefined,
  cap: Capability,
): boolean {
  return (capabilities ?? []).includes(cap);
}

function formatBookingLine(label: string, value: string | null): string {
  return `- ${label}: ${value && value.trim() ? value.trim() : 'missing'}`;
}

function isConfirmedBookingStatus(status: BrandBookingState['status']): boolean {
  return status === 'created' || status === 'confirmed';
}

function buildBookingStateBlock(state: BrandBookingState | null): string {
  if (!state) {
    return [
      '## Booking Draft',
      'No active booking draft is loaded for this turn.',
      'If the customer starts or continues a booking, use the booking tools rather than relying on memory alone.',
      'If recent assistant history in this chat already contains a booking confirmation (including website booking confirmations with a due/completion date), treat those details as authoritative for follow-up questions. Do not deny a booking that was just confirmed in this thread.',
    ].join('\n');
  }

  if (isConfirmedBookingStatus(state.status)) {
    return [
      '## Confirmed Booking',
      'A real booking already exists for this chat. Treat it as the source of truth for follow-up questions.',
      `Status: ${state.status}`,
      formatBookingLine('Name', state.customer_name),
      formatBookingLine('Bike', state.bike),
      formatBookingLine('What needs doing', state.comments),
      formatBookingLine('Due / completion date', state.drop_off_date),
      state.workorder_id != null ? `- Workorder id: ${state.workorder_id}` : '- Workorder id: missing',
      state.sender_phone_e164
        ? `- Phone on file: ${state.sender_phone_e164}`
        : '- Phone on file: missing',
      '',
      'Hard rules for confirmed bookings:',
      '- When the customer asks when it is due, what day, which bike, or similar, restate the confirmed details above.',
      '- This is live booking confirmation for this chat, not guesswork. Do not say you cannot see a booking or cannot confirm workshop timing for these stored fields.',
      '- If they want to change the booking, help with the change (or hand off) rather than pretending no booking exists.',
      '- Do not call `brand_booking_create` again unless they clearly want a separate new booking.',
    ].join('\n');
  }

  return [
    '## Booking Draft',
    `Current status: ${state.status}`,
    formatBookingLine('Name', state.customer_name),
    formatBookingLine('Bike', state.bike),
    formatBookingLine('What needs doing', state.comments),
    formatBookingLine('Drop-off date', state.drop_off_date),
    state.sender_phone_e164
      ? `- Phone on file: ${state.sender_phone_e164}`
      : '- Phone on file: missing',
    '',
    'Hard rules for booking continuity:',
    '- Treat this draft as the current source of truth unless the customer explicitly changes a field.',
    '- If the customer asks a side-question like price, turnaround, or availability, answer that first and keep the draft intact.',
    '- Do NOT overwrite an existing drop-off date, bike, or name from vague acknowledgements like "ok", "sounds good", or "will drop in shortly".',
    '- When the customer changes a field, update only that field.',
    '- When all required fields are present and the customer clearly confirms, use the booking create tool.',
    '- A draft existing is NOT a booking. A customer saying "yes" is NOT a booking. Only a successful `brand_booking_create` tool call this turn creates a real booking — never state or imply otherwise.',
  ].join('\n');
}

function buildConversationStateBlock(context: TurnContext): string {
  const sections: string[] = [];

  if (context.summaries.length > 0) {
    const summaryLines = context.summaries
      .slice(0, 4)
      .map((summary) => `- ${summary.summary}`);
    sections.push(['## Recent Thread Summary', ...summaryLines].join('\n'));
  }

  if (context.workingMemory.activeTopics.length > 0) {
    sections.push([
      '## Active Topics',
      ...context.workingMemory.activeTopics.slice(0, 6).map((topic) => `- ${topic}`),
    ].join('\n'));
  }

  if (context.workingMemory.pendingActions.length > 0) {
    sections.push([
      '## Pending Actions',
      ...context.workingMemory.pendingActions.slice(0, 6).map((action) =>
        `- ${action.type}: ${action.description}`
      ),
    ].join('\n'));
  }

  return sections.join('\n\n');
}

function buildCustomerToolBlock(
  input: TurnInput,
  capabilities: Capability[] | undefined,
): string {
  const brand = input.brandContext;
  if (!brand) return '';

  const lines: string[] = [
    '## Shop System Tool Rules',
    '- Use business facts from the business prompt for evergreen information like services, hours, and policies.',
    '- Use shop-system tools for live or customer-specific answers. Do not pretend the business prompt is live data.',
    '- When summarising live Lightspeed results or a booking recap, use markdown `**bold**` for short headings or labels only, such as `**Booking**`, `**Jobs**`, `**Name:**`, `**Bike:**`, or `**Price:**`. Linq v3 renders these inline in iMessage.',
    '- Never use Unicode faux-bold. Keep bold limited to short labels or section headings, not full paragraphs.',
  ];

  if (hasCapability(capabilities, 'brand.lightspeed.customer.read')) {
    lines.push(
      '- Use `brand_customer_lookup` when caller identity from their phone number would help you answer naturally.',
    );
  }

  if (hasCapability(capabilities, 'brand.lightspeed.inventory.read')) {
    lines.push(
      '- Use `brand_inventory_lookup` before naming stocked products, prices, or availability. Never guess stock from the business prompt.',
    );
  }

  if (hasCapability(capabilities, 'brand.lightspeed.workorders.read')) {
    lines.push(
      '- Use `brand_workorder_lookup` for service status, job history, or "is my bike ready?" questions. Never invent workshop details.',
    );
  }

  if (hasCapability(capabilities, 'brand.booking.read')) {
    lines.push(
      '- Use `brand_booking_read` to inspect the current booking draft before deciding what is missing or what changed.',
    );
  }

  if (hasCapability(capabilities, 'brand.booking.write')) {
    lines.push(
      '- Use `brand_booking_update` to save or amend booking fields. Keep the draft stable across side-questions.',
    );
  }

  if (hasCapability(capabilities, 'brand.booking.create')) {
    lines.push(
      '- **Booking commit rule (MUST follow):** For a NEW booking from a draft, `brand_booking_create` is the ONLY way a real workorder is created in the shop system. Without a successful `brand_booking_create` this turn, do not claim a NEW draft booking is locked in.',
      '- Call `brand_booking_create` in the SAME turn the customer confirms a complete booking ("yes", "book it", "go ahead", "cheers thanks"). Do not defer to a later turn. Do not ask the customer to re-confirm.',
      '- **Exception:** If a Confirmed Booking block is loaded, or recent assistant history already contains a Nest/website booking confirmation for this chat, you MAY restate those existing details (due date, bike, service). That is not inventing a booking.',
      '- **You MUST NOT invent a NEW locked-in booking** when neither create succeeded this turn nor a confirmed booking/confirmation exists. Forbidden for invented new bookings: "booked in", "locked in", "got it set", "pencilled in", "you\'re all set", "on the sheet", "see you then", "reserved for", "all booked", "all set", "you\'re sorted", "you\'re good to go". If the tool has not run successfully this turn and there is only a draft, summarise the draft and ask the customer to reply yes instead.',
      '- If any required field changes while status is `awaiting_confirm`, re-summarise the updated draft and ask for a fresh yes before calling create.',
    );
  }

  if (!brand.isInternal && (brand.handoffPhoneE164 || brand.lightspeedSettings.handoff_workorder.enabled)) {
    lines.push(
      '- If the customer wants a real person or callback, give a short human handoff reply and emit `[HANDOFF_NOTIFY]` at the end of the message.',
    );
  }

  return lines.join('\n');
}

function buildInternalToolBlock(
  capabilities: Capability[] | undefined,
): string {
  const lines: string[] = [
    '## Internal Tool Rules',
    '- Lead with the answer, then use tool outputs to support it. Keep replies concise and scannable.',
    '- Tool outputs are the only source of truth for live business data.',
    '- Use markdown `**bold**` for short topic headings or labels where it improves scanning in iMessage. Never use Unicode faux-bold.',
  ];

  if (hasCapability(capabilities, 'brand.deputy.read')) {
    lines.push(
      '- Use `brand_deputy_read` for roster, shifts, and timesheets before answering staffing questions.',
    );
  }

  if (hasCapability(capabilities, 'brand.deputy.write')) {
    lines.push(
      '- Use `brand_deputy_mutation` for roster adds/deletes. It handles the required confirm/cancel flow - never claim the change happened until the tool says it did.',
    );
  }

  if (hasCapability(capabilities, 'brand.lightspeed.sales.read')) {
    lines.push(
      '- Use `brand_sales_lookup` for takings, revenue, top sellers, and transaction questions.',
      '- For novel or unusually specific Lightspeed analytics that the standard tool does not directly answer, use `brand_lightspeed_sql_query`.',
      '- `brand_lightspeed_sql_query` rules: write a SELECT/CTE query only, use ONLY approved private analytics views, and include the literal `{{brand_key}}` placeholder in the WHERE clause.',
      '- Preferred views for SQL analytics: `private.nest_brand_lightspeed_sale_analytics_v`, `private.nest_brand_lightspeed_sale_line_analytics_v`, `private.nest_brand_lightspeed_inventory_v`, `private.nest_brand_lightspeed_workorder_analytics_v`.',
    );
  }

  if (hasCapability(capabilities, 'brand.lightspeed.inventory.read')) {
    lines.push(
      '- Use `brand_inventory_lookup` for stock questions. Keep product/quantity answers tied to the tool output.',
    );
  }

  if (hasCapability(capabilities, 'brand.lightspeed.workorders.read')) {
    lines.push(
      '- Use `brand_workorder_lookup` for workshop job counts, statuses, and customer history.',
    );
  }

  return lines.join('\n');
}

function buildBrandTurnBlock(input: TurnInput): string {
  const brand = input.brandContext;
  if (!brand) return '';

  const timezone = normaliseBusinessTimezone(
    brand.config?.business_timezone?.trim() || input.timezone || 'Australia/Melbourne',
  );
  const now = new Date();
  const localDateLabel = now.toLocaleDateString('en-AU', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const localTimeLabel = now.toLocaleTimeString('en-AU', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
  return [
    '## Turn Context',
    `Brand key: ${brand.brandKey}`,
    `Mode: ${brand.isInternal ? 'internal' : 'customer'}`,
    `Business timezone: ${timezone}`,
    `Business local date today: ${localDateLabel}.`,
    `Business local time now: ${localTimeLabel}.`,
    'Interpret "today", "tomorrow", "yesterday", "this morning", "this afternoon", "tonight", and weekday names using the business timezone above.',
    `Current user message: ${input.userMessage}`,
  ].join('\n');
}

export function composeBrandPrompt(
  context: TurnContext,
  input: TurnInput,
  capabilities?: Capability[],
): string {
  const brand = input.brandContext;
  if (!brand) {
    throw new Error('composeBrandPrompt called without brandContext');
  }

  const sections: string[] = [];

  if (brand.isInternal) {
    sections.push(INTERNAL_VOICE_LOCK);
    sections.push(buildInternalSecurityScope(brand.displayName));
    sections.push(buildInternalBasePrompt(brand.displayName));
    sections.push(buildInternalToolBlock(capabilities));
  } else {
    sections.push(buildBrandVoiceLock(brand.displayName));
    sections.push(brand.systemPrompt);
    sections.push(brand.businessPrompt);
    sections.push(buildCustomerToolBlock(input, capabilities));

    const imageSection = buildImagePromptSection(brand.imageCatalog);
    if (imageSection) sections.push(imageSection);

    const handoffBlock = buildHandoffSmsNotifyInstructions(brand.config);
    if (handoffBlock) sections.push(handoffBlock);

    sections.push(buildCustomerDeliveryCapstone());

    // iMessage spam-avoidance for the FIRST 3 outbound replies in a thread.
    // Only meaningful while the conversation is genuinely fresh — once any
    // summaries exist the thread is well past the first 3 turns, so skip.
    // `context.history` is brand-scoped (see build-brand-context.ts) and the
    // current user message has not been appended to history yet at this point,
    // so counting assistant rows gives "replies already sent before this one".
    if (context.summaries.length === 0) {
      const assistantRepliesSoFar = context.history.filter((m) => m.role === 'assistant').length;
      const earlyTurnBlock = buildEarlyTurnSpamAvoidance(assistantRepliesSoFar);
      if (earlyTurnBlock) sections.push(earlyTurnBlock);
    }
  }

  sections.push(buildBookingStateBlock(brand.bookingState));

  const conversationState = buildConversationStateBlock(context);
  if (conversationState) sections.push(conversationState);

  sections.push(buildBrandTurnBlock(input));

  return sections.filter(Boolean).join('\n\n---\n\n');
}
