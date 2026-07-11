import type { ToolContract } from './types.ts';
import { getAdminClient } from '../supabase.ts';
import {
  bookingDraftIsComplete,
  buildBookingMissingFieldPrompt,
  buildBookingSummary,
  createBookingWorkorder,
  deleteBookingState,
  loadBookingState,
  populateBookingCustomerName,
  upsertBookingState,
  type BookingState,
} from '../brand-lightspeed-booking.ts';
import { normaliseToE164 } from '../phone-normalise.ts';

function requireBrandContext(
  ctx: Parameters<ToolContract['handler']>[1],
): NonNullable<Parameters<ToolContract['handler']>[1]['brandContext']> {
  if (!ctx.brandContext) {
    throw new Error('Brand booking tool called without brand context');
  }
  return ctx.brandContext;
}

function serialiseBookingState(
  state: BookingState | null,
  nextStep: string,
): string {
  if (!state) {
    return ['[BOOKING DRAFT]', 'NONE', `next_step: ${nextStep}`].join('\n');
  }

  return [
    '[BOOKING DRAFT]',
    `status: ${state.status}`,
    `name: ${state.customer_name ?? 'missing'}`,
    `bike: ${state.bike ?? 'missing'}`,
    `comments: ${state.comments ?? 'missing'}`,
    `drop_off_date: ${state.drop_off_date ?? 'missing'}`,
    `phone_on_file: ${state.sender_phone_e164 ?? 'missing'}`,
    `next_step: ${nextStep}`,
  ].join('\n');
}

function normaliseField(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function buildDraftSeed(
  brandKey: string,
  chatId: string,
  senderHandle: string,
): BookingState {
  return {
    brand_key: brandKey,
    chat_id: chatId,
    status: 'collecting',
    sender_handle: senderHandle,
    sender_phone_e164: normaliseToE164(senderHandle),
    customer_name: null,
    bike: null,
    comments: null,
    drop_off_date: null,
    workorder_id: null,
    last_message_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}

export const brandBookingReadTool: ToolContract = {
  name: 'brand_booking_read',
  description:
    'Read the current brand booking draft for this chat, including what fields are already collected and what is still missing.',
  namespace: 'brand.booking.read',
  sideEffect: 'read',
  idempotent: true,
  timeoutMs: 6000,
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  handler: async (_input, ctx) => {
    const brand = requireBrandContext(ctx);
    const supabase = getAdminClient();
    let state = await loadBookingState(
      supabase,
      brand.baseBrandKey,
      ctx.chatId,
    );

    if (state) {
      const populated = await populateBookingCustomerName(
        supabase,
        state,
        ctx.brandApiDebug,
      );
      if (populated.customer_name !== state.customer_name) {
        state = populated;
        await upsertBookingState(supabase, state);
      }
    }

    const nextStep = state
      ? bookingDraftIsComplete(state, brand.lightspeedSettings)
        ? 'ask for confirmation if the customer is ready to book now'
        : 'collect the missing booking fields or answer their side-question without losing this draft'
      : 'start a new booking only if the user is clearly trying to book in';

    return {
      content: serialiseBookingState(state, nextStep),
      structuredData: {
        ok: !!state,
        state,
      },
    };
  },
};

export const brandBookingUpdateTool: ToolContract = {
  name: 'brand_booking_update',
  description:
    'Create or update the current brand booking draft with collected booking fields such as name, bike, comments, or drop-off date.',
  namespace: 'brand.booking.write',
  sideEffect: 'draft',
  idempotent: false,
  timeoutMs: 8000,
  inputSchema: {
    type: 'object',
    properties: {
      customer_name: {
        type: 'string',
        description: 'Customer full name if the user provided it.',
      },
      bike: {
        type: 'string',
        description: 'Bike make/model or description.',
      },
      comments: {
        type: 'string',
        description: 'What needs doing or booking notes.',
      },
      drop_off_date: {
        type: 'string',
        description: 'Drop-off date in YYYY-MM-DD format.',
      },
      clear_fields: {
        type: 'array',
        description: 'Optional fields to clear when the customer explicitly changes their mind.',
        items: {
          type: 'string',
          enum: ['customer_name', 'bike', 'comments', 'drop_off_date'],
        },
      },
    },
    additionalProperties: false,
  },
  handler: async (input, ctx) => {
    const brand = requireBrandContext(ctx);
    const supabase = getAdminClient();
    const existing = await loadBookingState(
      supabase,
      brand.baseBrandKey,
      ctx.chatId,
    );

    const merged = existing ?? buildDraftSeed(
      brand.baseBrandKey,
      ctx.chatId,
      ctx.senderHandle,
    );

    const clearFields = Array.isArray(input.clear_fields)
      ? input.clear_fields.filter((field): field is 'customer_name' | 'bike' | 'comments' | 'drop_off_date' =>
        field === 'customer_name' ||
        field === 'bike' ||
        field === 'comments' ||
        field === 'drop_off_date')
      : [];

    for (const field of clearFields) {
      merged[field] = null;
    }

    const customerName = normaliseField(input.customer_name, 80);
    const bike = normaliseField(input.bike, 120);
    const comments = normaliseField(input.comments, 400);
    const dropOffDate = normaliseField(input.drop_off_date, 32);

    if (customerName) merged.customer_name = customerName;
    if (bike) merged.bike = bike;
    if (comments) merged.comments = comments;
    if (dropOffDate && /^\d{4}-\d{2}-\d{2}$/.test(dropOffDate)) {
      merged.drop_off_date = dropOffDate;
    }
    if (!merged.sender_phone_e164) {
      merged.sender_phone_e164 = normaliseToE164(ctx.senderHandle);
    }

    const populated = await populateBookingCustomerName(
      supabase,
      merged,
      ctx.brandApiDebug,
    );
    populated.status = bookingDraftIsComplete(populated, brand.lightspeedSettings)
      ? 'awaiting_confirm'
      : 'collecting';

    await upsertBookingState(supabase, populated);

    const nextStep = bookingDraftIsComplete(populated, brand.lightspeedSettings)
      ? 'the draft is complete; ask for confirmation before creating the booking'
      : buildBookingMissingFieldPrompt(populated, brand.lightspeedSettings);

    return {
      content: serialiseBookingState(populated, nextStep),
      structuredData: {
        ok: true,
        state: populated,
      },
    };
  },
};

export const brandBookingCreateTool: ToolContract = {
  name: 'brand_booking_create',
  description:
    'Create the actual Lightspeed booking/workorder from the current booking draft once the customer has clearly confirmed.',
  namespace: 'brand.booking.create',
  sideEffect: 'commit',
  idempotent: false,
  timeoutMs: 12000,
  requiresConfirmation: true,
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  handler: async (_input, ctx) => {
    const brand = requireBrandContext(ctx);
    const supabase = getAdminClient();
    let state = await loadBookingState(
      supabase,
      brand.baseBrandKey,
      ctx.chatId,
    );

    if (!state) {
      return {
        content: serialiseBookingState(null, 'there is no active booking draft to create'),
        structuredData: { ok: false, reason: 'no_active_draft' },
      };
    }

    state = await populateBookingCustomerName(
      supabase,
      state,
      ctx.brandApiDebug,
    );

    if (!bookingDraftIsComplete(state, brand.lightspeedSettings)) {
      await upsertBookingState(supabase, state);
      return {
        content: serialiseBookingState(
          state,
          buildBookingMissingFieldPrompt(state, brand.lightspeedSettings),
        ),
        structuredData: { ok: false, reason: 'draft_incomplete', state },
      };
    }

    const create = await createBookingWorkorder(
      {
        brand_key: brand.baseBrandKey,
        customer_name: state.customer_name!,
        customer_phone_e164: state.sender_phone_e164,
        bike: state.bike,
        comments: state.comments!,
        drop_off_date: state.drop_off_date!,
        default_note: brand.lightspeedSettings.booking.default_note,
      },
      ctx.brandApiDebug,
    );

    if (!create.ok) {
      state.status = 'awaiting_confirm';
      await upsertBookingState(supabase, state);
      return {
        content: [
          serialiseBookingState(state, 'booking creation failed; offer retry or human handoff'),
          `error: ${create.error}`,
        ].join('\n'),
        structuredData: { ok: false, reason: 'create_failed', error: create.error, state },
      };
    }

    await deleteBookingState(supabase, brand.baseBrandKey, ctx.chatId);

    return {
      content: [
        '[BOOKING CREATED]',
        `workorder_id: ${create.workorder_id}`,
        buildBookingSummary(
          {
            ...state,
            status: 'created',
            workorder_id: create.workorder_id,
          },
          brand.lightspeedSettings,
        ),
      ].join('\n\n'),
      structuredData: {
        ok: true,
        workorderId: create.workorder_id,
      },
    };
  },
};
