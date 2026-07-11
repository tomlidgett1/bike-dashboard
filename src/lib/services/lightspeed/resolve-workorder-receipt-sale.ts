import type { LightspeedClient } from "./lightspeed-client";
import type { GenieWorkorderDetail } from "@/lib/services/lightspeed/workorder-queries";
import { normalizeLightspeedId } from "@/lib/services/lightspeed/normalize-lightspeed-id";

export async function resolveWorkorderReceiptSaleId(
  client: LightspeedClient,
  workorder: Pick<GenieWorkorderDetail, "sale_id" | "sale_line_id">,
): Promise<string | null> {
  const direct = normalizeLightspeedId(workorder.sale_id);
  if (direct) return direct;

  const saleLineId = normalizeLightspeedId(workorder.sale_line_id);
  if (!saleLineId) return null;

  const saleLine = await client.getSaleLine(saleLineId);
  return normalizeLightspeedId(saleLine?.saleID);
}

export function workorderCanSendReceipt(workorder: Pick<GenieWorkorderDetail, "sale_id" | "sale_line_id" | "is_finished" | "items">): boolean {
  if (normalizeLightspeedId(workorder.sale_id) || normalizeLightspeedId(workorder.sale_line_id)) {
    return true;
  }
  if (workorder.is_finished) return true;
  return workorder.items.length > 0;
}
