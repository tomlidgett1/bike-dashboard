import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildLightspeedInquiryContext } from "@/lib/customer-inquiries/lightspeed-context";
import {
  findLightspeedCustomerForInquiry,
  isLightspeedPhoneNameIndexWarm,
  lookupLightspeedCustomerForLab,
  lookupLightspeedCustomerNameByPhone,
  phoneLookupKeys,
  searchLightspeedCustomersForNest,
  warmLightspeedPhoneNameIndex,
} from "@/lib/services/lightspeed/customer-search";
import { createLightspeedClient } from "@/lib/services/lightspeed";
import { isLightspeedInBackoff } from "@/lib/services/lightspeed/lightspeed-client";
import { getConnection, getValidAccessToken, isLightspeedConnected } from "@/lib/services/lightspeed/token-manager";
import type { LightspeedCustomer } from "@/lib/services/lightspeed/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function serializeCustomerNameOnly(customer: LightspeedCustomer) {
  return {
    firstName: customer.firstName ?? null,
    lastName: customer.lastName ?? null,
  };
}

function serializeCustomer(customer: LightspeedCustomer) {
  const contact = customer.Contact;
  const phones = ensureArray(contact?.Phones?.ContactPhone).map((entry) => ({
    number: entry.number ?? null,
    useType: entry.useType ?? null,
  }));
  const emails = ensureArray(contact?.Emails?.ContactEmail).map((entry) => ({
    address: entry.address ?? null,
    useType: entry.useType ?? null,
  }));

  return {
    customerID: customer.customerID,
    firstName: customer.firstName ?? null,
    lastName: customer.lastName ?? null,
    company: customer.company ?? null,
    archived: customer.archived ?? null,
    contact: {
      mobile: contact?.mobile ?? null,
      phoneHome: contact?.phoneHome ?? null,
      phoneWork: contact?.phoneWork ?? null,
      pager: contact?.pager ?? null,
      fax: contact?.fax ?? null,
      phones,
      emails,
    },
  };
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { error: json({ error: "Unauthorised. Please log in first." }, 401) };
  return { user, supabase };
}

function parseMaxScanPages(value: string | number | null | undefined): number {
  const parsed = Number.parseInt(String(value ?? "5"), 10);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(Math.max(parsed, 1), 20);
}

async function assertLightspeedReady(userId: string): Promise<string | null> {
  if (isLightspeedInBackoff(userId)) {
    return "Lightspeed rate-limit backoff is active. Wait a minute and try again.";
  }
  const token = await getValidAccessToken(userId);
  if (!token) {
    return "No valid Lightspeed token. Reconnect Lightspeed in Settings first.";
  }
  return null;
}

async function loadConnectionStatus(userId: string) {
  const [connection, connected, token, inBackoff, indexWarm] = await Promise.all([
    getConnection(userId),
    isLightspeedConnected(userId),
    getValidAccessToken(userId),
    Promise.resolve(isLightspeedInBackoff(userId)),
    Promise.resolve(isLightspeedPhoneNameIndexWarm(userId)),
  ]);

  return {
    connected,
    hasAccessToken: Boolean(token),
    inBackoff,
    phoneNameIndexWarm: indexWarm,
    connection: connection
      ? {
          status: connection.status,
          account_id: connection.account_id,
          account_name: connection.account_name,
          token_expires_at: connection.token_expires_at,
          last_error: connection.last_error,
          last_error_at: connection.last_error_at,
          last_token_refresh_at: connection.last_token_refresh_at,
        }
      : null,
  };
}

export async function GET(request: NextRequest) {
  const started = Date.now();
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const mode = String(searchParams.get("mode") ?? "customer_lookup").trim();

  try {
    if (mode === "status") {
      const status = await loadConnectionStatus(auth.user.id);
      return json({ ok: true, mode, durationMs: Date.now() - started, ...status });
    }

    if (mode === "nest_search") {
      const query = String(searchParams.get("q") ?? searchParams.get("query") ?? "").trim();
      const limit = Math.min(Math.max(Number.parseInt(searchParams.get("limit") ?? "8", 10) || 8, 1), 25);
      if (!query) return json({ error: "Query parameter q is required." }, 400);

      const results = await searchLightspeedCustomersForNest(auth.user.id, query, limit);
      return json({
        ok: true,
        mode,
        query,
        limit,
        count: results.length,
        results,
        durationMs: Date.now() - started,
      });
    }

    if (mode === "phone_lookup") {
      const phone = String(searchParams.get("phone") ?? "").trim();
      if (!phone) return json({ error: "phone is required." }, 400);

      const maxScanPages = parseMaxScanPages(searchParams.get("maxScanPages"));
      const customer = await findLightspeedCustomerForInquiry(
        auth.user.id,
        { senderEmail: phone, senderName: phone },
        { maxScanPages },
      );
      const indexName = await lookupLightspeedCustomerNameByPhone(auth.user.id, phone, {
        maxScanPages,
      });

      return json({
        ok: true,
        mode,
        phone,
        lookupKeys: phoneLookupKeys(phone),
        maxScanPages,
        indexName: indexName ?? null,
        matched: Boolean(customer),
        customer: customer ? serializeCustomer(customer) : null,
        durationMs: Date.now() - started,
      });
    }

    if (mode === "inquiry") {
      const senderEmail = String(searchParams.get("senderEmail") ?? searchParams.get("email") ?? "").trim();
      const senderName = String(searchParams.get("senderName") ?? searchParams.get("name") ?? "").trim();
      if (!senderEmail && !senderName) {
        return json({ error: "senderEmail or senderName is required." }, 400);
      }

      const maxScanPages = parseMaxScanPages(searchParams.get("maxScanPages"));
      const [customer, context] = await Promise.all([
        findLightspeedCustomerForInquiry(
          auth.user.id,
          { senderEmail, senderName },
          { maxScanPages },
        ),
        buildLightspeedInquiryContext({
          userId: auth.user.id,
          senderEmail: senderEmail || senderName,
          senderName: senderName || senderEmail,
        }),
      ]);

      return json({
        ok: true,
        mode,
        senderEmail,
        senderName,
        maxScanPages,
        matched: Boolean(customer),
        customer: customer ? serializeCustomer(customer) : null,
        inquiryContext: context,
        durationMs: Date.now() - started,
      });
    }

    if (mode === "customer_lookup") {
      const phone = String(searchParams.get("phone") ?? "").trim();
      const email = String(searchParams.get("email") ?? "").trim();
      const name = String(searchParams.get("name") ?? "").trim();
      const maxScanPages = parseMaxScanPages(searchParams.get("maxScanPages"));

      if (!phone && !email && !name) {
        return json({ error: "Provide at least one of phone, email, or name." }, 400);
      }

      const blocked = await assertLightspeedReady(auth.user.id);
      if (blocked) return json({ ok: false, mode, error: blocked }, 503);

      const lookup = await lookupLightspeedCustomerForLab(auth.user.id, {
        phone,
        email,
        name,
        maxScanPages,
      });

      return json({
        ok: true,
        mode,
        phone: phone || null,
        email: email || null,
        name: name || null,
        normalizedPhone: lookup.normalizedPhone,
        lookupKeys: lookup.lookupKeys,
        maxScanPages,
        matched: lookup.matched,
        customer: lookup.customer ? serializeCustomerNameOnly(lookup.customer) : null,
        steps: lookup.steps,
        durationMs: Date.now() - started,
      });
    }

    if (mode === "preset") {
      const query = String(searchParams.get("query") ?? "account-info").trim();
      const client = createLightspeedClient(auth.user.id);

      if (query === "account-info") {
        const account = await client.getAccount();
        return json({
          ok: true,
          mode,
          query,
          account,
          durationMs: Date.now() - started,
        });
      }

      if (query === "categories") {
        const categories = await client.getCategories();
        return json({
          ok: true,
          mode,
          query,
          totalCount: categories.length,
          sample: categories.slice(0, 20),
          durationMs: Date.now() - started,
        });
      }

      return json({ error: `Unknown preset query: ${query}` }, 400);
    }

    return json({ error: `Unknown mode: ${mode}` }, 400);
  } catch (error) {
    return json(
      {
        ok: false,
        mode,
        error: error instanceof Error ? error.message : "Lightspeed lab request failed.",
        durationMs: Date.now() - started,
      },
      500,
    );
  }
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const action = String(body.action ?? "").trim();

  try {
    if (action === "warm_phone_index") {
      const maxPages = Math.min(Math.max(Number(body.maxPages ?? 80) || 80, 1), 200);
      warmLightspeedPhoneNameIndex(auth.user.id, maxPages);
      return json({
        ok: true,
        action,
        maxPages,
        message: "Phone name index warm started in background.",
        durationMs: Date.now() - started,
      });
    }

    if (action === "customer_lookup" || action === "customer_scan") {
      const phone = String(body.phone ?? "").trim();
      const email = String(body.email ?? "").trim();
      const name = String(body.name ?? "").trim();
      const maxScanPages = parseMaxScanPages(body.maxScanPages as number | string | undefined);

      if (!phone && !email && !name) {
        return json({ error: "Provide at least one of phone, email, or name." }, 400);
      }

      const blocked = await assertLightspeedReady(auth.user.id);
      if (blocked) return json({ ok: false, action, error: blocked }, 503);

      const lookup = await lookupLightspeedCustomerForLab(auth.user.id, {
        phone,
        email,
        name,
        maxScanPages,
      });

      return json({
        ok: true,
        action,
        matched: lookup.matched,
        normalizedPhone: lookup.normalizedPhone,
        customer: lookup.customer ? serializeCustomerNameOnly(lookup.customer) : null,
        steps: lookup.steps,
        lookupKeys: lookup.lookupKeys,
        maxScanPages,
        durationMs: Date.now() - started,
      });
    }

    if (action === "inquiry_context") {
      const senderEmail = String(body.senderEmail ?? "").trim();
      const senderName = String(body.senderName ?? "").trim();
      if (!senderEmail && !senderName) {
        return json({ error: "senderEmail or senderName is required." }, 400);
      }

      const context = await buildLightspeedInquiryContext({
        userId: auth.user.id,
        senderEmail: senderEmail || senderName,
        senderName: senderName || senderEmail,
      });

      return json({
        ok: true,
        action,
        inquiryContext: context,
        durationMs: Date.now() - started,
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return json(
      {
        ok: false,
        action,
        error: error instanceof Error ? error.message : "Lightspeed lab request failed.",
        durationMs: Date.now() - started,
      },
      500,
    );
  }
}
