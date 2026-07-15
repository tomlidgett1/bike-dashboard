const SMS_API_URL = "https://api.smsbroadcast.com.au/api.php";
const SMS_ADV_API_URL = "https://api.smsbroadcast.com.au/api-adv.php";
const SMS_USERNAME = process.env.SMS_BROADCAST_USERNAME || "accounts@ashburtoncycles.com.au";
const SMS_PASSWORD = process.env.SMS_BROADCAST_PASSWORD || "Ashburton1";
const SMS_FROM = process.env.SMS_BROADCAST_FROM || "AshyCycles";

export type SmsBroadcastBalance = {
  balance: number;
  raw: string;
};

export function parseSmsBroadcastBalanceResponse(raw: string): SmsBroadcastBalance | null {
  const text = raw.trim();
  if (!text) return null;

  const upper = text.toUpperCase();
  if (upper.includes("ERROR") && !upper.includes("OK")) return null;

  const numericMatches = text.match(/-?\d+(?:\.\d+)?/g);
  if (!numericMatches?.length) return null;

  const balance = Number.parseFloat(numericMatches[numericMatches.length - 1]!);
  if (!Number.isFinite(balance)) return null;

  return { balance, raw: text };
}

export async function getSmsBroadcastBalance(): Promise<SmsBroadcastBalance> {
  const params = new URLSearchParams({
    action: "balance",
    username: SMS_USERNAME,
    password: SMS_PASSWORD,
  });

  const response = await fetch(`${SMS_ADV_API_URL}?${params.toString()}`, {
    cache: "no-store",
  });
  const raw = await response.text();
  const parsed = parseSmsBroadcastBalanceResponse(raw);
  if (!parsed) {
    throw new Error(raw.trim() || "Could not read SMSbroadcast balance");
  }
  return parsed;
}

export type SmsBroadcastOptOut = {
  snippet: string;
  url: string | null;
  configured: boolean;
  usesReplyStop: boolean;
};

export function getSmsBroadcastOptOut(): SmsBroadcastOptOut {
  const customSnippet = process.env.SMS_BROADCAST_OPT_OUT_SNIPPET?.trim();
  const url = process.env.SMS_BROADCAST_OPT_OUT_URL?.trim() || null;

  if (customSnippet) {
    return {
      snippet: customSnippet.startsWith(" ") ? customSnippet : ` ${customSnippet}`,
      url,
      configured: Boolean(url || customSnippet),
      usesReplyStop: /reply\s+stop/i.test(customSnippet),
    };
  }

  if (url) {
    const snippet = ` Opt out: ${url}`;
    return { snippet, url, configured: true, usesReplyStop: false };
  }

  return {
    snippet: " Reply STOP to opt-out",
    url: null,
    configured: false,
    usesReplyStop: true,
  };
}

export function messageIncludesSmsOptOut(message: string, optOut = getSmsBroadcastOptOut()): boolean {
  const normalised = message.toLowerCase();
  if (optOut.url && normalised.includes(optOut.url.toLowerCase())) return true;
  if (optOut.snippet.trim() && normalised.includes(optOut.snippet.trim().toLowerCase())) return true;
  return /reply\s+stop|opt\s*out/i.test(normalised);
}

export function appendSmsBroadcastOptOut(message: string, optOut = getSmsBroadcastOptOut()): string {
  const trimmed = message.trim();
  if (messageIncludesSmsOptOut(trimmed, optOut)) return trimmed.slice(0, 160);

  const snippet = optOut.snippet;
  if (!snippet) return trimmed.slice(0, 160);

  const combined = trimmed ? `${trimmed}${snippet}` : snippet.trim();
  if (combined.length <= 160) return combined;

  const budget = Math.max(0, 160 - snippet.length);
  if (budget === 0) return snippet.trim().slice(0, 160);
  return `${trimmed.slice(0, budget).trimEnd()}${snippet}`.slice(0, 160);
}

export function cleanSmsPhone(phone: string): string {
  return phone.replace(/\s+/g, "").replace(/^\+61/, "0");
}

export function isValidSmsPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const cleaned = cleanSmsPhone(phone);
  return /^0\d{8,10}$/.test(cleaned);
}

export async function sendSmsBroadcast(
  to: string,
  message: string,
): Promise<{ phone: string; result: string; success: boolean }> {
  const params = new URLSearchParams({
    username: SMS_USERNAME,
    password: SMS_PASSWORD,
    from: SMS_FROM,
    to,
    message: message.substring(0, 160),
  });

  const response = await fetch(`${SMS_API_URL}?${params.toString()}`);
  const result = await response.text();
  return {
    phone: to,
    result,
    success: result.includes("Your message was sent"),
  };
}
