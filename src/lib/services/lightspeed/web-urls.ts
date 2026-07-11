/**
 * Deep links into the Lightspeed Retail (R-Series) web UI.
 * Safe for client and server — no Node-only imports.
 */

export function lightspeedWebBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_LIGHTSPEED_WEB_BASE_URL?.replace(/\/$/, "") ||
    process.env.LIGHTSPEED_WEB_BASE_URL?.replace(/\/$/, "") ||
    "https://aus.merchantos.com"
  );
}

/** Example: https://aus.merchantos.com/?name=purchase.views.purchase&form_name=view&id=4272&tab=main */
export function lightspeedPurchaseOrderUrl(orderId: string): string {
  return `${lightspeedWebBaseUrl()}/?name=purchase.views.purchase&form_name=view&id=${encodeURIComponent(orderId)}&tab=main`;
}

export function lightspeedSaleUrl(saleId: string): string {
  return `${lightspeedWebBaseUrl()}/?name=sale.views.sale&form_name=view&id=${encodeURIComponent(saleId)}&tab=main`;
}

/** Example: https://aus.merchantos.com/?name=customer.views.customer&form_name=view&id=579&tab=account */
export function lightspeedCustomerUrl(customerId: string): string {
  return `${lightspeedWebBaseUrl()}/?name=customer.views.customer&form_name=view&id=${encodeURIComponent(customerId)}&tab=account`;
}

export function lightspeedWorkorderUrl(workorderId: string): string {
  return `${lightspeedWebBaseUrl()}/?name=workorder.views.workorder&form_name=view&id=${encodeURIComponent(workorderId)}&tab=main`;
}
