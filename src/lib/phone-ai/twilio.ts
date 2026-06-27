import type { TwilioIncomingNumber } from "./types";

type TwilioCredentials = {
  accountSid: string;
  authHeader: string;
};

function pickEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function getTwilioCredentials(): TwilioCredentials | { error: string } {
  const accountSid = pickEnv(["TWILIO_ACCOUNT_SID", "NEST_TWILIO_ACCOUNT_SID"]);
  if (!accountSid) {
    return { error: "Twilio is not configured (missing TWILIO_ACCOUNT_SID)." };
  }

  const authToken = pickEnv(["TWILIO_AUTH_TOKEN", "NEST_TWILIO_AUTH_TOKEN"]);
  const apiKey = pickEnv(["TWILIO_API_KEY", "NEST_TWILIO_API_KEY"]);
  const apiSecret = pickEnv(["TWILIO_API_SECRET", "NEST_TWILIO_API_SECRET"]);

  if (authToken) {
    return {
      accountSid,
      authHeader: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
    };
  }

  if (apiKey && apiSecret) {
    return {
      accountSid,
      authHeader: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
    };
  }

  return {
    error: "Twilio credentials incomplete. Set TWILIO_AUTH_TOKEN or API key pair.",
  };
}

/** US1 global API — legacy auth tokens only; AU1 tokens must use the regional host. */
const TWILIO_GLOBAL_API = "https://api.twilio.com";

function twilioRegionalApiBase(): string | null {
  const region = pickEnv(["TWILIO_REGION"])?.toLowerCase();
  if (region === "au1") return "https://api.sydney.au1.twilio.com";
  if (region === "ie1") return "https://api.dublin.ie1.twilio.com";
  return null;
}

function twilioApiBase(): string {
  return twilioRegionalApiBase() ?? TWILIO_GLOBAL_API;
}

async function twilioRequestOnBase<T>(
  apiBase: string,
  path: string,
  init?: RequestInit,
  credsOverride?: TwilioCredentials,
): Promise<T> {
  const creds = credsOverride ?? getTwilioCredentials();
  if ("error" in creds) throw new Error(creds.error);

  const headers: Record<string, string> = {
    Authorization: creds.authHeader,
  };
  if (init?.method && init.method !== "GET") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Twilio API ${response.status}: ${detail.slice(0, 300)}`);
  }

  return response.json() as Promise<T>;
}

async function twilioRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return twilioRequestOnBase<T>(twilioApiBase(), path, init);
}

type TwilioIncomingPhoneNumbersResponse = {
  incoming_phone_numbers?: Array<{
    sid?: string;
    phone_number?: string;
    friendly_name?: string;
  }>;
};

export async function listTwilioIncomingNumbers(): Promise<TwilioIncomingNumber[]> {
  const creds = getTwilioCredentials();
  if ("error" in creds) throw new Error(creds.error);

  const data = await twilioRequest<TwilioIncomingPhoneNumbersResponse>(
    `/2010-04-01/Accounts/${creds.accountSid}/IncomingPhoneNumbers.json?PageSize=100`,
    { method: "GET" },
  );

  return (data.incoming_phone_numbers ?? [])
    .filter((row) => row.sid && row.phone_number)
    .map((row) => ({
      sid: row.sid!,
      phoneNumber: row.phone_number!,
      friendlyName: row.friendly_name ?? row.phone_number!,
    }));
}

export function getPhoneAiBridgeUrl(): string | null {
  return pickEnv(["PHONE_AI_BRIDGE_URL", "PUBLIC_BRIDGE_URL"]) ?? null;
}

export async function setInboundVoiceRegion(phoneE164: string, voiceRegion: string): Promise<void> {
  const encoded = encodeURIComponent(phoneE164);
  await twilioRequestOnBase(
    "https://routes.twilio.com",
    `/v2/PhoneNumbers/${encoded}`,
    {
      method: "POST",
      body: new URLSearchParams({ VoiceRegion: voiceRegion }),
    },
  );
}

export async function configureTwilioNumberWebhooks(input: {
  phoneSid: string;
  phoneE164?: string;
  voiceUrl: string;
  statusCallbackUrl: string;
}): Promise<void> {
  const params = new URLSearchParams({
    VoiceUrl: input.voiceUrl,
    VoiceMethod: "POST",
    StatusCallback: input.statusCallbackUrl,
    StatusCallbackMethod: "POST",
  });

  const creds = getTwilioCredentials();
  if ("error" in creds) throw new Error(creds.error);

  const path = `/2010-04-01/Accounts/${creds.accountSid}/IncomingPhoneNumbers/${encodeURIComponent(input.phoneSid)}.json`;

  const regionalBase = twilioRegionalApiBase();
  if (regionalBase) {
    await twilioRequestOnBase(regionalBase, path, { method: "POST", body: params });
    if (input.phoneE164) {
      try {
        await setInboundVoiceRegion(
          input.phoneE164,
          pickEnv(["TWILIO_REGION"])?.toLowerCase() ?? "au1",
        );
      } catch {
        // Routes API may require a US1 auth token; AU1 webhook config still applies.
      }
    }
    return;
  }

  await twilioRequest(path, { method: "POST", body: params });
}
