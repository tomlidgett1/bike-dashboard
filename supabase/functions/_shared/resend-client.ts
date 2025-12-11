// ============================================================
// RESEND EMAIL CLIENT
// ============================================================
// Shared helper for sending emails via Resend API

const RESEND_API_URL = 'https://api.resend.com/emails';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

export interface EmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

export interface BatchEmailResult {
  success: boolean;
  sent: number;
  failed: number;
  results: EmailResult[];
}

/**
 * Get Resend configuration from environment
 */
function getConfig() {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('FROM_EMAIL') || 'Bike Marketplace <notifications@bikemarketplace.com.au>';
  const appUrl = Deno.env.get('APP_URL') || 'https://bikemarketplace.com.au';

  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }

  return { apiKey, fromEmail, appUrl };
}

/**
 * Send a single email via Resend
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  try {
    const { apiKey, fromEmail } = getConfig();

    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
        reply_to: options.replyTo,
        tags: options.tags,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.message || `HTTP ${response.status}: ${response.statusText}`;
      console.error('[Resend] Email send failed:', errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }

    const data = await response.json();
    console.log('[Resend] Email sent successfully:', data.id);
    
    return {
      success: true,
      id: data.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Resend] Unexpected error:', errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send multiple emails in batch
 */
export async function sendBatchEmails(emails: EmailOptions[]): Promise<BatchEmailResult> {
  const results: EmailResult[] = [];
  let sent = 0;
  let failed = 0;

  // Process emails sequentially to avoid rate limits
  for (const email of emails) {
    const result = await sendEmail(email);
    results.push(result);
    
    if (result.success) {
      sent++;
    } else {
      failed++;
    }

    // Small delay between emails to respect rate limits
    if (emails.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return {
    success: failed === 0,
    sent,
    failed,
    results,
  };
}

/**
 * Get the app URL for constructing links
 */
export function getAppUrl(): string {
  const { appUrl } = getConfig();
  return appUrl;
}

/**
 * Build a link to a conversation
 */
export function buildConversationLink(conversationId: string): string {
  return `${getAppUrl()}/messages?conversation=${conversationId}`;
}

/**
 * Build a link to an offer
 */
export function buildOfferLink(offerId: string): string {
  return `${getAppUrl()}/offers?id=${offerId}`;
}

/**
 * Build a link to a product
 */
export function buildProductLink(productId: string): string {
  return `${getAppUrl()}/marketplace/${productId}`;
}

/**
 * Build a link to notification settings
 */
export function buildSettingsLink(): string {
  return `${getAppUrl()}/settings/notifications`;
}

/**
 * Format currency for Australian dollars
 */
export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(amount);
}

/**
 * Format a date for display in emails
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

