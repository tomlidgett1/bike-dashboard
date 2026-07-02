// CRM email sending abstraction.
//
// Default path: the `crm-send-campaign-emails` Supabase edge function, which
// shares RESEND_API_KEY / FROM_EMAIL with the transactional emails (those
// secrets live in Supabase, not in the Next.js environment). The Next side
// renders the per-recipient HTML; the edge function batches and sends.
//
// Override: set RESEND_API_KEY (+ CRM_FROM_EMAIL) in the Next.js environment
// to send directly from this server instead. Swapping to SendGrid/Postmark
// means implementing CrmEmailProvider and returning it from
// getCrmEmailProvider(). See docs/CRM_EMAIL.md.

export interface CrmEmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
}

export interface CrmSendResult {
  to: string;
  success: boolean;
  error?: string;
}

export interface CrmEmailProvider {
  name: string;
  fromEmail: string;
  sendBatch(messages: CrmEmailMessage[]): Promise<CrmSendResult[]>;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================
// Direct Resend (env override)
// ============================================================

const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";
const RESEND_SEND_URL = "https://api.resend.com/emails";
const RESEND_BATCH_SIZE = 50;

class ResendCrmProvider implements CrmEmailProvider {
  name = "resend";
  fromEmail: string;
  private apiKey: string;

  constructor(apiKey: string, fromEmail: string) {
    this.apiKey = apiKey;
    this.fromEmail = fromEmail;
  }

  private toPayload(message: CrmEmailMessage) {
    return {
      from: this.fromEmail,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      headers: message.headers,
    };
  }

  private async sendOne(message: CrmEmailMessage): Promise<CrmSendResult> {
    try {
      const response = await fetch(RESEND_SEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(this.toPayload(message)),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return {
          to: message.to,
          success: false,
          error: body.message || `HTTP ${response.status}`,
        };
      }
      return { to: message.to, success: true };
    } catch (error) {
      return {
        to: message.to,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async sendBatch(messages: CrmEmailMessage[]): Promise<CrmSendResult[]> {
    const results: CrmSendResult[] = [];

    for (let i = 0; i < messages.length; i += RESEND_BATCH_SIZE) {
      const chunk = messages.slice(i, i + RESEND_BATCH_SIZE);
      try {
        const response = await fetch(RESEND_BATCH_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(chunk.map((message) => this.toPayload(message))),
        });

        if (response.ok) {
          results.push(...chunk.map((message) => ({ to: message.to, success: true })));
        } else {
          // Batch calls fail whole — fall back to individual sends so one bad
          // address doesn't sink the other 49. 429s get a breather first.
          if (response.status === 429) await wait(1500);
          for (const message of chunk) {
            results.push(await this.sendOne(message));
            await wait(550);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        results.push(
          ...chunk.map((message) => ({ to: message.to, success: false, error: errorMessage })),
        );
      }

      if (i + RESEND_BATCH_SIZE < messages.length) await wait(600);
    }

    return results;
  }
}

// ============================================================
// Supabase edge function (default — shares transactional secrets)
// ============================================================

// Keep request bodies well under edge limits (~15KB html × 200 ≈ 3MB).
const EDGE_CHUNK_SIZE = 200;

function edgeConfig(): { url: string; serviceKey: string; internalSecret: string } | null {
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const internalSecret = process.env.INTERNAL_EDGE_SHARED_SECRET || "";
  if (!base.trim() || !serviceKey.trim() || !internalSecret.trim()) return null;
  return {
    url: `${base.trim().replace(/\/$/, "")}/functions/v1/crm-send-campaign-emails`,
    serviceKey: serviceKey.trim(),
    internalSecret: internalSecret.trim(),
  };
}

async function callEdge(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const config = edgeConfig();
  if (!config) throw new Error("Supabase URL / service key / internal secret not configured");
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      // Bearer satisfies the gateway's verify_jwt; the shared secret is what
      // the function actually authorises on.
      Authorization: `Bearer ${config.serviceKey}`,
      "x-internal-secret": config.internalSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, json };
}

class SupabaseEdgeCrmProvider implements CrmEmailProvider {
  name = "supabase-edge-resend";
  fromEmail: string;

  constructor(fromEmail: string) {
    this.fromEmail = fromEmail;
  }

  async sendBatch(messages: CrmEmailMessage[]): Promise<CrmSendResult[]> {
    const results: CrmSendResult[] = [];
    for (let i = 0; i < messages.length; i += EDGE_CHUNK_SIZE) {
      const chunk = messages.slice(i, i + EDGE_CHUNK_SIZE);
      try {
        const { status, json } = await callEdge({ messages: chunk });
        const chunkResults = Array.isArray(json.results)
          ? (json.results as CrmSendResult[])
          : null;
        if (status === 200 && chunkResults && chunkResults.length === chunk.length) {
          results.push(...chunkResults);
        } else {
          const error = String(json.error ?? `Edge send failed (HTTP ${status})`);
          results.push(...chunk.map((message) => ({ to: message.to, success: false, error })));
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        results.push(
          ...chunk.map((message) => ({ to: message.to, success: false, error: errorMessage })),
        );
      }
    }
    return results;
  }
}

// The edge config rarely changes — cache the lookup briefly so the contacts /
// campaigns pages don't pay an extra round-trip on every request.
let cachedEdgeSender: { fromEmail: string | null; at: number } | null = null;
const EDGE_CONFIG_TTL_MS = 5 * 60 * 1000;

async function getEdgeSenderEmail(): Promise<string | null> {
  if (cachedEdgeSender && Date.now() - cachedEdgeSender.at < EDGE_CONFIG_TTL_MS) {
    return cachedEdgeSender.fromEmail;
  }
  if (!edgeConfig()) return null;
  try {
    const { status, json } = await callEdge({ action: "config" });
    const fromEmail =
      status === 200 && json.configured ? String(json.fromEmail ?? "").trim() || null : null;
    cachedEdgeSender = { fromEmail, at: Date.now() };
    return fromEmail;
  } catch (error) {
    console.error("[crm] edge sender config lookup failed:", error);
    // Don't cache failures for the full TTL — allow quick retry.
    cachedEdgeSender = { fromEmail: null, at: Date.now() - EDGE_CONFIG_TTL_MS + 15_000 };
    return null;
  }
}

// ============================================================
// Public API
// ============================================================

function directResendOverride(): ResendCrmProvider | null {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const fromEmail = (process.env.CRM_FROM_EMAIL || process.env.FROM_EMAIL || "").trim();
  if (!apiKey || !fromEmail) return null;
  return new ResendCrmProvider(apiKey, fromEmail);
}

/** Sender address campaigns will go out from, or null when nothing is set up. */
export async function getCrmSenderEmail(): Promise<string | null> {
  const direct = directResendOverride();
  if (direct) return direct.fromEmail;
  return getEdgeSenderEmail();
}

/**
 * Returns the configured provider, or null when sending isn't set up —
 * callers must refuse to send.
 */
export async function getCrmEmailProvider(): Promise<CrmEmailProvider | null> {
  const direct = directResendOverride();
  if (direct) return direct;
  const fromEmail = await getEdgeSenderEmail();
  if (!fromEmail) return null;
  return new SupabaseEdgeCrmProvider(fromEmail);
}
