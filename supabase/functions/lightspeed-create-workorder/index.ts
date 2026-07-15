import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getAdminClient } from '../_shared/supabase.ts';
import { authorizeInternalRequest } from '../_shared/internal-auth.ts';
import {
  buildAccountResourceUrl,
  ensureValidLightspeedAccessToken,
  lightspeedJsonRequest,
  parseBigIntLoose,
  type LightspeedPortalConnection,
} from '../_shared/lightspeed-client.ts';
import { normaliseToE164 } from '../_shared/phone-normalise.ts';
import { resolveLightspeedCustomerIdForBooking } from '../_shared/brand-lightspeed-workorders.ts';
import {
  buildLightspeedWorkorderPayload,
  extractWorkorderId,
  isFreshBookingConfirmation,
  type BookingCreateInput,
} from '../_shared/lightspeed-booking-create.ts';

const PROVIDER = 'lightspeed';
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-internal-secret, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type RequestBody = {
  brand_key?: unknown;
  chat_id?: unknown;
  customer_name?: unknown;
  customer_phone_e164?: unknown;
  bike?: unknown;
  comments?: unknown;
  drop_off_date?: unknown;
  drop_off_time?: unknown;
  default_note?: unknown;
  source_type?: unknown;
  dry_run?: unknown;
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
  });
}

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim().slice(0, max);
}

function optionalText(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function todayMelbourneYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function stableShortHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function parseRequest(body: RequestBody): BookingCreateInput {
  const brandKey = requiredText(body.brand_key, 'brand_key', 80);
  const customerPhone = normaliseToE164(
    requiredText(body.customer_phone_e164, 'customer_phone_e164', 40),
  );
  if (!customerPhone) throw new Error('customer_phone_e164 is invalid');

  const comments = requiredText(body.comments, 'comments', 400);
  const isHandoff = body.source_type === 'handoff';
  const dropOffDate = isHandoff
    ? optionalText(body.drop_off_date, 10) ?? todayMelbourneYmd()
    : requiredText(body.drop_off_date, 'drop_off_date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dropOffDate)) {
    throw new Error('drop_off_date must be YYYY-MM-DD');
  }
  const chatId = isHandoff
    ? optionalText(body.chat_id, 120) ??
      `handoff-${brandKey}-${todayMelbourneYmd()}-${stableShortHash(`${customerPhone}:${comments}`)}`
    : requiredText(body.chat_id, 'chat_id', 120);

  return {
    brandKey,
    chatId,
    customerName: optionalText(body.customer_name, 80) ?? 'Customer',
    customerPhoneE164: customerPhone,
    bike: optionalText(body.bike, 120),
    comments,
    dropOffDate,
    dropOffTime: optionalText(body.drop_off_time, 5),
    defaultNote: optionalText(body.default_note, 200) ?? 'Booked in over Nest',
  };
}

async function loadConnection(
  brandKey: string,
): Promise<LightspeedPortalConnection | null> {
  const { data, error } = await getAdminClient()
    .from('nest_brand_portal_connections')
    .select('brand_key, access_token, refresh_token, api_endpoint, access_expires_at')
    .eq('provider', PROVIDER)
    .eq('brand_key', brandKey)
    .maybeSingle();
  if (error) throw new Error(`Lightspeed connection load failed: ${error.message}`);
  return data as LightspeedPortalConnection | null;
}

async function resolveShopId(
  brandKey: string,
  accessToken: string,
  accountId: string,
): Promise<number | null> {
  const { data: mirrored } = await getAdminClient()
    .from('nest_brand_lightspeed_workorder')
    .select('shop_id')
    .eq('brand_key', brandKey)
    .not('shop_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const mirroredId = Number(mirrored?.shop_id);
  if (Number.isFinite(mirroredId) && mirroredId > 0) return Math.trunc(mirroredId);

  const url = buildAccountResourceUrl(accountId, 'Shop.json', {
    archived: 'false',
    limit: '20',
  });
  const response = await lightspeedJsonRequest(accessToken, url, {
    method: 'GET',
    max429Retries: 2,
  });
  const node = response.Shop;
  const shops = (Array.isArray(node) ? node : node ? [node] : [])
    .filter((value): value is Record<string, unknown> =>
      Boolean(value && typeof value === 'object'));
  for (const shop of shops) {
    const id = parseBigIntLoose(shop.shopID);
    if (id !== null && id > 0n) return Number(id);
  }
  return null;
}

async function findExistingWorkorder(
  accessToken: string,
  accountId: string,
  customerId: number,
  marker: string,
): Promise<number | null> {
  const url = buildAccountResourceUrl(accountId, 'Workorder.json', {
    customerID: String(customerId),
    sort: '-timeStamp',
    limit: '50',
  });
  const response = await lightspeedJsonRequest(accessToken, url, {
    method: 'GET',
    max429Retries: 2,
  });
  const node = response.Workorder;
  const rows = (Array.isArray(node) ? node : node ? [node] : [])
    .filter((value): value is Record<string, unknown> =>
      Boolean(value && typeof value === 'object'));
  for (const row of rows) {
    const note = `${String(row.note ?? '')}\n${String(row.internalNote ?? '')}`;
    if (!note.includes(marker)) continue;
    const id = parseBigIntLoose(row.workorderID);
    if (id !== null && id > 0n) return Number(id);
  }
  return null;
}

async function loadLatestCustomerMessage(chatId: string): Promise<string | null> {
  const { data, error } = await getAdminClient()
    .from('conversation_messages')
    .select('content')
    .eq('chat_id', chatId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not verify booking confirmation: ${error.message}`);
  return typeof data?.content === 'string' ? data.content : null;
}

async function claimBookingCommit(brandKey: string, chatId: string): Promise<boolean> {
  const { data, error } = await getAdminClient()
    .from('nest_brand_lightspeed_booking_state')
    .update({ status: 'creating', last_message_at: new Date().toISOString() })
    .eq('brand_key', brandKey)
    .eq('chat_id', chatId)
    .eq('status', 'awaiting_confirm')
    .select('chat_id');
  if (error) throw new Error(`Could not claim booking commit: ${error.message}`);
  return Array.isArray(data) && data.length === 1;
}

async function releaseBookingCommit(brandKey: string, chatId: string): Promise<void> {
  const { error } = await getAdminClient()
    .from('nest_brand_lightspeed_booking_state')
    .update({ status: 'awaiting_confirm', last_message_at: new Date().toISOString() })
    .eq('brand_key', brandKey)
    .eq('chat_id', chatId)
    .eq('status', 'creating');
  if (error) {
    console.error('[lightspeed-create-workorder] booking claim release failed:', error.message);
  }
}

async function markBookingCreated(
  brandKey: string,
  chatId: string,
  workorderId: number,
): Promise<void> {
  const { error } = await getAdminClient()
    .from('nest_brand_lightspeed_booking_state')
    .update({
      status: 'created',
      workorder_id: workorderId,
      last_message_at: new Date().toISOString(),
    })
    .eq('brand_key', brandKey)
    .eq('chat_id', chatId);
  if (error) {
    console.error('[lightspeed-create-workorder] booking state completion failed:', error.message);
  }
}

async function waitForConcurrentWorkorder(
  accessToken: string,
  accountId: string,
  customerId: number,
  marker: string,
): Promise<number | null> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    const workorderId = await findExistingWorkorder(
      accessToken,
      accountId,
      customerId,
      marker,
    );
    if (workorderId) return workorderId;
  }
  return null;
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  if (!authorizeInternalRequest(req)) return json({ ok: false, error: 'unauthorised' }, 401);

  let rawBody: RequestBody;
  let bookingClaimed = false;
  try {
    rawBody = await req.json() as RequestBody;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  let input: BookingCreateInput;
  try {
    input = parseRequest(rawBody);
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : 'invalid_request',
    }, 400);
  }

  try {
    const connection = await loadConnection(input.brandKey);
    if (!connection) {
      return json({ ok: false, error: 'Lightspeed is not connected for this brand' }, 409);
    }

    const auth = await ensureValidLightspeedAccessToken(getAdminClient(), connection);
    const customerId = await resolveLightspeedCustomerIdForBooking(
      getAdminClient(),
      input.brandKey,
      input.customerPhoneE164,
      auth,
    );
    if (!customerId) {
      return json({
        ok: false,
        error: 'No Lightspeed customer matched the sender phone number',
      }, 404);
    }

    const shopId = await resolveShopId(input.brandKey, auth.accessToken, auth.accountId);
    if (!shopId) {
      return json({ ok: false, error: 'Could not resolve a Lightspeed shop' }, 409);
    }

    const built = buildLightspeedWorkorderPayload(input, { customerId, shopId });
    const existingId = await findExistingWorkorder(
      auth.accessToken,
      auth.accountId,
      customerId,
      built.marker,
    );
    if (existingId) {
      if (rawBody.source_type !== 'handoff') {
        await markBookingCreated(input.brandKey, input.chatId, existingId);
      }
      return json({
        ok: true,
        workorder_id: existingId,
        idempotent_replay: true,
      });
    }

    if (rawBody.source_type !== 'handoff') {
      const latestCustomerMessage = await loadLatestCustomerMessage(input.chatId);
      if (!isFreshBookingConfirmation(latestCustomerMessage)) {
        return json({
          ok: false,
          error:
            'Fresh customer confirmation is required before creating a Lightspeed workorder',
        }, 409);
      }
    }

    if (rawBody.source_type !== 'handoff' && rawBody.dry_run !== true) {
      bookingClaimed = await claimBookingCommit(input.brandKey, input.chatId);
      if (!bookingClaimed) {
        const concurrentId = await waitForConcurrentWorkorder(
          auth.accessToken,
          auth.accountId,
          customerId,
          built.marker,
        );
        if (concurrentId) {
          await markBookingCreated(input.brandKey, input.chatId, concurrentId);
          return json({
            ok: true,
            workorder_id: concurrentId,
            idempotent_replay: true,
          });
        }
        return json({
          ok: false,
          error: 'This booking is already being processed',
        }, 409);
      }
    }

    if (rawBody.dry_run === true) {
      return json({
        ok: true,
        dry_run: true,
        customer_id: customerId,
        shop_id: shopId,
        requested_time: built.requestedTime,
        workorder_payload: built.payload,
      });
    }

    const workorderUrl = buildAccountResourceUrl(auth.accountId, 'Workorder.json', {});
    const created = await lightspeedJsonRequest(auth.accessToken, workorderUrl, {
      method: 'POST',
      body: built.payload,
      max429Retries: 2,
    });
    const workorderId = extractWorkorderId(created);
    if (!workorderId) {
      return json({
        ok: false,
        error: 'Lightspeed created no identifiable workorder',
      }, 502);
    }

    if (rawBody.source_type !== 'handoff') {
      await markBookingCreated(input.brandKey, input.chatId, workorderId);
    }
    return json({ ok: true, workorder_id: workorderId });
  } catch (error) {
    if (bookingClaimed) {
      await releaseBookingCommit(input.brandKey, input.chatId);
    }
    console.error(
      '[lightspeed-create-workorder] failed:',
      error instanceof Error ? error.message : String(error),
    );
    return json({
      ok: false,
      error: error instanceof Error ? error.message : 'workorder_creation_failed',
    }, 502);
  }
}

Deno.serve(handleRequest);
