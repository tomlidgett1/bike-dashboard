/**
 * Try posting a $1 credit-account deposit for Tom Lidgett via Sale API.
 * Dry-run first unless APPLY=1.
 */
import { getValidAccessToken } from "../src/lib/services/lightspeed/token-manager";
import { LIGHTSPEED_CONFIG } from "../src/lib/services/lightspeed/config";

const STORE_USER_ID = "3acef09d-8b28-46e8-a0c3-45ce59c61972";
const APPLY = process.env.APPLY === "1";

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
    // keep
  }
  console.log("\n===", init?.method || "GET", path, res.status, "===");
  console.log(JSON.stringify(body, null, 2).slice(0, 12000));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return body as Record<string, unknown>;
}

async function main() {
  const accountId = "168990";
  const creditBefore = await api(`/Account/${accountId}/CreditAccount/1008.json`);

  const payload = {
    employeeID: "1",
    registerID: "1",
    shopID: "1",
    customerID: "579",
    completed: "true",
    referenceNumber: "YJ-NEST-c0a2e283",
    referenceNumberSource: "Yellow Jersey Nest",
    SalePayments: {
      SalePayment: [
        {
          amount: "1.00",
          paymentTypeID: "7", // eCom — online payment received
          registerID: "1",
          employeeID: "1",
        },
        {
          amount: "-1.00",
          paymentTypeID: "4", // Credit Account deposit (negative)
          creditAccountID: "1008",
          registerID: "1",
          employeeID: "1",
        },
      ],
    },
  };

  console.log("\nPayload:", JSON.stringify(payload, null, 2));
  if (!APPLY) {
    console.log("\nSet APPLY=1 to POST this sale.");
    console.log("Credit before:", JSON.stringify(creditBefore, null, 2));
    return;
  }

  const sale = await api(`/Account/${accountId}/Sale.json`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const creditAfter = await api(`/Account/${accountId}/CreditAccount/1008.json`);
  console.log("\nSale created. Credit after:", JSON.stringify(creditAfter, null, 2));
  console.log("Sale summary:", JSON.stringify(sale, null, 2).slice(0, 4000));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
