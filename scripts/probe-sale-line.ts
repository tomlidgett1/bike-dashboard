import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { getValidAccessToken } from "../src/lib/services/lightspeed/token-manager";
import { LIGHTSPEED_CONFIG } from "../src/lib/services/lightspeed/config";

const STORE_USER_ID = "3acef09d-8b28-46e8-a0c3-45ce59c61972";

async function api(path: string) {
  const token = await getValidAccessToken(STORE_USER_ID);
  const res = await fetch(`${LIGHTSPEED_CONFIG.API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const text = await res.text();
  console.log(path, res.status, text.slice(0, 500));
  return JSON.parse(text);
}

async function main() {
  const account = await api("/Account.json");
  const accountId = Array.isArray(account.Account) ? account.Account[0].accountID : account.Account.accountID;

  for (const lineId of ["131916", "130716", "98311"]) {
    const data = await api(`/Account/${accountId}/SaleLine/${lineId}.json?load_relations=%5B%22Sale%22%5D`);
    const line = data.SaleLine;
    console.log(`line ${lineId}: saleID=${line.saleID} Sale.saleID=${line.Sale?.saleID} completed=${line.Sale?.completed}`);
  }
}

main().catch(console.error);
