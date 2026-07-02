// CRM email sending abstraction.
//
// The app's transactional email already runs on Resend (Supabase edge
// functions), so Resend is the default here too. Swapping providers means
// implementing CrmEmailProvider and returning it from getCrmEmailProvider().
//
// Environment variables (see docs/CRM_EMAIL.md):
//   RESEND_API_KEY  — Resend API key (required to send)
//   CRM_FROM_EMAIL  — sender, e.g. "Yellow Jersey <hello@yellowjersey.com.au>"
//                     (falls back to FROM_EMAIL)

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

/** Sender configured for CRM campaigns, or null when not set up. */
export function getCrmFromEmail(): string | null {
  const from = process.env.CRM_FROM_EMAIL || process.env.FROM_EMAIL || "";
  return from.trim() || null;
}

const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";
const RESEND_SEND_URL = "https://api.resend.com/emails";
const BATCH_SIZE = 50;

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

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const chunk = messages.slice(i, i + BATCH_SIZE);
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
        } else if (response.status === 429) {
          // Respect rate limits, then retry this chunk individually.
          await new Promise((resolve) => setTimeout(resolve, 1500));
          for (const message of chunk) {
            results.push(await this.sendOne(message));
            await new Promise((resolve) => setTimeout(resolve, 550));
          }
        } else {
          // Batch calls fail whole — fall back to individual sends so one bad
          // address doesn't sink the other 49.
          for (const message of chunk) {
            results.push(await this.sendOne(message));
            await new Promise((resolve) => setTimeout(resolve, 550));
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        results.push(
          ...chunk.map((message) => ({ to: message.to, success: false, error: errorMessage })),
        );
      }

      // Small pause between batch requests to stay under Resend's rate limit.
      if (i + BATCH_SIZE < messages.length) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }

    return results;
  }
}

/**
 * Returns the configured provider, or null when sending isn't set up
 * (missing API key or sender address) — callers must refuse to send.
 */
export function getCrmEmailProvider(): CrmEmailProvider | null {
  const fromEmail = getCrmFromEmail();
  const apiKey = process.env.RESEND_API_KEY || "";
  if (!fromEmail || !apiKey.trim()) return null;
  return new ResendCrmProvider(apiKey.trim(), fromEmail);
}
