/**
 * Deposit Nest "Request money" payments onto a Lightspeed customer Credit Account.
 *
 * Lightspeed represents deposits as a completed Sale with two SalePayments:
 *  1. Positive amount on an inbound payment type (eCom / Credit Card) — money received
 *  2. Negative amount on the Credit Account payment type — deposit onto the account
 *
 * CreditAccount.balance: negative = credit available, positive = amount owed.
 */

export const YELLOW_JERSEY_CREDIT_REFERENCE_SOURCE = "Yellow Jersey Nest";

export function buildNestPaymentReferenceNumber(paymentRequestId: string): string {
  return `YJ-NEST-${paymentRequestId.slice(0, 8)}`;
}

export function formatAudFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface CreditDepositSaleContext {
  shopID: string;
  registerID: string;
  employeeID: string;
  customerID: string;
  /**
   * Primary (non-gift-card) credit account ID when the customer already has one.
   * Omit when creating — Lightspeed auto-creates and links a primary account if
   * the Credit Account SalePayment has no creditAccountID.
   */
  creditAccountID?: string | null;
  /** Inbound payment type (eCom preferred, else Credit Card / Cash). */
  inboundPaymentTypeID: string;
  /** Credit Account payment type (type === "credit account"). */
  creditAccountPaymentTypeID: string;
}

export interface CreditDepositSaleDetails {
  paymentRequestId: string;
  amountCents: number;
  description?: string | null;
  stripePaymentIntentId?: string | null;
}

export function buildCreditDepositSalePayload(
  ctx: CreditDepositSaleContext,
  details: CreditDepositSaleDetails,
): Record<string, unknown> {
  const amount = formatAudFromCents(details.amountCents);
  const reference = buildNestPaymentReferenceNumber(details.paymentRequestId);

  const creditPayment: Record<string, string> = {
    amount: `-${amount}`,
    paymentTypeID: ctx.creditAccountPaymentTypeID,
    registerID: ctx.registerID,
    employeeID: ctx.employeeID,
  };
  // Only attach an existing primary account. Sending a gift-card account ID
  // fails with "SalePayment.creditAccountID != Customer.creditAccountID".
  // Omitting the field makes Lightspeed create + link a primary account.
  const existingId = ctx.creditAccountID?.trim();
  if (existingId && existingId !== "0") {
    creditPayment.creditAccountID = existingId;
  }

  return {
    employeeID: ctx.employeeID,
    registerID: ctx.registerID,
    shopID: ctx.shopID,
    customerID: ctx.customerID,
    completed: "true",
    referenceNumber: reference,
    referenceNumberSource: YELLOW_JERSEY_CREDIT_REFERENCE_SOURCE,
    SalePayments: {
      SalePayment: [
        {
          amount,
          paymentTypeID: ctx.inboundPaymentTypeID,
          registerID: ctx.registerID,
          employeeID: ctx.employeeID,
        },
        creditPayment,
      ],
    },
  };
}
