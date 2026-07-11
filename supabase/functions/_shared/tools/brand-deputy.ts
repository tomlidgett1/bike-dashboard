import type { ToolContract } from './types.ts';
import { getAdminClient } from '../supabase.ts';
import { buildDeputyLiveDataPrefix } from '../brand-deputy.ts';
import {
  tryConsumeDeputyPendingConfirmation,
  tryPlanDeputyRosterMutation,
} from '../brand-deputy-mutations.ts';

function requireBrandContext(
  ctx: Parameters<ToolContract['handler']>[1],
): NonNullable<Parameters<ToolContract['handler']>[1]['brandContext']> {
  if (!ctx.brandContext) {
    throw new Error('Brand Deputy tool called without brand context');
  }
  return ctx.brandContext;
}

export const brandDeputyReadTool: ToolContract = {
  name: 'brand_deputy_read',
  description:
    'Read live Deputy roster, shifts, or timesheet data for internal brand chats.',
  namespace: 'brand.deputy.read',
  sideEffect: 'read',
  idempotent: true,
  timeoutMs: 12000,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The roster, shift, or timesheet question to look up.',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  handler: async (input, ctx) => {
    const brand = requireBrandContext(ctx);
    const query = String(input.query ?? '').trim();
    if (!query) {
      return {
        content: '[LIVE DEPUTY DATA]\nDeputy lookup needs a query.',
        structuredData: { ok: false, reason: 'missing_query' },
      };
    }

    const supabase = getAdminClient();
    const content = await buildDeputyLiveDataPrefix({
      supabase,
      brandKey: brand.baseBrandKey,
      message: query,
      force: true,
      brandApiDebug: ctx.brandApiDebug,
    });

    return {
      content: content || '[LIVE DEPUTY DATA]\nNo Deputy data returned for that query.',
      structuredData: { ok: true, query },
    };
  },
};

export const brandDeputyMutationTool: ToolContract = {
  name: 'brand_deputy_mutation',
  description:
    'Plan or confirm internal Deputy roster changes. This tool manages the required CONFIRM ADD / CONFIRM DELETE / CANCEL flow and only applies changes when the request is explicit.',
  namespace: 'brand.deputy.write',
  sideEffect: 'commit',
  idempotent: false,
  timeoutMs: 15000,
  inputSchema: {
    type: 'object',
    properties: {
      request: {
        type: 'string',
        description: 'The roster add/delete request or confirmation phrase.',
      },
    },
    required: ['request'],
    additionalProperties: false,
  },
  handler: async (input, ctx) => {
    const brand = requireBrandContext(ctx);
    const request = String(input.request ?? '').trim();
    if (!request) {
      return {
        content: 'Roster mutation needs a request.',
        structuredData: { ok: false, reason: 'missing_request' },
      };
    }

    const supabase = getAdminClient();
    const pending = await tryConsumeDeputyPendingConfirmation({
      supabase,
      chatId: ctx.chatId,
      brandKey: brand.baseBrandKey,
      message: request,
      brandApiDebug: ctx.brandApiDebug,
    });
    if (pending) {
      return {
        content: pending.text,
        structuredData: { ok: true, phase: 'confirmation_applied' },
      };
    }

    const planned = await tryPlanDeputyRosterMutation({
      supabase,
      chatId: ctx.chatId,
      brandKey: brand.baseBrandKey,
      message: request,
      brandApiDebug: ctx.brandApiDebug,
    });
    if (planned) {
      return {
        content: planned.text,
        structuredData: { ok: true, phase: 'proposal_created' },
      };
    }

    return {
      content: 'No Deputy roster mutation was recognised from that request.',
      structuredData: { ok: false, reason: 'no_mutation_recognised' },
    };
  },
};
