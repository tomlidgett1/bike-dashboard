import Stripe from 'stripe';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';
import { triggerSellerPayout } from '@/lib/stripe/payouts';

export type DisputeResolutionType =
  | 'refunded'
  | 'partial_refund'
  | 'replaced'
  | 'no_action'
  | 'other';

export interface ApplyDisputeResolutionOptions {
  ticketId: string;
  purchaseId: string;
  actorId: string;
  resolutionType: DisputeResolutionType;
  resolutionAmount?: number | null;
  note?: string | null;
}

export interface AppliedDisputeResolution {
  refundId?: string;
  transferReversalId?: string;
  payoutReleased?: boolean;
  payoutQueuedForRetry?: boolean;
}

export interface MarkPurchasePaymentDisputedOptions {
  purchaseId: string;
  ticketId: string;
  reason?: string | null;
  openedAt?: string | null;
}

type PaymentReference = {
  id: string;
  order_number: string | null;
  stripe_payment_intent_id: string | null;
  stripe_session_id: string | null;
};

type PurchaseForResolution = {
  id: string;
  order_number: string;
  buyer_id: string;
  seller_id: string;
  total_amount: number;
  item_price: number | null;
  shipping_cost: number | null;
  platform_fee: number | null;
  seller_payout_amount: number | null;
  funds_status: string | null;
  payment_status: string | null;
  status: string | null;
  stripe_payment_intent_id: string | null;
  stripe_session_id: string | null;
  stripe_transfer_id: string | null;
  stripe_refund_id: string | null;
};

type SourceCharge = {
  chargeId: string | null;
  paymentIntentId: string | null;
};

const REFUND_RESOLUTION_TYPES = new Set<DisputeResolutionType>([
  'refunded',
  'partial_refund',
]);

export function isRefundResolution(type: DisputeResolutionType): boolean {
  return REFUND_RESOLUTION_TYPES.has(type);
}

export function normaliseResolutionAmount(
  resolutionType: DisputeResolutionType,
  amount: number | null | undefined,
  purchaseTotal: number
): number | null {
  if (resolutionType === 'refunded') return roundMoney(purchaseTotal);
  if (resolutionType !== 'partial_refund') return null;
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new Error('Partial refund amount is required');
  }

  const rounded = roundMoney(amount);
  if (rounded <= 0) {
    throw new Error('Partial refund amount must be greater than $0');
  }
  if (rounded > roundMoney(purchaseTotal)) {
    throw new Error('Partial refund amount cannot exceed the order total');
  }
  return rounded;
}

export async function applyDisputeResolution(
  options: ApplyDisputeResolutionOptions
): Promise<AppliedDisputeResolution> {
  const supabase = createServiceRoleClient();
  const stripe = getStripe();

  const { data: purchase, error: purchaseError } = await supabase
    .from('purchases')
    .select(`
      id,
      order_number,
      buyer_id,
      seller_id,
      total_amount,
      item_price,
      shipping_cost,
      platform_fee,
      seller_payout_amount,
      funds_status,
      payment_status,
      status,
      stripe_payment_intent_id,
      stripe_session_id,
      stripe_transfer_id,
      stripe_refund_id
    `)
    .eq('id', options.purchaseId)
    .single();

  if (purchaseError || !purchase) {
    throw new Error('Purchase not found');
  }

  const typedPurchase = purchase as PurchaseForResolution;

  if (typedPurchase.stripe_refund_id && isRefundResolution(options.resolutionType)) {
    throw new Error('This purchase has already been refunded');
  }

  if (isRefundResolution(options.resolutionType)) {
    return refundPurchase(stripe, supabase, typedPurchase, options);
  }

  if (options.resolutionType === 'no_action') {
    return releasePurchaseToSeller(supabase, typedPurchase, options);
  }

  await supabase
    .from('support_tickets')
    .update({
      status: 'resolved',
      resolution_type: options.resolutionType,
      resolution: options.note || resolutionLabel(options.resolutionType),
      resolution_accepted_by: options.actorId,
      resolution_accepted_at: new Date().toISOString(),
      resolution_actioned_at: new Date().toISOString(),
      resolution_error: null,
    })
    .eq('id', options.ticketId);

  await insertTicketHistory(supabase, options.ticketId, options.actorId, 'resolution_accepted', {
    resolution_type: options.resolutionType,
  });

  await insertTicketHistory(supabase, options.ticketId, options.actorId, 'resolution_actioned', {
    resolution_type: options.resolutionType,
  });

  return {};
}

export async function markPurchasePaymentDisputed(
  options: MarkPurchasePaymentDisputedOptions
): Promise<void> {
  const supabase = createServiceRoleClient();
  const stripe = getStripe();

  const { data: purchase, error } = await supabase
    .from('purchases')
    .select('id, order_number, stripe_payment_intent_id, stripe_session_id')
    .eq('id', options.purchaseId)
    .single();

  if (error || !purchase) {
    throw new Error('Purchase not found while marking Stripe payment disputed');
  }

  await updatePaymentIntentMetadata(stripe, purchase as PaymentReference, {
    yellow_jersey_funds_status: 'in_app_dispute',
    yellow_jersey_ticket_id: options.ticketId,
    yellow_jersey_purchase_id: options.purchaseId,
    yellow_jersey_disputed_at: options.openedAt || new Date().toISOString(),
    yellow_jersey_dispute_reason: cleanMetadataValue(options.reason || 'buyer_claim'),
  });
}

async function refundPurchase(
  stripe: Stripe,
  supabase: ReturnType<typeof createServiceRoleClient>,
  purchase: PurchaseForResolution,
  options: ApplyDisputeResolutionOptions
): Promise<AppliedDisputeResolution> {
  const refundAmount = normaliseResolutionAmount(
    options.resolutionType,
    options.resolutionAmount,
    purchase.total_amount
  );

  if (!refundAmount) throw new Error('Refund amount could not be calculated');

  const source = await resolveSourceCharge(stripe, purchase);
  if (!source.paymentIntentId && !source.chargeId) {
    throw new Error('No Stripe charge or payment intent found for purchase');
  }

  const refund = await stripe.refunds.create({
    ...(source.paymentIntentId
      ? { payment_intent: source.paymentIntentId }
      : { charge: source.chargeId! }),
    amount: moneyToCents(refundAmount),
    reason: 'requested_by_customer',
    metadata: {
      purchase_id: purchase.id,
      ticket_id: options.ticketId,
      order_number: purchase.order_number,
      resolution_type: options.resolutionType,
      platform: 'yellow_jersey',
    },
  });

  let transferReversalId: string | undefined;
  if (purchase.stripe_transfer_id) {
    const reversalAmount = transferReversalAmountCents(purchase, refundAmount);
    if (reversalAmount > 0) {
      const reversal = await stripe.transfers.createReversal(purchase.stripe_transfer_id, {
        amount: reversalAmount,
        metadata: {
          purchase_id: purchase.id,
          ticket_id: options.ticketId,
          refund_id: refund.id,
          order_number: purchase.order_number,
          platform: 'yellow_jersey',
        },
      });
      transferReversalId = reversal.id;
    }
  }

  const now = new Date().toISOString();
  await supabase
    .from('purchases')
    .update({
      status: 'refunded',
      payment_status: 'refunded',
      funds_status: 'refunded',
      payout_status: purchase.stripe_transfer_id ? 'completed' : 'pending',
      stripe_refund_id: refund.id,
      stripe_refund_amount: refundAmount,
      stripe_refunded_at: now,
      stripe_transfer_reversal_id: transferReversalId || null,
      refund_reason: options.note || resolutionLabel(options.resolutionType),
    })
    .eq('id', purchase.id);

  await supabase
    .from('support_tickets')
    .update({
      status: 'resolved',
      resolution_type: options.resolutionType,
      resolution_amount: refundAmount,
      resolution: options.note || resolutionLabel(options.resolutionType),
      resolution_accepted_by: options.actorId,
      resolution_accepted_at: now,
      resolution_actioned_at: now,
      resolution_error: null,
      stripe_refund_id: refund.id,
      stripe_transfer_reversal_id: transferReversalId || null,
    })
    .eq('id', options.ticketId);

  await insertTicketHistory(supabase, options.ticketId, options.actorId, 'resolution_accepted', {
    resolution_type: options.resolutionType,
    resolution_amount: refundAmount,
  });

  await insertTicketHistory(supabase, options.ticketId, options.actorId, 'refund_processed', {
    refund_id: refund.id,
    refund_amount: refundAmount,
    transfer_reversal_id: transferReversalId || null,
  });

  await safelyUpdatePaymentIntentMetadata(stripe, purchase, {
    yellow_jersey_funds_status: 'refunded',
    yellow_jersey_ticket_id: options.ticketId,
    yellow_jersey_refund_id: refund.id,
    yellow_jersey_refunded_at: now,
  });

  return {
    refundId: refund.id,
    transferReversalId,
  };
}

async function releasePurchaseToSeller(
  supabase: ReturnType<typeof createServiceRoleClient>,
  purchase: PurchaseForResolution,
  options: ApplyDisputeResolutionOptions
): Promise<AppliedDisputeResolution> {
  if (purchase.funds_status !== 'released' && purchase.funds_status !== 'auto_released') {
    await supabase
      .from('purchases')
      .update({
        buyer_confirmed_at: new Date().toISOString(),
        funds_status: 'released',
        payout_status: 'processing',
      })
      .eq('id', purchase.id);
  }

  let payoutQueuedForRetry = false;
  let payoutError: string | null = null;

  try {
    await triggerSellerPayout(purchase.id);
  } catch (error) {
    payoutQueuedForRetry = true;
    payoutError = error instanceof Error ? error.message : 'Seller payout queued for retry';
    console.error('[Dispute Resolution] Seller payout failed after release:', error);
  }

  const now = new Date().toISOString();
  await supabase
    .from('support_tickets')
    .update({
      status: 'resolved',
      resolution_type: 'no_action',
      resolution: options.note || 'Funds released to seller after review.',
      resolution_accepted_by: options.actorId,
      resolution_accepted_at: now,
      resolution_actioned_at: now,
      resolution_error: payoutError,
    })
    .eq('id', options.ticketId);

  await insertTicketHistory(supabase, options.ticketId, options.actorId, 'resolution_accepted', {
    resolution_type: 'no_action',
  });

  await insertTicketHistory(supabase, options.ticketId, options.actorId, 'resolution_actioned', {
    resolution_type: 'no_action',
    payout_released: true,
    payout_queued_for_retry: payoutQueuedForRetry,
  });

  await safelyUpdatePaymentIntentMetadata(getStripe(), purchase, {
    yellow_jersey_funds_status: 'released_to_seller',
    yellow_jersey_ticket_id: options.ticketId,
    yellow_jersey_released_at: now,
    yellow_jersey_payout_queued_for_retry: String(payoutQueuedForRetry),
  });

  return { payoutReleased: true, payoutQueuedForRetry };
}

async function resolveSourceCharge(
  stripe: Stripe,
  purchase: PaymentReference
): Promise<SourceCharge> {
  if (purchase.stripe_payment_intent_id) {
    const paymentIntent = await stripe.paymentIntents.retrieve(
      purchase.stripe_payment_intent_id,
      { expand: ['latest_charge'] }
    );
    const latestCharge = paymentIntent.latest_charge;
    return {
      paymentIntentId: paymentIntent.id,
      chargeId: typeof latestCharge === 'string' ? latestCharge : latestCharge?.id || null,
    };
  }

  if (purchase.stripe_session_id) {
    const session = await stripe.checkout.sessions.retrieve(purchase.stripe_session_id, {
      expand: ['payment_intent'],
    });
    const paymentIntent = session.payment_intent;
    if (paymentIntent && typeof paymentIntent !== 'string') {
      const latestCharge = paymentIntent.latest_charge;
      return {
        paymentIntentId: paymentIntent.id,
        chargeId: typeof latestCharge === 'string' ? latestCharge : latestCharge?.id || null,
      };
    }
  }

  return { paymentIntentId: null, chargeId: null };
}

async function safelyUpdatePaymentIntentMetadata(
  stripe: Stripe,
  purchase: PaymentReference,
  metadata: Record<string, string>
): Promise<void> {
  try {
    await updatePaymentIntentMetadata(stripe, purchase, metadata);
  } catch (error) {
    console.error('[Dispute Resolution] Failed to update Stripe payment metadata:', error);
  }
}

async function updatePaymentIntentMetadata(
  stripe: Stripe,
  purchase: PaymentReference,
  metadata: Record<string, string>
): Promise<void> {
  const source = await resolveSourceCharge(stripe, purchase);
  if (!source.paymentIntentId) return;

  await stripe.paymentIntents.update(source.paymentIntentId, {
    metadata: {
      yellow_jersey_purchase_id: purchase.id,
      ...(purchase.order_number && { yellow_jersey_order_number: purchase.order_number }),
      ...metadata,
    },
  });
}

function cleanMetadataValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function transferReversalAmountCents(
  purchase: PurchaseForResolution,
  refundAmount: number
): number {
  const sellerPayout = purchase.seller_payout_amount || 0;
  if (sellerPayout <= 0 || purchase.total_amount <= 0) return 0;

  if (roundMoney(refundAmount) >= roundMoney(purchase.total_amount)) {
    return moneyToCents(sellerPayout);
  }

  const sellerShare = (refundAmount / purchase.total_amount) * sellerPayout;
  return Math.min(moneyToCents(sellerShare), moneyToCents(sellerPayout));
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

function moneyToCents(amount: number): number {
  return Math.round(roundMoney(amount) * 100);
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function resolutionLabel(type: DisputeResolutionType): string {
  switch (type) {
    case 'refunded':
      return 'Full refund approved.';
    case 'partial_refund':
      return 'Partial refund approved.';
    case 'replaced':
      return 'Replacement agreed.';
    case 'no_action':
      return 'Funds released to seller.';
    case 'other':
      return 'Resolution agreed.';
  }
}
