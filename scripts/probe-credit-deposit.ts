/**
 * Probe Lightspeed credit-account deposit APIs for Tom Lidgett (#579).
 */
import { getValidAccessToken } from "../src/lib/services/lightspeed/token-manager";
import { LIGHTSPEED_CONFIG } from "../src/lib/services/lightspeed/config";

const STORE_USER_ID = "3acef09d-8b28-46e8-a0c3-45ce59c61972";
const CUSTOMER_ID = "579";

async function api(path: string, init?: RequestInit) {
  const token = await getValidAccessToken(STORE_USER_ID);
  if (!token) throw new Error("No token");
  const res = await fetch(`${LIGHTSPEED_CONFIG.API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep text
  }
  console.log("\n===", init?.method || "GET", path, res.status, "===");
  console.log(JSON.stringify(body, null, 2).slice(0, 8000));
  return { status: res.status, body };
}

async function main() {
  // Discover account id from Account.json
  const account = await api("/Account.json");
  const accountId =
    (account.body as { Account?: { accountID?: string } | Array<{ accountID?: string }> })
      ?.Account &&
    (Array.isArray((account.body as { Account: unknown }).Account)
      ? ((account.body as { Account: Array<{ accountID: string }> }).Account[0]?.accountID)
      : (account.body as { Account: { accountID: string } }).Account.accountID);

  if (!accountId) throw new Error("No account id");
  console.log("Using account", accountId);

  await api(
    `/Account/${accountId}/Customer/${CUSTOMER_ID}.json?load_relations=${encodeURIComponent(
      '["Contact","CreditAccount"]',
    )}`,
  );

  await api(`/Account/${accountId}/CreditAccount.json?customerID=${CUSTOMER_ID}`);
  await api(`/Account/${accountId}/PaymentType.json`);
  await api(`/Account/${accountId}/Register.json?archived=false`);
  await api(`/Account/${accountId}/Employee.json?archived=false&lockOut=false&limit=5`);
  await api(`/Account/${accountId}/Shop.json?archived=false`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
