// Gmail + Outlook email helpers for Nest V3.
// Uses token-broker.ts for all token management.

import {
  getGoogleAccessToken,
  getAllGoogleTokens,
  getMicrosoftAccessToken,
  type TokenResult,
  type TokenOptions,
} from './token-broker.ts';
import { getAdminClient } from './supabase.ts';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GRAPH_API = 'https://graph.microsoft.com/v1.0/me';
const DEFAULT_TZ = 'Australia/Melbourne';

// Test safety: only allow sends to this address, block writes from protected accounts
const TEST_SAFE_RECIPIENT = Deno.env.get('TEST_SAFE_RECIPIENT') ?? null;
const TEST_PROTECTED_ACCOUNTS = (Deno.env.get('TEST_PROTECTED_ACCOUNTS') ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

function enforceTestSafety(to: string[], fromAccount?: string): string | null {
  if (!TEST_SAFE_RECIPIENT) return null;
  const safeRecip = TEST_SAFE_RECIPIENT.toLowerCase();
  const unsafeRecipients = to.filter(r => r.toLowerCase() !== safeRecip);
  if (unsafeRecipients.length > 0) {
    return `TEST SAFETY: blocked send to ${unsafeRecipients.join(', ')} — only ${TEST_SAFE_RECIPIENT} is allowed during testing`;
  }
  if (fromAccount && TEST_PROTECTED_ACCOUNTS.includes(fromAccount.toLowerCase())) {
    return `TEST SAFETY: blocked write from protected account ${fromAccount}`;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════
// TOKEN RESOLUTION
// ══════════════════════════════════════════════════════════════

export interface ResolvedToken {
  accessToken: string;
  email: string;
  provider: 'google' | 'microsoft';
}

export type EmailSearchStatus = 'ok' | 'empty' | 'no_accounts' | 'provider_error';

export interface EmailSearchAccountError {
  account: string;
  provider: 'google' | 'microsoft';
  error: string;
}

export interface EmailSearchResultRow {
  message_id: string;
  thread_id: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  snippet: string;
  body_preview: string;
  has_attachments: boolean;
  account: string;
  provider: 'google' | 'microsoft';
  received_at?: string;
  received_at_ms?: number;
  is_important?: boolean;
  /** Present when provider exposes read state (Gmail UNREAD label, Outlook isRead). */
  is_unread?: boolean;
}

export interface EmailSearchResponse {
  results: EmailSearchResultRow[];
  count: number;
  status: EmailSearchStatus;
  message?: string;
  account_errors?: EmailSearchAccountError[];
  accounts_checked?: number;
}

export async function resolveToken(
  userId: string,
  accountEmail?: string,
): Promise<ResolvedToken> {
  if (accountEmail) {
    const provider = await detectProvider(userId, accountEmail);
    if (provider === 'microsoft') {
      const result = await getMicrosoftAccessToken(userId, { email: accountEmail });
      return { accessToken: result.accessToken, email: result.email, provider: 'microsoft' };
    }
    const result = await getGoogleAccessToken(userId, { email: accountEmail });
    return { accessToken: result.accessToken, email: result.email, provider: 'google' };
  }
  try {
    const result = await getGoogleAccessToken(userId);
    return { accessToken: result.accessToken, email: result.email, provider: 'google' };
  } catch {
    const result = await getMicrosoftAccessToken(userId);
    return { accessToken: result.accessToken, email: result.email, provider: 'microsoft' };
  }
}

async function detectProvider(
  userId: string,
  accountEmail: string,
): Promise<'google' | 'microsoft'> {
  const supabase = getAdminClient();

  const { data: msAcct } = await supabase
    .from('user_microsoft_accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('microsoft_email', accountEmail)
    .maybeSingle();

  if (msAcct) return 'microsoft';
  return 'google';
}

// ══════════════════════════════════════════════════════════════
// GMAIL — SEARCH / READ
// ══════════════════════════════════════════════════════════════

export async function listGmailMessages(
  accessToken: string,
  query: string,
  maxResults: number = 5,
): Promise<any[]> {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  const response = await fetch(
    `${GMAIL_API}/messages?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(`[gmail-helpers] listGmailMessages failed (${response.status}): ${detail.slice(0, 300)}`);
    return [];
  }
  const data = await response.json();
  return data.messages ?? [];
}

/** One page of Gmail list (newest first). Used for inbox-summary full-window fetch. */
async function listGmailMessageIdsPage(
  accessToken: string,
  query: string,
  maxResults: number,
  pageToken?: string,
): Promise<{ ids: string[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  if (pageToken) params.set('pageToken', pageToken);
  const response = await fetch(`${GMAIL_API}/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(`[gmail-helpers] listGmailMessageIdsPage failed (${response.status}): ${detail.slice(0, 200)}`);
    return { ids: [] };
  }
  const data = await response.json();
  const messages = data.messages ?? [];
  return {
    ids: messages.map((m: { id: string }) => m.id).filter(Boolean),
    nextPageToken: data.nextPageToken,
  };
}

/**
 * When users.history returns no `messageAdded` but the mailbox still advanced (Pub/Sub noise / API quirks),
 * list recent INBOX ids so webhook processing can still evaluate triggers. Results are arbitrary order;
 * callers should sort by internalDate after fetch.
 */
export async function listGmailInboxMessageIdsForWebhookFallback(
  accessToken: string,
  maxResults: number,
): Promise<string[]> {
  const out: string[] = [];
  let pageToken: string | undefined;
  const queries = ['in:inbox newer_than:14d', 'in:inbox'] as const;
  for (const q of queries) {
    while (out.length < maxResults) {
      const page = await listGmailMessageIdsPage(
        accessToken,
        q,
        Math.min(50, maxResults - out.length),
        pageToken,
      );
      out.push(...page.ids);
      if (!page.nextPageToken || page.ids.length === 0) break;
      pageToken = page.nextPageToken;
    }
    if (out.length > 0) break;
    pageToken = undefined;
  }
  return [...new Set(out)].slice(0, maxResults);
}

/**
 * Light Gmail fetch: snippet + headers + internalDate (cheaper than format=full).
 */
export async function getGmailMessageMetadata(
  accessToken: string,
  messageId: string,
): Promise<{
  messageId: string;
  threadId: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  snippet: string;
  internalDate: number;
  labelIds: string[];
  attachmentCount: number;
} | null> {
  const url =
    `${GMAIL_API}/messages/${encodeURIComponent(messageId)}?format=metadata` +
    '&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date';
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return null;
  const data = await response.json();
  const rawHeaders: Array<{ name: string; value: string }> = data.payload?.headers ?? [];
  const allHeaders: Record<string, string> = {};
  for (const h of rawHeaders) allHeaders[h.name] = h.value;
  const attachmentCount = countAttachments(data.payload);
  return {
    messageId: data.id ?? messageId,
    threadId: data.threadId ?? '',
    from: allHeaders['From'] ?? '',
    to: allHeaders['To'] ?? '',
    cc: allHeaders['Cc'] ?? '',
    subject: allHeaders['Subject'] ?? '',
    date: allHeaders['Date'] ?? '',
    snippet: data.snippet ?? '',
    internalDate: parseInt(data.internalDate ?? '0', 10),
    labelIds: data.labelIds ?? [],
    attachmentCount,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker(): Promise<void> {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

/**
 * Fetches every message in the user's mailbox (except spam/trash) from the last `hours` hours,
 * read and unread. Paginates provider APIs until the time window is exhausted or limits hit.
 * Uses metadata/light fetches for scale; intended for scheduled inbox summary automation.
 */
export async function fetchRecentMailboxWindow(
  userId: string,
  searchTz: string,
  hours: number,
  maxMessagesPerAccount = 350,
): Promise<EmailSearchResponse> {
  const accountErrors: EmailSearchAccountError[] = [];
  const cutoffMs = Date.now() - hours * 3600000;
  const gmailQuery = 'newer_than:1d -in:spam -in:trash';

  let googleAccounts: TokenResult[] = [];
  let msAccounts: TokenResult[] = [];
  try {
    [googleAccounts, msAccounts] = await Promise.all([
      getAllGoogleTokens(userId).catch((e) => {
        accountErrors.push({ account: 'google_accounts', provider: 'google', error: (e as Error).message });
        return [] as TokenResult[];
      }),
      getAllMicrosoftTokens(userId).catch((e) => {
        accountErrors.push({ account: 'microsoft_accounts', provider: 'microsoft', error: (e as Error).message });
        return [] as TokenResult[];
      }),
    ]);
  } catch (e) {
    accountErrors.push({ account: 'tokens', provider: 'google', error: (e as Error).message });
  }

  const allAccounts = googleAccounts.length + msAccounts.length;
  if (allAccounts === 0) {
    const status: EmailSearchStatus = accountErrors.length > 0 ? 'provider_error' : 'no_accounts';
    return {
      results: [],
      count: 0,
      status,
      message: status === 'no_accounts' ? 'No email accounts connected.' : 'Could not access email accounts.',
      account_errors: accountErrors.length ? accountErrors : undefined,
      accounts_checked: 0,
    };
  }

  const allRows: EmailSearchResultRow[] = [];

  const gParts = await Promise.all(
    googleAccounts.map(async (acct) => {
      const rows: EmailSearchResultRow[] = [];
      let pageToken: string | undefined;
      let idCount = 0;
      let stopPaging = false;
      let pageLoop = 0;

      while (!stopPaging && idCount < maxMessagesPerAccount && pageLoop < 50) {
        pageLoop++;
        const page = await listGmailMessageIdsPage(acct.accessToken, gmailQuery, 100, pageToken);
        if (!page.ids.length) break;

        const metas = await mapWithConcurrency(page.ids, 14, async (id) =>
          getGmailMessageMetadata(acct.accessToken, id)
        );

        let oldestInPage = Infinity;
        let parsedAnyDate = false;
        for (let i = 0; i < metas.length; i++) {
          const m = metas[i];
          if (!m || !m.internalDate) continue;
          const ms = m.internalDate;
          parsedAnyDate = true;
          oldestInPage = Math.min(oldestInPage, ms);
          if (ms < cutoffMs) continue;

          let dateLocal = m.date;
          let receivedAtMs: number | undefined = ms;
          try {
            const parsed = new Date(ms);
            if (!isNaN(parsed.getTime())) {
              receivedAtMs = parsed.getTime();
              dateLocal = parsed.toLocaleString('en-AU', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZone: searchTz,
              });
            }
          } catch { /* keep */ }

          rows.push({
            message_id: m.messageId,
            thread_id: m.threadId,
            from: m.from,
            to: m.to,
            cc: m.cc,
            subject: m.subject,
            date: dateLocal,
            snippet: m.snippet.slice(0, 280),
            body_preview: m.snippet.slice(0, 2000),
            has_attachments: m.attachmentCount > 0,
            account: acct.email,
            provider: 'google',
            received_at: receivedAtMs ? new Date(receivedAtMs).toISOString() : undefined,
            received_at_ms: receivedAtMs,
            is_important: m.labelIds.includes('IMPORTANT'),
            is_unread: m.labelIds.includes('UNREAD'),
          });
        }

        idCount += page.ids.length;
        if (!parsedAnyDate || oldestInPage === Infinity) stopPaging = true;
        else if (!page.nextPageToken || oldestInPage < cutoffMs) stopPaging = true;
        else pageToken = page.nextPageToken;

        if (idCount >= maxMessagesPerAccount) break;
      }

      return rows;
    }),
  );

  for (const r of gParts.flat()) allRows.push(r);

  const sinceIso = new Date(cutoffMs).toISOString();
  const msParts = await Promise.all(
    msAccounts.map(async (acct) => {
      try {
        return await searchOutlookMessagesSince(
          acct.accessToken,
          acct.email,
          sinceIso,
          maxMessagesPerAccount,
          searchTz,
        );
      } catch (e) {
        accountErrors.push({ account: acct.email, provider: 'microsoft', error: (e as Error).message });
        return [] as EmailSearchResultRow[];
      }
    }),
  );
  for (const r of msParts.flat()) allRows.push(r);

  allRows.sort((a, b) => (b.received_at_ms ?? 0) - (a.received_at_ms ?? 0));

  if (!allRows.length) {
    return {
      results: [],
      count: 0,
      status: accountErrors.length > 0 && !gParts.flat().length && !msParts.flat().length ? 'provider_error' : 'empty',
      message: 'No messages in this time window.',
      account_errors: accountErrors.length ? accountErrors : undefined,
      accounts_checked: allAccounts,
    };
  }

  return {
    results: allRows,
    count: allRows.length,
    status: 'ok',
    account_errors: accountErrors.length ? accountErrors : undefined,
    accounts_checked: allAccounts,
  };
}

/** Outlook: all messages since timestamp, following @odata.nextLink. */
async function searchOutlookMessagesSince(
  accessToken: string,
  accountEmail: string,
  sinceIso: string,
  maxTotal: number,
  tz: string,
): Promise<EmailSearchResultRow[]> {
  const filter = `receivedDateTime ge ${sinceIso}`;
  const select =
    'id,conversationId,from,toRecipients,ccRecipients,subject,receivedDateTime,bodyPreview,body,hasAttachments,importance,isRead';
  let url:
    | string
    | null = `${GRAPH_API}/messages?$filter=${encodeURIComponent(filter)}&$orderby=receivedDateTime desc&$top=50&$select=${select}`;

  const collected: any[] = [];
  while (url && collected.length < maxTotal) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resp.ok) {
      console.warn(`[gmail-helpers] outlook since-search failed (${resp.status}) for ${accountEmail}`);
      break;
    }
    const data = await resp.json();
    const batch = data.value ?? [];
    collected.push(...batch);
    const next = data['@odata.nextLink'] as string | undefined;
    url = next && collected.length < maxTotal ? next : null;
  }

  return formatOutlookMessages(collected.slice(0, maxTotal), accountEmail, tz);
}

export interface GmailMessageData {
  messageId: string;
  threadId: string;
  from: string;
  to: string;
  cc: string;
  replyTo: string;
  subject: string;
  date: string;
  snippet: string;
  bodyPreview: string;
  labelIds: string[];
  isImportant: boolean;
  isStarred: boolean;
  internalDate: number;
  attachmentCount: number;
  allHeaders: Record<string, string>;
}

export async function getGmailMessage(
  accessToken: string,
  messageId: string,
): Promise<GmailMessageData> {
  const url = `${GMAIL_API}/messages/${messageId}?format=full`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(`[gmail-helpers] getGmailMessage failed (${response.status}) for ${messageId}: ${detail.slice(0, 200)}`);
    return emptyGmailMessage(messageId);
  }

  const data = await response.json();

  const allHeaders: Record<string, string> = {};
  const rawHeaders: Array<{ name: string; value: string }> = data.payload?.headers ?? [];
  for (const h of rawHeaders) {
    allHeaders[h.name] = h.value;
  }

  const bodyText = extractPlainTextBody(data.payload);
  const attachmentCount = countAttachments(data.payload);
  const labelIds: string[] = data.labelIds ?? [];

  return {
    messageId: data.id ?? messageId,
    threadId: data.threadId ?? '',
    from: allHeaders['From'] ?? '',
    to: allHeaders['To'] ?? '',
    cc: allHeaders['Cc'] ?? '',
    replyTo: allHeaders['Reply-To'] ?? '',
    subject: allHeaders['Subject'] ?? '',
    date: allHeaders['Date'] ?? '',
    snippet: data.snippet ?? '',
    bodyPreview: bodyText ? bodyText.slice(0, 2000) : (data.snippet ?? ''),
    labelIds,
    isImportant: labelIds.includes('IMPORTANT'),
    isStarred: labelIds.includes('STARRED'),
    internalDate: parseInt(data.internalDate ?? '0', 10),
    attachmentCount,
    allHeaders,
  };
}

function emptyGmailMessage(messageId: string): GmailMessageData {
  return {
    messageId, threadId: '', from: '', to: '', cc: '', replyTo: '',
    subject: '', date: '', snippet: '', bodyPreview: '', labelIds: [],
    isImportant: false, isStarred: false, internalDate: 0, attachmentCount: 0,
    allHeaders: {},
  };
}

function extractPlainTextBody(payload: any): string | null {
  if (!payload) return null;

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    try {
      return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
    } catch {
      return null;
    }
  }

  for (const part of payload.parts ?? []) {
    const text = extractPlainTextBody(part);
    if (text) return text;
  }

  // HTML-only bodies: many marketing/bill emails omit text/plain; snippet can miss keywords from the subject.
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    try {
      const html = atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    } catch {
      return null;
    }
  }

  return null;
}

function countAttachments(payload: any): number {
  if (!payload) return 0;
  let count = 0;
  if (payload.filename && payload.filename.length > 0) count++;
  for (const part of payload.parts ?? []) {
    count += countAttachments(part);
  }
  return count;
}

function flattenParts(payload: any): any[] {
  if (!payload) return [];
  const result: any[] = [payload];
  for (const part of payload.parts ?? []) {
    result.push(...flattenParts(part));
  }
  return result;
}

function base64Decode(data: string): string {
  return atob(data.replace(/-/g, '+').replace(/_/g, '/'));
}

// ══════════════════════════════════════════════════════════════
// GMAIL — DRAFT / SEND
// ══════════════════════════════════════════════════════════════

export async function createGmailDraft(
  accessToken: string,
  to: string[],
  subject: string,
  body: string,
  cc?: string[],
  bcc?: string[],
): Promise<{ draftId: string; status: string }> {
  const raw = createRawEmail(to, subject, body, cc, bcc);

  const response = await fetch(`${GMAIL_API}/drafts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: { raw } }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gmail create draft failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const draft = await response.json();
  return { draftId: draft.id, status: 'draft_created' };
}

export async function createGmailReplyDraft(
  accessToken: string,
  threadId: string,
  body: string,
  _replyAll: boolean = false,
  to?: string[],
  subject?: string,
  cc?: string[],
): Promise<{ draftId: string; threadId: string; status: string }> {
  const raw = createRawReply(body, to, subject, cc);

  const response = await fetch(`${GMAIL_API}/drafts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: { threadId, raw } }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gmail reply draft failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const draft = await response.json();
  return { draftId: draft.id, threadId, status: 'reply_draft_created' };
}

export async function sendGmailDraft(
  accessToken: string,
  draftId: string,
): Promise<{ messageId: string; threadId: string; status: string }> {
  const response = await fetch(`${GMAIL_API}/drafts/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: draftId }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Send email failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const sent = await response.json();
  return {
    messageId: sent.message?.id ?? sent.id,
    threadId: sent.message?.threadId ?? sent.threadId ?? '',
    status: 'sent',
  };
}

// ══════════════════════════════════════════════════════════════
// OUTLOOK — GMAIL QUERY TRANSLATION
// ══════════════════════════════════════════════════════════════

interface OutlookQueryParts {
  search: string | null;
  filter: string | null;
  folder: 'inbox' | 'sentitems' | 'drafts' | 'deleteditems' | 'junkemail' | null;
}

function gmailQueryToOutlook(gmailQuery: string): OutlookQueryParts {
  let remaining = gmailQuery;
  const filters: string[] = [];
  let folder: OutlookQueryParts['folder'] = null;

  const folderMatch = remaining.match(/\bin:(anywhere|inbox|sent|drafts|trash|spam)\b/i);
  if (folderMatch) {
    const rawFolder = folderMatch[1].toLowerCase();
    folder = rawFolder === 'anywhere'
      ? null
      : rawFolder === 'sent'
      ? 'sentitems'
      : rawFolder === 'trash'
      ? 'deleteditems'
      : rawFolder === 'spam'
      ? 'junkemail'
      : rawFolder === 'drafts'
      ? 'drafts'
      : 'inbox';
    remaining = remaining.replace(folderMatch[0], '');
  }

  const newerMatch = remaining.match(/newer_than:(\d+)([dhm])/i);
  if (newerMatch) {
    const val = parseInt(newerMatch[1], 10);
    const unit = newerMatch[2].toLowerCase();
    const ms = unit === 'd' ? val * 86400000 : unit === 'h' ? val * 3600000 : val * 60000;
    const since = new Date(Date.now() - ms).toISOString();
    filters.push(`receivedDateTime ge ${since}`);
    remaining = remaining.replace(newerMatch[0], '');
  }

  const olderMatch = remaining.match(/older_than:(\d+)([dhm])/i);
  if (olderMatch) {
    const val = parseInt(olderMatch[1], 10);
    const unit = olderMatch[2].toLowerCase();
    const ms = unit === 'd' ? val * 86400000 : unit === 'h' ? val * 3600000 : val * 60000;
    const before = new Date(Date.now() - ms).toISOString();
    filters.push(`receivedDateTime le ${before}`);
    remaining = remaining.replace(olderMatch[0], '');
  }

  const fromMatch = remaining.match(/from:(\S+)/i);
  if (fromMatch) {
    filters.push(`from/emailAddress/address eq '${fromMatch[1].replace(/'/g, "''")}'`);
    remaining = remaining.replace(fromMatch[0], '');
  }

  const unreadMatch = remaining.match(/is:unread/i);
  if (unreadMatch) {
    filters.push('isRead eq false');
    remaining = remaining.replace(unreadMatch[0], '');
  }

  const readMatch = remaining.match(/is:read/i);
  if (readMatch) {
    filters.push('isRead eq true');
    remaining = remaining.replace(readMatch[0], '');
  }

  const importantMatch = remaining.match(/is:important/i);
  if (importantMatch) {
    filters.push("importance eq 'high'");
    remaining = remaining.replace(importantMatch[0], '');
  }

  const attachMatch = remaining.match(/has:attachment/i);
  if (attachMatch) {
    filters.push('hasAttachments eq true');
    remaining = remaining.replace(attachMatch[0], '');
  }

  remaining = remaining.replace(/\b(label:\S+|is:starred)\b/gi, '');

  const subjectMatch = remaining.match(/subject:(?:"([^"]+)"|(\S+))/i);
  let searchText = '';
  if (subjectMatch) {
    searchText = subjectMatch[1] || subjectMatch[2];
    remaining = remaining.replace(subjectMatch[0], '');
  }

  const leftover = remaining.replace(/[()]/g, '').trim();
  if (leftover && !searchText) {
    searchText = leftover;
  } else if (leftover && searchText) {
    searchText = `${searchText} ${leftover}`;
  }

  return {
    search: searchText.trim() || null,
    filter: filters.length > 0 ? filters.join(' and ') : null,
    folder,
  };
}

// ══════════════════════════════════════════════════════════════
// OUTLOOK — SEARCH / READ
// ══════════════════════════════════════════════════════════════

export async function searchOutlookMessages(
  accessToken: string,
  accountEmail: string,
  query: string,
  maxResults: number,
  tz: string,
): Promise<EmailSearchResultRow[]> {
  const translated = gmailQueryToOutlook(query);
  console.log(`[gmail-helpers] outlook query translation: "${query}" → search=${translated.search}, filter=${translated.filter}`);
  const basePath = translated.folder
    ? `${GRAPH_API}/mailFolders/${translated.folder}/messages`
    : `${GRAPH_API}/messages`;

  const params = new URLSearchParams({
    $top: String(maxResults),
    $select: 'id,conversationId,from,toRecipients,ccRecipients,subject,receivedDateTime,bodyPreview,body,hasAttachments,importance,isRead',
  });

  if (translated.search) {
    params.set('$search', `"${translated.search}"`);
  }
  if (translated.filter) {
    params.set('$filter', translated.filter);
  }
  if (!translated.search) {
    params.set('$orderby', 'receivedDateTime desc');
  }

  const resp = await fetch(
    `${basePath}?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    console.warn(`[gmail-helpers] outlook search failed for ${accountEmail} (${resp.status}): ${detail.slice(0, 200)}`);
    if (translated.filter && !translated.search) {
      console.log(`[gmail-helpers] retrying outlook search without filter, using simple list`);
      const fallbackParams = new URLSearchParams({
        $top: String(maxResults),
        $orderby: 'receivedDateTime desc',
        $select: 'id,conversationId,from,toRecipients,ccRecipients,subject,receivedDateTime,bodyPreview,body,hasAttachments,importance,isRead',
      });
      const fallbackResp = await fetch(
        `${basePath}?${fallbackParams}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!fallbackResp.ok) return [];
      const fallbackData = await fallbackResp.json();
      return formatOutlookMessages(fallbackData.value ?? [], accountEmail, tz);
    }
    return [];
  }

  const data = await resp.json();
  return formatOutlookMessages(data.value ?? [], accountEmail, tz);
}

function formatOutlookMessages(messages: any[], accountEmail: string, tz: string): EmailSearchResultRow[] {
  return messages.map((m: any) => {
    let dateLocal = m.receivedDateTime ?? '';
    let receivedAtMs: number | undefined;
    try {
      const parsed = new Date(m.receivedDateTime);
      if (!isNaN(parsed.getTime())) {
        receivedAtMs = parsed.getTime();
        dateLocal = parsed.toLocaleString('en-AU', {
          weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true,
          timeZone: tz,
        });
      }
    } catch { /* keep raw */ }

    const toAddrs = (m.toRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean).join(', ');
    const ccAddrs = (m.ccRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean).join(', ');

    return {
      message_id: m.id,
      thread_id: m.conversationId ?? m.id,
      from: m.from?.emailAddress ? `${m.from.emailAddress.name ?? ''} <${m.from.emailAddress.address}>` : '',
      to: toAddrs,
      cc: ccAddrs,
      subject: m.subject ?? '',
      date: dateLocal,
      snippet: (m.bodyPreview ?? '').slice(0, 200),
      body_preview: (m.bodyPreview ?? '').slice(0, 2000),
      has_attachments: !!m.hasAttachments,
      account: accountEmail,
      provider: 'microsoft',
      received_at: typeof m.receivedDateTime === 'string' ? m.receivedDateTime : undefined,
      received_at_ms: receivedAtMs,
      is_important: String(m.importance ?? '').toLowerCase() === 'high',
      is_unread: m.isRead === false,
    };
  });
}

export async function getOutlookEmail(
  accessToken: string,
  messageId: string,
  tz: string,
): Promise<unknown> {
  const resp = await fetch(
    `${GRAPH_API}/messages/${encodeURIComponent(messageId)}?$select=id,conversationId,from,toRecipients,ccRecipients,subject,receivedDateTime,body,hasAttachments,attachments`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`Get Outlook email failed (${resp.status})`);

  const m = await resp.json();

  let body = '';
  if (m.body?.contentType === 'text') {
    body = m.body.content ?? '';
  } else if (m.body?.content) {
    body = m.body.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  let dateLocal = m.receivedDateTime ?? '';
  try {
    const parsed = new Date(m.receivedDateTime);
    if (!isNaN(parsed.getTime())) {
      dateLocal = parsed.toLocaleString('en-AU', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
        timeZone: tz,
      });
    }
  } catch { /* keep raw */ }

  const toAddrs = (m.toRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean).join(', ');
  const ccAddrs = (m.ccRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean).join(', ');

  const attachments = (m.attachments ?? [])
    .filter((a: any) => a.name)
    .map((a: any) => ({ filename: a.name, mime_type: a.contentType, size: a.size }));

  return {
    message_id: m.id,
    thread_id: m.conversationId ?? m.id,
    from: m.from?.emailAddress ? `${m.from.emailAddress.name ?? ''} <${m.from.emailAddress.address}>` : '',
    to: toAddrs,
    cc: ccAddrs,
    subject: m.subject ?? '',
    date: dateLocal,
    body,
    attachments,
    labels: [],
    provider: 'microsoft',
  };
}

// ══════════════════════════════════════════════════════════════
// OUTLOOK — DRAFT / SEND
// ══════════════════════════════════════════════════════════════

export async function createOutlookDraft(
  accessToken: string,
  acctEmail: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const toList = Array.isArray(args.to) ? args.to : [args.to as string];
  const ccList = args.cc ? (Array.isArray(args.cc) ? args.cc : [args.cc as string]) : [];

  const bodyStr = (args.body as string) ?? '';
  const htmlBody = bodyStr.includes('<br') || bodyStr.includes('<p')
    ? bodyStr
    : bodyStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>\n');

  const message: Record<string, unknown> = {
    subject: args.subject,
    body: { contentType: 'html', content: htmlBody },
    toRecipients: toList.map((email: string) => ({ emailAddress: { address: email } })),
  };
  if (ccList.length) {
    message.ccRecipients = ccList.map((email: string) => ({ emailAddress: { address: email } }));
  }

  if (args.reply_to_thread_id) {
    const replyResp = await fetch(
      `${GRAPH_API}/messages/${encodeURIComponent(args.reply_to_thread_id as string)}/createReply`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: '' }),
      },
    );
    if (replyResp.ok) {
      const replyDraft = await replyResp.json();
      await fetch(
        `${GRAPH_API}/messages/${encodeURIComponent(replyDraft.id)}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: { contentType: 'html', content: htmlBody } }),
        },
      );
      return {
        draft_id: replyDraft.id,
        status: 'draft_created',
        to: args.to, subject: args.subject,
        is_reply: true,
        reply_all: !!args.reply_all,
        account: acctEmail,
        provider: 'microsoft',
        _confirmation: 'Email draft created successfully. Show the draft to the user and ask for confirmation before sending.',
      };
    }
  }

  const resp = await fetch(
    `${GRAPH_API}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    },
  );
  if (!resp.ok) throw new Error(`Outlook create draft failed (${resp.status})`);

  const draft = await resp.json();
  return {
    draft_id: draft.id,
    status: 'draft_created',
    to: args.to, subject: args.subject,
    is_reply: false,
    reply_all: false,
    account: acctEmail,
    provider: 'microsoft',
    _confirmation: 'Email draft created successfully. Show the draft to the user and ask for confirmation before sending.',
  };
}

export async function sendOutlookMessage(
  accessToken: string,
  draftId: string,
): Promise<{ messageId: string; status: string }> {
  const resp = await fetch(
    `${GRAPH_API}/messages/${encodeURIComponent(draftId)}/send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!resp.ok && resp.status !== 202) {
    const detail = await resp.text();
    throw new Error(`Outlook send email failed (${resp.status}): ${detail.slice(0, 200)}`);
  }
  return { messageId: draftId, status: 'sent' };
}

// ══════════════════════════════════════════════════════════════
// SENDER-FROM-HISTORY RESOLUTION
// ══════════════════════════════════════════════════════════════

export interface SenderHistoryMatch {
  account: string;
  provider: 'google' | 'microsoft';
  lastSentAt: number; // epoch ms; 0 if unknown
  source: 'history' | 'sole_account' | 'primary_fallback';
}

/**
 * Pick the account that should send a new email by inspecting the sent
 * history of every connected mailbox for the given recipients. The most
 * recent prior send to any recipient wins. If no prior history is found
 * (or only one account is connected), falls back to the user's primary
 * account so the caller always gets a concrete `From:` to surface.
 *
 * Used by email_draft so the draft preview shown to the user pins down
 * exactly which mailbox will send the message — required for trust.
 */
export async function findAccountForRecipients(
  userId: string,
  recipients: string[],
): Promise<SenderHistoryMatch | null> {
  const lowerRecipients = recipients
    .map((r) => (typeof r === 'string' ? r.trim().toLowerCase() : ''))
    .filter((r) => r.includes('@'));
  if (lowerRecipients.length === 0) return null;

  let googleAccts: TokenResult[] = [];
  let msAccts: TokenResult[] = [];
  try {
    [googleAccts, msAccts] = await Promise.all([
      getAllGoogleTokens(userId).catch(() => [] as TokenResult[]),
      getAllMicrosoftTokens(userId).catch(() => [] as TokenResult[]),
    ]);
  } catch (err) {
    console.warn(`[gmail-helpers] findAccountForRecipients: token fetch failed: ${(err as Error).message}`);
    return null;
  }

  const totalAccounts = googleAccts.length + msAccts.length;
  if (totalAccounts === 0) return null;

  if (totalAccounts === 1) {
    const sole = googleAccts[0]
      ? { account: googleAccts[0].email, provider: 'google' as const }
      : { account: msAccts[0].email, provider: 'microsoft' as const };
    return { ...sole, lastSentAt: 0, source: 'sole_account' };
  }

  const googleQuery = `(${lowerRecipients.map((r) => `to:${r}`).join(' OR ')}) in:sent`;
  const googleMatches = await Promise.all(
    googleAccts.map(async (acct): Promise<SenderHistoryMatch | null> => {
      try {
        const ids = await listGmailMessages(acct.accessToken, googleQuery, 1);
        if (!ids.length) return null;
        const meta = await getGmailMessageMetadata(acct.accessToken, ids[0].id);
        return {
          account: acct.email,
          provider: 'google',
          lastSentAt: meta?.internalDate ?? 0,
          source: 'history',
        };
      } catch (err) {
        console.warn(`[gmail-helpers] findAccountForRecipients: gmail probe failed for ${acct.email}: ${(err as Error).message}`);
        return null;
      }
    }),
  );

  const msFilter = lowerRecipients
    .map((r) => `toRecipients/any(t:t/emailAddress/address eq '${r.replace(/'/g, "''")}')`)
    .join(' or ');
  const msMatches = await Promise.all(
    msAccts.map(async (acct): Promise<SenderHistoryMatch | null> => {
      try {
        const url = `${GRAPH_API}/mailFolders/sentitems/messages?$filter=${encodeURIComponent(msFilter)}&$orderby=sentDateTime desc&$top=1&$select=id,sentDateTime`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${acct.accessToken}` } });
        if (!resp.ok) return null;
        const data = await resp.json();
        const top = data.value?.[0];
        if (!top) return null;
        const ts = top.sentDateTime ? new Date(top.sentDateTime).getTime() : 0;
        return {
          account: acct.email,
          provider: 'microsoft',
          lastSentAt: ts,
          source: 'history',
        };
      } catch (err) {
        console.warn(`[gmail-helpers] findAccountForRecipients: outlook probe failed for ${acct.email}: ${(err as Error).message}`);
        return null;
      }
    }),
  );

  const all = [...googleMatches, ...msMatches].filter(
    (m): m is SenderHistoryMatch => m !== null,
  );

  if (all.length > 0) {
    all.sort((a, b) => b.lastSentAt - a.lastSentAt);
    return all[0];
  }

  // No history match. Fall back to primary account so caller always has a concrete From.
  try {
    const primaryGoogle = await getGoogleAccessToken(userId).catch(() => null);
    if (primaryGoogle) {
      return { account: primaryGoogle.email, provider: 'google', lastSentAt: 0, source: 'primary_fallback' };
    }
    const primaryMs = await getMicrosoftAccessToken(userId).catch(() => null);
    if (primaryMs) {
      return { account: primaryMs.email, provider: 'microsoft', lastSentAt: 0, source: 'primary_fallback' };
    }
  } catch (err) {
    console.warn(`[gmail-helpers] findAccountForRecipients: primary fallback failed: ${(err as Error).message}`);
  }

  // Last resort: just return the first known account in deterministic order.
  if (googleAccts[0]) {
    return { account: googleAccts[0].email, provider: 'google', lastSentAt: 0, source: 'primary_fallback' };
  }
  if (msAccts[0]) {
    return { account: msAccts[0].email, provider: 'microsoft', lastSentAt: 0, source: 'primary_fallback' };
  }

  return null;
}

// ══════════════════════════════════════════════════════════════
// POST-SEND VERIFICATION
// ══════════════════════════════════════════════════════════════

export interface SendVerification {
  verified: boolean;
  messageId: string;
  reason?: string;
}

export async function verifyGmailMessageSent(
  accessToken: string,
  messageId: string,
): Promise<SendVerification> {
  try {
    const resp = await fetch(
      `${GMAIL_API}/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=To`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!resp.ok) {
      return { verified: false, messageId, reason: `message lookup failed (${resp.status})` };
    }

    const data = await resp.json();
    const labels: string[] = data.labelIds ?? [];

    if (labels.includes('SENT')) {
      return { verified: true, messageId };
    }

    return { verified: false, messageId, reason: `missing SENT label (labels: ${labels.join(',')})` };
  } catch (err) {
    return { verified: false, messageId, reason: `verification error: ${(err as Error).message}` };
  }
}

export async function verifyOutlookMessageSent(
  accessToken: string,
  messageId: string,
): Promise<SendVerification> {
  try {
    const resp = await fetch(
      `${GRAPH_API}/mailFolders/sentitems/messages?$filter=id eq '${messageId}'&$select=id&$top=1`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (resp.ok) {
      const data = await resp.json();
      if (data.value?.length > 0) {
        return { verified: true, messageId };
      }
    }

    await new Promise(r => setTimeout(r, 1500));

    const retry = await fetch(
      `${GRAPH_API}/mailFolders/sentitems/messages?$filter=id eq '${messageId}'&$select=id&$top=1`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!retry.ok) {
      return { verified: false, messageId, reason: `sent folder lookup failed (${retry.status})` };
    }

    const retryData = await retry.json();
    if (retryData.value?.length > 0) {
      return { verified: true, messageId };
    }

    return { verified: false, messageId, reason: 'message not found in sent folder after retry' };
  } catch (err) {
    return { verified: false, messageId, reason: `verification error: ${(err as Error).message}` };
  }
}

// Verify with backoff. Keeps polling the provider's sent index until the
// message shows up — search and sync can lag a few seconds. Never calls
// send again (the caller already has a messageId from the send API, so
// the send happened); this only hardens verification, not the send.
//
// We poll aggressively (up to ~14s total over 7 attempts) because the user
// must NEVER be told an email was sent until we have first-party proof
// the message landed in the SENT label / sentitems folder.
export async function verifyEmailSentWithRetry(
  accessToken: string,
  messageId: string,
  provider: 'google' | 'microsoft',
): Promise<SendVerification> {
  const delaysMs = [0, 600, 1200, 2000, 2500, 3500, 4500];
  let last: SendVerification | null = null;
  for (let i = 0; i < delaysMs.length; i++) {
    if (delaysMs[i] > 0) await new Promise((r) => setTimeout(r, delaysMs[i]));
    last = provider === 'microsoft'
      ? await verifyOutlookMessageSent(accessToken, messageId)
      : await verifyGmailMessageSent(accessToken, messageId);
    if (last.verified) {
      if (i > 0) {
        console.log(`[email-verify] verified on attempt ${i + 1}/${delaysMs.length} for ${messageId}`);
      }
      return last;
    }
  }
  console.warn(`[email-verify] all ${delaysMs.length} attempts failed for ${messageId}: ${last?.reason ?? 'unknown'}`);
  return last ?? { verified: false, messageId, reason: 'no verification attempted' };
}

// ══════════════════════════════════════════════════════════════
// HIGH-LEVEL TOOL IMPLEMENTATIONS
// ══════════════════════════════════════════════════════════════

export async function gmailSearchTool(
  userId: string,
  args: Record<string, unknown>,
): Promise<EmailSearchResponse> {
  const maxResults = Math.min((args.max_results as number) ?? 10, 20);
  const searchTz = (args.time_zone as string) ?? DEFAULT_TZ;
  const targetAccount = (args.account as string)?.toLowerCase() ?? null;
  const accountErrors: EmailSearchAccountError[] = [];

  let googleAccounts: TokenResult[] = [];
  let msAccounts: TokenResult[] = [];

  if (targetAccount) {
    const provider = await detectProvider(userId, targetAccount);
    if (provider === 'microsoft') {
      try {
        msAccounts = [await getMicrosoftAccessToken(userId, { email: targetAccount })];
      } catch (e) {
        const errorMessage = (e as Error).message;
        console.error(`[gmail-helpers] Microsoft token failed for ${targetAccount}: ${errorMessage}`);
        accountErrors.push({ account: targetAccount, provider: 'microsoft', error: errorMessage });
      }
    } else {
      try {
        googleAccounts = [await getGoogleAccessToken(userId, { email: targetAccount })];
      } catch (e) {
        const errorMessage = (e as Error).message;
        console.error(`[gmail-helpers] Google token failed for ${targetAccount}: ${errorMessage}`);
        accountErrors.push({ account: targetAccount, provider: 'google', error: errorMessage });
      }
    }
  } else {
    [googleAccounts, msAccounts] = await Promise.all([
      getAllGoogleTokens(userId).catch((e) => {
        const errorMessage = (e as Error).message;
        console.error(`[gmail-helpers] getAllGoogleTokens failed: ${errorMessage}`);
        accountErrors.push({ account: 'google_accounts', provider: 'google', error: errorMessage });
        return [] as TokenResult[];
      }),
      getAllMicrosoftTokens(userId).catch((e) => {
        const errorMessage = (e as Error).message;
        console.error(`[gmail-helpers] getAllMicrosoftTokens failed: ${errorMessage}`);
        accountErrors.push({ account: 'microsoft_accounts', provider: 'microsoft', error: errorMessage });
        return [] as TokenResult[];
      }),
    ]);
  }

  const allAccounts = googleAccounts.length + msAccounts.length;
  const perAccountMax = Math.max(Math.ceil(maxResults / Math.max(allAccounts, 1)), 5);

  const googleResults = Promise.all(
    googleAccounts.map(async (acct) => {
      try {
        const messages = await listGmailMessages(acct.accessToken, args.query as string, perAccountMax);
        if (!messages.length) return [];
        const details = await Promise.all(
          messages.map((m: any) => getGmailMessage(acct.accessToken, m.id)),
        );
        return details.map((d) => {
          let dateLocal = d.date;
          let receivedAtMs: number | undefined;
          try {
            const parsed = d.internalDate ? new Date(d.internalDate) : new Date(d.date);
            if (!isNaN(parsed.getTime())) {
              receivedAtMs = parsed.getTime();
              dateLocal = parsed.toLocaleString('en-AU', {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                hour: 'numeric', minute: '2-digit', hour12: true,
                timeZone: searchTz,
              });
            }
          } catch { /* keep raw date */ }
          return {
            message_id: d.messageId, thread_id: d.threadId,
            from: d.from, to: d.to, cc: d.cc,
            subject: d.subject, date: dateLocal, snippet: d.snippet,
            body_preview: d.bodyPreview,
            has_attachments: (d.attachmentCount ?? 0) > 0,
            account: acct.email,
            provider: 'google' as const,
            received_at: receivedAtMs ? new Date(receivedAtMs).toISOString() : undefined,
            received_at_ms: receivedAtMs,
            is_important: d.isImportant,
            is_unread: d.labelIds.includes('UNREAD'),
          };
        });
      } catch (e) {
        const errorMessage = (e as Error).message;
        console.warn(`[gmail-helpers] gmail_search error for ${acct.email}: ${errorMessage}`);
        accountErrors.push({ account: acct.email, provider: 'google', error: errorMessage });
        return [];
      }
    }),
  );

  const msResults = Promise.all(
    msAccounts.map(async (acct) => {
      try {
        return await searchOutlookMessages(acct.accessToken, acct.email, args.query as string, perAccountMax, searchTz);
      } catch (e) {
        const errorMessage = (e as Error).message;
        console.warn(`[gmail-helpers] outlook search error for ${acct.email}: ${errorMessage}`);
        accountErrors.push({ account: acct.email, provider: 'microsoft', error: errorMessage });
        return [];
      }
    }),
  );

  const [gResults, mResults] = await Promise.all([googleResults, msResults]);

  const allResults = [...gResults.flat(), ...mResults.flat()]
    .sort((a, b) => {
      const da = a.received_at_ms ?? 0;
      const db = b.received_at_ms ?? 0;
      return db - da;
    })
    .slice(0, maxResults);

  if (!allResults.length) {
    if (allAccounts === 0) {
      const status: EmailSearchStatus = accountErrors.length > 0 ? 'provider_error' : 'no_accounts';
      return {
        results: [],
        count: 0,
        status,
        message: status === 'no_accounts'
          ? 'No email accounts connected. The user may need to reconnect their email via the onboarding link.'
          : 'Could not access the connected email accounts just now.',
        account_errors: accountErrors.length ? accountErrors : undefined,
        accounts_checked: allAccounts,
      };
    }
    const status: EmailSearchStatus = accountErrors.length > 0 ? 'provider_error' : 'empty';
    return {
      results: [],
      count: 0,
      status,
      message: status === 'empty'
        ? 'No emails found matching that query.'
        : 'Could not get a complete email result set for that query.',
      account_errors: accountErrors.length ? accountErrors : undefined,
      accounts_checked: allAccounts,
    };
  }

  return {
    results: allResults,
    count: allResults.length,
    status: 'ok',
    account_errors: accountErrors.length ? accountErrors : undefined,
    accounts_checked: allAccounts,
  };
}

export async function getEmailTool(
  userId: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const messageId = args.message_id as string;
  if (!messageId) return { error: 'message_id is required' };

  const { accessToken, provider } = await resolveToken(userId, args.account as string | undefined);
  const emailTz = (args.time_zone as string) ?? DEFAULT_TZ;

  if (provider === 'microsoft') {
    return getOutlookEmail(accessToken, messageId, emailTz);
  }

  const resp = await fetch(
    `${GMAIL_API}/messages/${encodeURIComponent(messageId)}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`Get email failed (${resp.status})`);

  const msg = await resp.json();
  const headers = msg.payload?.headers ?? [];
  const getHeader = (name: string) =>
    headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

  let body = '';
  const parts = flattenParts(msg.payload);

  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      body = base64Decode(part.body.data);
      break;
    }
  }
  if (!body) {
    for (const part of parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        body = base64Decode(part.body.data).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        break;
      }
    }
  }
  if (!body && msg.payload?.body?.data) {
    body = base64Decode(msg.payload.body.data);
  }

  const attachments = parts
    .filter((p: any) => p.filename && p.body?.attachmentId)
    .map((p: any) => ({ filename: p.filename, mime_type: p.mimeType, size: p.body.size }));

  let dateLocal = getHeader('Date') ?? '';
  try {
    const internalMs = parseInt(msg.internalDate ?? '0', 10);
    const parsed = internalMs ? new Date(internalMs) : new Date(dateLocal);
    if (!isNaN(parsed.getTime())) {
      dateLocal = parsed.toLocaleString('en-AU', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
        timeZone: emailTz,
      });
    }
  } catch { /* keep raw */ }

  return {
    message_id: msg.id, thread_id: msg.threadId,
    from: getHeader('From'), to: getHeader('To'), cc: getHeader('Cc'),
    subject: getHeader('Subject'), date: dateLocal,
    body, attachments, labels: msg.labelIds ?? [],
  };
}

export async function sendDraftTool(
  userId: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const toRaw = Array.isArray(args.to) ? args.to : [args.to as string];
  const invalidRecipients = toRaw.filter((r: string) => !r?.includes('@'));
  if (invalidRecipients.length > 0) {
    return {
      error: `Invalid recipient(s): ${invalidRecipients.join(', ')}. Each must be a valid email address.`,
    };
  }

  const { accessToken, email: acctEmail, provider } = await resolveToken(userId, args.account as string | undefined);

  const safetyBlock = enforceTestSafety(toRaw as string[], acctEmail);
  if (safetyBlock) {
    console.warn(`[gmail-helpers] ${safetyBlock}`);
    return { error: safetyBlock };
  }

  if (provider === 'microsoft') {
    return createOutlookDraft(accessToken, acctEmail, args);
  }

  const toList = Array.isArray(args.to) ? args.to as string[] : [args.to as string];
  const ccList = args.cc ? (Array.isArray(args.cc) ? args.cc as string[] : [args.cc as string]) : undefined;

  let result: any;
  if (args.reply_to_thread_id) {
    try {
      result = await createGmailReplyDraft(
        accessToken,
        args.reply_to_thread_id as string,
        args.body as string,
        (args.reply_all as boolean) ?? false,
        toList,
        args.subject as string | undefined,
        ccList,
      );
    } catch (e) {
      const msg = (e as Error).message ?? '';
      if (msg.includes('Requested entity was not found') || msg.includes('404')) {
        console.warn('[gmail-helpers] send_draft: reply thread not found, falling back to new draft');
        result = await createGmailDraft(
          accessToken,
          toList,
          args.subject as string,
          args.body as string,
          ccList,
          args.bcc ? (Array.isArray(args.bcc) ? args.bcc : [args.bcc as string]) : undefined,
        );
      } else {
        throw e;
      }
    }
  } else {
    result = await createGmailDraft(
      accessToken,
      toList,
      args.subject as string,
      args.body as string,
      ccList,
      args.bcc ? (Array.isArray(args.bcc) ? args.bcc : [args.bcc as string]) : undefined,
    );
  }

  return {
    draft_id: result.draftId ?? result.id,
    status: 'draft_created',
    to: args.to, subject: args.subject,
    is_reply: !!args.reply_to_thread_id,
    reply_all: !!args.reply_all,
    account: acctEmail,
    _confirmation: 'Email draft created successfully. Show the draft to the user and ask for confirmation before sending.',
  };
}

export async function sendEmailTool(
  userId: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { accessToken, provider } = await resolveToken(userId, args.account as string | undefined);
  const draftId = args.draft_id as string;

  if (TEST_PROTECTED_ACCOUNTS.length > 0 && args.account) {
    const acct = String(args.account).toLowerCase();
    if (TEST_PROTECTED_ACCOUNTS.includes(acct)) {
      const msg = `TEST SAFETY: blocked email_send from protected account ${acct}`;
      console.warn(`[gmail-helpers] ${msg}`);
      return { error: msg };
    }
  }

  if (!draftId) {
    throw new Error('draft_id is required. Create a draft with send_draft first.');
  }

  if (provider === 'microsoft') {
    const result = await sendOutlookMessage(accessToken, draftId);
    return {
      status: 'sent',
      message_id: result.messageId,
      provider: 'microsoft',
      _confirmation: 'Email sent successfully. Confirm this to the user.',
    };
  }

  const result = await sendGmailDraft(accessToken, draftId);
  return {
    status: 'sent',
    message_id: result.messageId,
    thread_id: result.threadId,
    _confirmation: 'Email sent successfully. Confirm this to the user.',
  };
}

// ══════════════════════════════════════════════════════════════
// MICROSOFT TOKEN HELPER (wraps token-broker for multi-account)
// ══════════════════════════════════════════════════════════════

async function getAllMicrosoftTokens(userId: string): Promise<TokenResult[]> {
  const supabase = getAdminClient();

  const { data: accounts, error } = await supabase
    .from('user_microsoft_accounts')
    .select('id, microsoft_email, refresh_token')
    .eq('user_id', userId);

  if (error || !accounts || accounts.length === 0) return [];

  const results: TokenResult[] = [];
  for (const acct of accounts) {
    try {
      const token = await getMicrosoftAccessToken(userId, { email: acct.microsoft_email });
      results.push(token);
    } catch (e) {
      console.warn(`[gmail-helpers] Microsoft token refresh failed for ${acct.microsoft_email}: ${(e as Error).message}`);
    }
  }
  return results;
}

// ══════════════════════════════════════════════════════════════
// RAW EMAIL ENCODING (RFC 2822)
// ══════════════════════════════════════════════════════════════

function plainTextToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>\n');
}

function createRawEmail(
  to: string[],
  subject: string,
  body: string,
  cc?: string[],
  bcc?: string[],
): string {
  const htmlBody = body.includes('<br') || body.includes('<p') || body.includes('<div')
    ? body
    : plainTextToHtml(body);

  const headers: string[] = [
    'MIME-Version: 1.0',
    `To: ${to.join(', ')}`,
  ];
  if (cc?.length) headers.push(`Cc: ${cc.join(', ')}`);
  if (bcc?.length) headers.push(`Bcc: ${bcc.join(', ')}`);
  headers.push(`Subject: ${encodeMimeHeader(subject)}`);
  headers.push('Content-Type: text/html; charset=utf-8');
  headers.push('Content-Transfer-Encoding: base64');
  headers.push('');

  const bodyBase64 = btoa(unescape(encodeURIComponent(htmlBody)));
  headers.push(bodyBase64);

  return base64UrlEncode(headers.join('\r\n'));
}

function createRawReply(
  body: string,
  to?: string[],
  subject?: string,
  cc?: string[],
): string {
  const htmlBody = body.includes('<br') || body.includes('<p') || body.includes('<div')
    ? body
    : plainTextToHtml(body);

  const headers: string[] = [
    'MIME-Version: 1.0',
  ];
  if (to?.length) headers.push(`To: ${to.join(', ')}`);
  if (cc?.length) headers.push(`Cc: ${cc.join(', ')}`);
  if (subject) headers.push(`Subject: ${encodeMimeHeader(subject)}`);
  headers.push('Content-Type: text/html; charset=utf-8');
  headers.push('Content-Transfer-Encoding: base64');
  headers.push('');

  const bodyBase64 = btoa(unescape(encodeURIComponent(htmlBody)));
  headers.push(bodyBase64);

  return base64UrlEncode(headers.join('\r\n'));
}

function encodeMimeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  const encoded = btoa(unescape(encodeURIComponent(value)));
  return `=?UTF-8?B?${encoded}?=`;
}

function base64UrlEncode(str: string): string {
  const encoded = btoa(unescape(encodeURIComponent(str)));
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
