import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createLightspeedClient } from "../src/lib/services/lightspeed";

const STORE_USER_ID = "3acef09d-8b28-46e8-a0c3-45ce59c61972";

async function main() {
  const client = createLightspeedClient(STORE_USER_ID);
  for (const id of ["19565", "19377", "14390"]) {
    const wo = await client.getWorkorder(id);
    console.log(`\nWorkorder ${id}:`, {
      saleID: wo.saleID,
      saleLineID: wo.saleLineID,
      customerID: wo.customerID,
      timeStamp: wo.timeStamp,
      note: wo.note?.slice(0, 80),
    });
  }

  const sale = await client.getSale("61476");
  const lines = sale.SaleLines?.SaleLine;
  const arr = Array.isArray(lines) ? lines : lines ? [lines] : [];
  console.log("\nSale 61476 lines sample:", arr.slice(0, 3).map((l) => ({
    saleLineID: l.saleLineID,
    itemID: l.itemID,
    note: l.note,
    description: l.description,
  })));
}

main().catch(console.error);
