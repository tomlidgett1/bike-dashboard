/**
 * End-to-end Lightspeed receipt PDF test for Tom Lidgett workorders (no LINQ upload).
 * Usage: npx tsx scripts/test-workorder-receipt-tom.ts
 */
import { config as loadEnv } from "dotenv";
import { writeFileSync } from "node:fs";
loadEnv({ path: ".env.local" });

import { createLightspeedClient } from "../src/lib/services/lightspeed";
import { resolveWorkorderReceiptSaleId } from "../src/lib/services/lightspeed/resolve-workorder-receipt-sale";
import { renderHtmlReceiptPdf } from "../src/lib/services/lightspeed/sale-receipt-pdf";
import { getGenieWorkorder } from "../src/lib/services/lightspeed/workorder-queries";

const STORE_USER_ID = "3acef09d-8b28-46e8-a0c3-45ce59c61972";
const WORKORDER_IDS = ["19565", "3401", "19377"];

async function preparePdf(workorderId: string) {
  const workorder = await getGenieWorkorder(STORE_USER_ID, workorderId);
  if (!workorder) throw new Error(`Workorder ${workorderId} not found`);

  const client = createLightspeedClient(STORE_USER_ID);
  const saleId = await resolveWorkorderReceiptSaleId(client, workorder);

  const html = saleId
    ? await client.renderSaleReceiptHtml(saleId, { template: "SaleReceipt", print: true })
    : await client.renderWorkorderReceiptHtml(workorder.workorder_id, {
        template: "WorkorderReceipt",
        print: true,
      });

  const pdfBytes = await renderHtmlReceiptPdf(html);
  const source = saleId ? `SaleReceipt:${saleId}` : "WorkorderReceipt";

  writeFileSync(`/tmp/receipt-${workorderId}.pdf`, pdfBytes);

  return {
    workorderId,
    saleId,
    source,
    htmlLength: html.length,
    pdfBytes: pdfBytes.byteLength,
    status: workorder.status_name,
  };
}

async function main() {
  let failed = 0;
  for (const id of WORKORDER_IDS) {
    try {
      const result = await preparePdf(id);
      console.log("OK", result);
    } catch (error) {
      failed++;
      console.error("FAIL", id, error instanceof Error ? error.message : error);
    }
  }
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
