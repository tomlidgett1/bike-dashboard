// ============================================================
// Support Ticket Resolution API
// ============================================================
// POST: propose, accept, escalate, or admin-resolve a purchase dispute.

import { NextRequest, NextResponse } from 'next/server';
import { isAdminEmail } from '@/lib/admin-auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  applyDisputeResolution,
  type DisputeResolutionType,
  normaliseResolutionAmount,
} from '@/lib/stripe/disputes';

const ACTIVE_TICKET_STATUSES = new Set(['open', 'awaiting_response', 'in_review', 'escalated']);
const RESOLUTION_TYPES = new Set<DisputeResolutionType>([
  'refunded',
  'partial_refund',
  'replaced',
  'no_action',
  'other',
]);

const DISPUTE_POLICY_SNAPSHOT = {
  version: '2026-06-02',
  sellerResponseHours: 48,
  buyerResponseHours: 72,
  fundsHeldWhileDisputed: true,
  autoReleaseDaysWithoutReceipt: 7,
  terms: [
    'Funds are frozen while a claim is active.',
    'The seller gets a fair chance to respond and propose a resolution.',
    'The buyer can accept an offer or escalate the claim to Yellow Jersey.',
    'Refunds are returned to the original payment method.',
    'If seller funds have already been transferred, Yellow Jersey attempts a Stripe transfer reversal.',
  ],
};

type ResolutionAction = 'propose' | 'accept' | 'escalate' | 'admin_resolve';

type PurchaseForTicket = {
  id: string;
  buyer_id: string;
  seller_id: string;
  order_number: string;
  total_amount: number;
  item_price: number | null;
  funds_status: string | null;
  status: string | null;
};

type TicketForResolution = {
  id: string;
  purchase_id: string;
  created_by: string;
  status: string;
  category: string;
  subject: string;
  resolution: string | null;
  resolution_type: string | null;
  resolution_amount: number | null;
  resolution_offered_at: string | null;
  resolution_accepted_at: string | null;
  purchases: PurchaseForTicket | null;
};

type ActorRole = {
  isBuyer: boolean;
  isSeller: boolean;
  isAdmin: boolean;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const serviceClient = createServiceRoleClient();
    const { id: ticketId } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action as ResolutionAction | undefined;

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    const ticket = await fetchTicket(serviceClient, ticketId);
    if (!ticket?.purchases) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const purchase = ticket.purchases;
    const role: ActorRole = {
      isBuyer: ticket.created_by === user.id || purchase.buyer_id === user.id,
      isSeller: purchase.seller_id === user.id,
      isAdmin: isAdminEmail(user.email),
    };

    if (!role.isBuyer && !role.isSeller && !role.isAdmin) {
      return NextResponse.json({ error: 'Not authorised for this ticket' }, { status: 403 });
    }

    if (action === 'propose') {
      return proposeResolution(serviceClient, ticket, purchase, user.id, role, body);
    }

    if (action === 'accept') {
      return acceptResolution(serviceClient, ticket, purchase, user.id, role, body);
    }

    if (action === 'escalate') {
      return escalateTicket(serviceClient, ticket, purchase, user.id, body);
    }

    if (action === 'admin_resolve') {
      return adminResolveTicket(serviceClient, ticket, purchase, user.id, role, body);
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('[Ticket Resolution] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

async function proposeResolution(
  supabase: ReturnType<typeof createServiceRoleClient>,
  ticket: TicketForResolution,
  purchase: PurchaseForTicket,
  actorId: string,
  role: ActorRole,
  body: Record<string, unknown>
) {
  if (!role.isSeller && !role.isAdmin) {
    return NextResponse.json({ error: 'Only the seller or support can propose a resolution' }, { status: 403 });
  }

  if (!ACTIVE_TICKET_STATUSES.has(ticket.status)) {
    return NextResponse.json({ error: 'This ticket is not active' }, { status: 400 });
  }

  const resolutionType = parseResolutionType(body.resolutionType);
  const resolutionAmount = normaliseResolutionAmount(
    resolutionType,
    parseOptionalAmount(body.amount),
    Number(purchase.total_amount)
  );
  const message = cleanMessage(body.message) || defaultOfferMessage(resolutionType, resolutionAmount);
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('support_tickets')
    .update({
      status: 'in_review',
      resolution_type: resolutionType,
      resolution_amount: resolutionAmount,
      resolution: message,
      resolution_offered_by: actorId,
      resolution_offered_at: now,
      resolution_accepted_by: null,
      resolution_accepted_at: null,
      resolution_actioned_at: null,
      resolution_error: null,
      seller_response_due_at: null,
      buyer_response_due_at: addHours(72).toISOString(),
      policy_snapshot: DISPUTE_POLICY_SNAPSHOT,
    })
    .eq('id', ticket.id);

  if (updateError) {
    console.error('[Ticket Resolution] Failed to offer resolution:', updateError);
    return NextResponse.json({ error: 'Failed to offer resolution' }, { status: 500 });
  }

  await insertTicketHistory(supabase, ticket.id, actorId, 'resolution_offered', {
    resolution_type: resolutionType,
    resolution_amount: resolutionAmount,
  });

  if (purchase.funds_status === 'held') {
    await supabase
      .from('purchases')
      .update({
        funds_status: 'disputed',
        dispute_opened_at: now,
      })
      .eq('id', purchase.id);
  }

  return NextResponse.json({
    success: true,
    message: 'Resolution offer sent to the buyer.',
  });
}

async function acceptResolution(
  supabase: ReturnType<typeof createServiceRoleClient>,
  ticket: TicketForResolution,
  purchase: PurchaseForTicket,
  actorId: string,
  role: ActorRole,
  body: Record<string, unknown>
) {
  if (!role.isBuyer && !role.isAdmin) {
    return NextResponse.json({ error: 'Only the buyer or support can accept this resolution' }, { status: 403 });
  }

  if (!ticket.resolution_type || !ticket.resolution_offered_at) {
    return NextResponse.json({ error: 'There is no resolution offer to accept' }, { status: 400 });
  }

  if (ticket.resolution_accepted_at || ticket.status === 'resolved' || ticket.status === 'closed') {
    return NextResponse.json({ error: 'This resolution has already been actioned' }, { status: 400 });
  }

  const resolutionType = parseResolutionType(ticket.resolution_type);
  const resolutionAmount = normaliseResolutionAmount(
    resolutionType,
    parseOptionalAmount(ticket.resolution_amount),
    Number(purchase.total_amount)
  );
  const acceptanceMessage = cleanMessage(body.message) || `Resolution accepted: ${resolutionLabel(resolutionType)}.`;

  try {
    const result = await applyDisputeResolution({
      ticketId: ticket.id,
      purchaseId: purchase.id,
      actorId,
      resolutionType,
      resolutionAmount,
      note: ticket.resolution || acceptanceMessage,
    });

    return NextResponse.json({
      success: true,
      message: 'Resolution accepted and actioned.',
      result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to action resolution';
    await supabase
      .from('support_tickets')
      .update({ resolution_error: errorMessage })
      .eq('id', ticket.id);
    console.error('[Ticket Resolution] Failed to accept resolution:', error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

async function escalateTicket(
  supabase: ReturnType<typeof createServiceRoleClient>,
  ticket: TicketForResolution,
  purchase: PurchaseForTicket,
  actorId: string,
  body: Record<string, unknown>
) {
  if (!ACTIVE_TICKET_STATUSES.has(ticket.status)) {
    return NextResponse.json({ error: 'This ticket is not active' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const message = cleanMessage(body.message) || 'This claim has been escalated to Yellow Jersey support for review.';

  const { error: updateError } = await supabase
    .from('support_tickets')
    .update({
      status: 'escalated',
      escalated_at: now,
      seller_response_due_at: null,
      buyer_response_due_at: null,
      policy_snapshot: DISPUTE_POLICY_SNAPSHOT,
    })
    .eq('id', ticket.id);

  if (updateError) {
    console.error('[Ticket Resolution] Failed to escalate:', updateError);
    return NextResponse.json({ error: 'Failed to escalate ticket' }, { status: 500 });
  }

  if (purchase.funds_status === 'held') {
    await supabase
      .from('purchases')
      .update({
        funds_status: 'disputed',
        dispute_opened_at: now,
      })
      .eq('id', purchase.id);
  }

  await insertTicketHistory(supabase, ticket.id, actorId, 'escalated', {
    escalated_at: now,
    message,
  });

  return NextResponse.json({
    success: true,
    message: 'Ticket escalated to Yellow Jersey support.',
  });
}

async function adminResolveTicket(
  supabase: ReturnType<typeof createServiceRoleClient>,
  ticket: TicketForResolution,
  purchase: PurchaseForTicket,
  actorId: string,
  role: ActorRole,
  body: Record<string, unknown>
) {
  if (!role.isAdmin) {
    return NextResponse.json({ error: 'Support access required' }, { status: 403 });
  }

  const resolutionType = parseResolutionType(body.resolutionType);
  const resolutionAmount = normaliseResolutionAmount(
    resolutionType,
    parseOptionalAmount(body.amount),
    Number(purchase.total_amount)
  );
  const resolution = cleanMessage(body.message) || resolutionLabel(resolutionType);

  await supabase
    .from('support_tickets')
    .update({
      resolution_type: resolutionType,
      resolution_amount: resolutionAmount,
      resolution,
      resolution_offered_by: actorId,
      resolution_offered_at: new Date().toISOString(),
      policy_snapshot: DISPUTE_POLICY_SNAPSHOT,
    })
    .eq('id', ticket.id);

  try {
    const result = await applyDisputeResolution({
      ticketId: ticket.id,
      purchaseId: purchase.id,
      actorId,
      resolutionType,
      resolutionAmount,
      note: resolution,
    });

    return NextResponse.json({
      success: true,
      message: 'Ticket resolved.',
      result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to resolve ticket';
    await supabase
      .from('support_tickets')
      .update({ resolution_error: errorMessage })
      .eq('id', ticket.id);
    console.error('[Ticket Resolution] Failed to admin resolve:', error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

async function fetchTicket(
  supabase: ReturnType<typeof createServiceRoleClient>,
  ticketId: string
): Promise<TicketForResolution | null> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select(`
      id,
      purchase_id,
      created_by,
      status,
      category,
      subject,
      resolution,
      resolution_type,
      resolution_amount,
      resolution_offered_at,
      resolution_accepted_at,
      purchases (
        id,
        buyer_id,
        seller_id,
        order_number,
        total_amount,
        item_price,
        funds_status,
        status
      )
    `)
    .eq('id', ticketId)
    .single();

  if (error || !data) {
    if (error?.code !== 'PGRST116') {
      console.error('[Ticket Resolution] Failed to fetch ticket:', error);
    }
    return null;
  }

  return data as unknown as TicketForResolution;
}

async function insertTicketHistory(
  supabase: ReturnType<typeof createServiceRoleClient>,
  ticketId: string,
  actorId: string,
  action: string,
  value: Record<string, unknown>
) {
  await supabase.from('ticket_history').insert({
    ticket_id: ticketId,
    performed_by: actorId,
    action,
    new_value: value,
  });
}

function parseResolutionType(value: unknown): DisputeResolutionType {
  if (typeof value !== 'string' || !RESOLUTION_TYPES.has(value as DisputeResolutionType)) {
    throw new Error('Invalid resolution type');
  }
  return value as DisputeResolutionType;
}

function parseOptionalAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function cleanMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 2000) : null;
}

function addHours(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function defaultOfferMessage(type: DisputeResolutionType, amount: number | null): string {
  if (type === 'refunded') return 'The seller has offered a full refund.';
  if (type === 'partial_refund') return `The seller has offered a partial refund of $${(amount || 0).toFixed(2)}.`;
  if (type === 'replaced') return 'The seller has offered to replace the item.';
  if (type === 'no_action') return 'The seller has requested that payment be released after review.';
  return 'The seller has proposed a resolution.';
}

function resolutionLabel(type: DisputeResolutionType): string {
  switch (type) {
    case 'refunded':
      return 'Full refund';
    case 'partial_refund':
      return 'Partial refund';
    case 'replaced':
      return 'Replacement';
    case 'no_action':
      return 'Release payment to seller';
    case 'other':
      return 'Other resolution';
  }
}
