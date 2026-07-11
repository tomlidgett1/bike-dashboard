/**
 * Probe Lightspeed sale receipt DisplayTemplate for Tom Lidgett workorders.
 * Usage: npx tsx scripts/probe-workorder-receipt.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createLightspeedClient } from "../src/lib/services/lightspeed";
import { listGenieWorkorders, getGenieWorkorder } from "../src/lib/services/lightspeed/workorder-queries";
import { renderHtmlReceiptPdf } from "../src/lib/services/lightspeed/sale-receipt-pdf";

const STORE_USER_ID = "3acef09d-8b28-46e8-a0c3-45ce59c61972";
const CUSTOMER_ID = "579";

async function tryReceipt(client: ReturnType<typeof createLightspeedClient>, saleId: string) {
  const templates = ["SaleReceipt", "Receipt", "Sale", "CustomerReceipt"];
  for (const template of templates) {
    try {
      const html = await client.renderSaleReceiptHtml(saleId, { template, print: true });
      const pdf = await renderHtmlReceiptPdf(html);
      console.log(`  OK template=${template} html=${html.length} pdf=${pdf.byteLength}`);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const body =
        error && typeof error === "object" && "body" in error
          ? String((error as { body?: unknown }).body ?? "").slice(0, 300)
          : "";
      console.log(`  FAIL template=${template}: ${msg}${body ? ` body=${body}` : ""}`);
    }
  }
  return false;
}

async function main() {
  const client = createLightspeedClient(STORE_USER_ID);

  // Raw workorder fields
  const listed = await listGenieWorkorders(STORE_USER_ID, {
    customer_id: CUSTOMER_ID,
    scope: "all",
    limit: 5,
    include_details: true,
    include_archived: true,
  });

  console.log(`Workorders for customer ${CUSTOMER_ID}:`, listed.workorders.length);
  for (const wo of listed.workorders) {
    console.log(`\n#${wo.workorder_id} sale_id=${wo.sale_id} status=${wo.status_name}`);
    const detail = await getGenieWorkorder(STORE_USER_ID, wo.workorder_id);
    console.log(`  detail sale_id=${detail?.sale_id}`);
  }

  // Recent customer sales
  console.log("\n--- Recent sales for customer 579 ---");
  const accountId = await client.getAccountId();
  const salesResp = await fetch(
    `${process.env.LIGHTSPEED_API_BASE_URL || "https://api.lightspeedapp.com/API/V3"}${`/Account/${accountId}/Sale.json?customerID=${CUSTOMER_ID}&sort=-timeStamp&limit=10`}`,
    {
      headers: {
        Authorization: `Bearer ${await import("../src/lib/services/lightspeed/token-manager").then(m => m.getValidAccessToken(STORE_USER_ID))}`,
        Accept: "application/json",
      },
    },
  );
  const salesJson = await salesResp.json();
  const sales = Array.isArray(salesJson?.Sale) ? salesJson.Sale : salesJson?.Sale ? [salesJson.Sale] : [];
  for (const sale of sales.slice(0, 10)) {
    console.log(`  saleID=${sale.saleID} completed=${sale.completed} voided=${sale.voided} total=${sale.total}`);
    await tryReceipt(client, String(sale.saleID));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
