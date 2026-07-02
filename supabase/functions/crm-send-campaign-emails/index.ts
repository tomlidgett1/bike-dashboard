// CRM campaign email sender.
//
// The Resend API key + FROM_EMAIL live in Supabase edge secrets (shared with
// the transactional emails), so CRM campaign sending runs here rather than in
// the Next.js server. The Next API route (src/lib/crm/email-provider.ts)
// renders the per-recipient HTML and calls this function with the finished
// messages; this function only authenticates, batches, and sends.
//
// Auth: internal-only. Callers must present INTERNAL_EDGE_SHARED_SECRET in
// the x-internal-secret header (repo convention, see analyze-listing-ai) —
// user/anon JWTs pass the gateway's verify_jwt but are rejected here, because
// this function can send arbitrary email.
//
// Actions:
//   POST { action: "config" }            → { fromEmail }  (sender for UI/guardrails)
//   POST { messages: [{to, subject, html, text, headers}] }
//                                        → { results: [{to, success, error}] }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-internal-secret, x-client-info, apikey, content-type',
};

const INTERNAL_EDGE_SHARED_SECRET = Deno.env.get('INTERNAL_EDGE_SHARED_SECRET') ?? '';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function isInternalRequest(req: Request): boolean {
  const received = req.headers.get('x-internal-secret')?.trim() ?? '';
  return Boolean(
    received && INTERNAL_EDGE_SHARED_SECRET && timingSafeEqual(received, INTERNAL_EDGE_SHARED_SECRET),
  );
}

const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch';
const RESEND_SEND_URL = 'https://api.resend.com/emails';
const BATCH_SIZE = 50;
const MAX_MESSAGES = 5000;

type CrmMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
};

type SendResult = { to: string; success: boolean; error?: string };

function getFromEmail(): string | null {
  const from = Deno.env.get('CRM_FROM_EMAIL') || Deno.env.get('FROM_EMAIL') || '';
  return from.trim() || null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toPayload(message: CrmMessage, fromEmail: string) {
  return {
    from: fromEmail,
    to: [message.to],
    subject: message.subject,
    html: message.html,
    text: message.text,
    headers: message.headers,
  };
}

async function sendOne(apiKey: string, fromEmail: string, message: CrmMessage): Promise<SendResult> {
  try {
    const response = await fetch(RESEND_SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(toPayload(message, fromEmail)),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { to: message.to, success: false, error: body.message || `HTTP ${response.status}` };
    }
    return { to: message.to, success: true };
  } catch (error) {
    return {
      to: message.to,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function sendAll(apiKey: string, fromEmail: string, messages: CrmMessage[]): Promise<SendResult[]> {
  const results: SendResult[] = [];

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE);
    try {
      const response = await fetch(RESEND_BATCH_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk.map((message) => toPayload(message, fromEmail))),
      });

      if (response.ok) {
        results.push(...chunk.map((message) => ({ to: message.to, success: true })));
      } else {
        // Batch calls fail whole — fall back to individual sends so one bad
        // address doesn't sink the other 49. 429s get a breather first.
        if (response.status === 429) await wait(1500);
        for (const message of chunk) {
          results.push(await sendOne(apiKey, fromEmail, message));
          await wait(550);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.push(...chunk.map((message) => ({ to: message.to, success: false, error: errorMessage })));
    }

    if (i + BATCH_SIZE < messages.length) await wait(600);
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!isInternalRequest(req)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const fromEmail = getFromEmail();
  const apiKey = (Deno.env.get('RESEND_API_KEY') ?? '').trim();

  if (body.action === 'config') {
    return json({
      configured: Boolean(fromEmail && apiKey),
      fromEmail: apiKey ? fromEmail : null,
    });
  }

  if (!fromEmail || !apiKey) {
    return json({ error: 'RESEND_API_KEY / FROM_EMAIL secrets are not set' }, 409);
  }

  const messages = Array.isArray(body.messages) ? (body.messages as CrmMessage[]) : [];
  if (messages.length === 0) {
    return json({ error: 'No messages provided' }, 400);
  }
  if (messages.length > MAX_MESSAGES) {
    return json({ error: `Too many messages (max ${MAX_MESSAGES} per call)` }, 400);
  }

  const results = await sendAll(apiKey, fromEmail, messages);
  const sent = results.filter((result) => result.success).length;
  console.log(`[crm-send] sent ${sent}/${messages.length} from ${fromEmail}`);

  return json({ results, sent, failed: messages.length - sent });
});
