import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { createLightspeedClient } from "../src/lib/services/lightspeed";
import { getValidAccessToken } from "../src/lib/services/lightspeed/token-manager";
import { LIGHTSPEED_CONFIG } from "../src/lib/services/lightspeed/config";

const STORE_USER_ID = "3acef09d-8b28-46e8-a0c3-45ce59c61972";

async function main() {
  const client = createLightspeedClient(STORE_USER_ID);
  const accountId = await client.getAccountId();
  const token = await getValidAccessToken(STORE_USER_ID);
  for (const id of ["19565", "3401"]) {
    const url = `${LIGHTSPEED_CONFIG.API_BASE_URL}/Account/${accountId}/DisplayTemplate/WorkOrder/${id}.html?template=WorkorderReceipt&print=1`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "text/html" } });
    const html = await res.text();
    console.log(`WO ${id}:`, res.status, html.length, html.includes("receiptHeader") || html.includes("store"));
  }
}

main();
