/**
 * Probe Lightspeed customer lookup for a phone number.
 * Run: npx tsx --env-file=.env.local scripts/probe-nest-phone-lookup.ts +61403188006
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const USER_ID = "3acef09d-8b28-46e8-a0c3-45ce59c61972";
const ACCOUNT_ID = "168990";
const API_BASE = "https://api.lightspeedapp.com/API/V3";
const phone = process.argv[2] ?? "+61403188006";

function phoneDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

function decryptToken(encryptedToken: string): string {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY!, "hex");
  const [ivHex, authTagHex, encrypted] = encryptedToken.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

async function getAccessToken(): Promise<string> {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supabase
    .from("lightspeed_connections")
    .select("*")
    .eq("user_id", USER_ID)
    .single();
  if (error) throw error;

  let accessToken = decryptToken(data.access_token_encrypted);
  const expiresAt = new Date(data.token_expires_at).getTime();
  if (Date.now() > expiresAt - 60_000) {
    const refreshToken = decryptToken(data.refresh_token_encrypted);
    const res = await fetch("https://cloud.lightspeedapp.com/auth/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.LIGHTSPEED_CLIENT_ID!,
        client_secret: process.env.LIGHTSPEED_CLIENT_SECRET!,
        refresh_token: refreshToken,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(json)}`);
    accessToken = json.access_token;
    console.log("Refreshed access token");
  }
  return accessToken;
}

async function api(token: string, endpoint: string) {
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function customerPhones(customer: Record<string, unknown>): string[] {
  const contact = customer.Contact as Record<string, unknown> | undefined;
  const phones = contact?.Phones as Record<string, unknown> | undefined;
  const rows = ensureArray(phones?.ContactPhone as Record<string, unknown> | Record<string, unknown>[] | undefined);
  return rows.map((row) => String(row.number ?? "").trim()).filter(Boolean);
}

function customerName(customer: Record<string, unknown>): string {
  return [customer.firstName, customer.lastName]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

async function main() {
  const token = await getAccessToken();
  const digits = phoneDigits(phone);
  const tail9 = digits.slice(-9);
  const local = digits.startsWith("61") ? `0${digits.slice(2)}` : digits;

  const filterAttempts = [
    ["Contact.Phones.ContactPhone.number", phone],
    ["Contact.Phones.ContactPhone.number", local],
    ["Contact.Phones.ContactPhone.number", tail9],
    ["Contact.Phones.ContactPhone.number", `~,%${tail9}%`],
    ["Contact.Phones.ContactPhone.number", `~,%${local.slice(-4)}%`],
    ["Contact.email", phone],
  ];

  console.log("Probing phone:", phone, "digits:", digits, "local:", local, "tail9:", tail9);

  for (const [field, value] of filterAttempts) {
    const qs = new URLSearchParams({
      load_relations: '["Contact"]',
      archived: "false",
      limit: "10",
      [field]: String(value),
    });
    const result = await api(token, `/Account/${ACCOUNT_ID}/Customer.json?${qs.toString()}`);
    const customers = ensureArray(
      (result.body as Record<string, unknown>)?.Customer as Record<string, unknown> | Record<string, unknown>[] | undefined,
    );
    console.log(
      `\nFilter ${field}=${value} -> status ${result.status}, count ${customers.length}`,
      customers.slice(0, 2).map((customer) => ({
        id: customer.customerID,
        name: customerName(customer),
        phones: customerPhones(customer),
      })),
    );
  }

  let endpoint: string | null = `/Account/${ACCOUNT_ID}/Customer.json?${new URLSearchParams({
    load_relations: '["Contact"]',
    archived: "false",
    limit: "100",
  }).toString()}`;
  let pages = 0;
  let found: Record<string, unknown> | null = null;

  while (endpoint && pages < 80 && !found) {
    const result = await api(token, endpoint);
    const payload = result.body as Record<string, unknown>;
    const customers = ensureArray(payload.Customer as Record<string, unknown> | Record<string, unknown>[] | undefined);
    pages += 1;

    for (const customer of customers) {
      for (const entry of customerPhones(customer)) {
        const pd = phoneDigits(entry);
        if (pd === digits || pd === tail9 || pd.endsWith(tail9) || digits.endsWith(pd)) {
          found = {
            id: customer.customerID,
            name: customerName(customer),
            phone: entry,
            page: pages,
          };
          break;
        }
      }
      if (found) break;
    }

    const next = (payload["@attributes"] as Record<string, unknown> | undefined)?.next;
    endpoint = typeof next === "string" && customers.length >= 100 ? next : null;
  }

  console.log("\nScan pages:", pages);
  console.log("Scan found:", found);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
