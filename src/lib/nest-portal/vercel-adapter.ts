/**
 * Vercel serverless <-> Next.js App Router adapter.
 *
 * The Nest brand-portal endpoints were written as Vercel Node functions
 * `export default async function handler(req: VercelRequest, res: VercelResponse)`.
 * Rather than rewrite that logic, we run it verbatim behind a thin shim that builds a
 * fake (req,res) from a NextRequest and captures the response.
 *
 * We re-export @vercel/node's real `VercelRequest` / `VercelResponse` types (the handlers'
 * `from '@vercel/node'` imports were rewritten to point here) and construct compatible
 * objects at runtime. The request is backed by a real Node Readable so streaming/upload
 * handlers (`req.on('data'|'end')`) keep working; the response buffers writes.
 */
import { type NextRequest } from "next/server";
import { Readable } from "node:stream";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export type { VercelRequest, VercelResponse } from "@vercel/node";

type VercelHandler = (req: VercelRequest, res: VercelResponse) => unknown;

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function searchParamsToQuery(url: URL): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const key of url.searchParams.keys()) {
    if (key in query) continue;
    const all = url.searchParams.getAll(key);
    query[key] = all.length > 1 ? all : all[0];
  }
  return query;
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function parseBody(raw: Buffer, contentType: string): unknown {
  if (raw.length === 0) return undefined;
  const text = raw.toString("utf8");
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  // Vercel parses JSON bodies by default; mirror that leniently.
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Build a VercelRequest backed by a real Readable stream (so req.on('data') works). */
function buildRequest(request: NextRequest, rawBuf: Buffer): VercelRequest {
  const url = new URL(request.url);
  const contentType = request.headers.get("content-type") || "";
  const method = (request.method || "GET").toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : parseBody(rawBuf, contentType);

  const stream = Readable.from(rawBuf.length ? [rawBuf] : []) as unknown as VercelRequest &
    Record<string, unknown>;
  stream.method = request.method;
  stream.url = request.url;
  (stream as Record<string, unknown>).query = searchParamsToQuery(url);
  (stream as Record<string, unknown>).headers = headersToObject(request.headers);
  (stream as Record<string, unknown>).cookies = parseCookies(request.headers.get("cookie"));
  (stream as Record<string, unknown>).body = body;
  return stream;
}

interface CapturedResponse {
  res: VercelResponse;
  toResponse(): Response;
}

/** Build a VercelResponse that captures status/headers/body into a Web Response. */
function buildResponse(): CapturedResponse {
  const headers = new Headers();
  let statusCode = 200;
  let bodyText: string | null = null;
  let sent = false;

  const res = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(code: number) {
      statusCode = code;
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
      return res;
    },
    getHeader(name: string) {
      return headers.get(name) ?? undefined;
    },
    removeHeader(name: string) {
      headers.delete(name);
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(body: unknown) {
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
      bodyText = JSON.stringify(body);
      sent = true;
      return res;
    },
    send(body: unknown) {
      bodyText = typeof body === "string" ? body : JSON.stringify(body);
      sent = true;
      return res;
    },
    write(chunk: unknown) {
      const piece = typeof chunk === "string" ? chunk : String(chunk);
      bodyText = (bodyText ?? "") + piece;
      sent = true;
      return true;
    },
    end(body?: unknown) {
      if (body !== undefined && body !== null) {
        bodyText = typeof body === "string" ? body : String(body);
      }
      sent = true;
      return res;
    },
    get headersSent() {
      return sent;
    },
  };

  return {
    res: res as unknown as VercelResponse,
    toResponse() {
      return new Response(bodyText, { status: statusCode, headers });
    },
  };
}

/**
 * Run a Vercel-style handler against a NextRequest and return a Web Response.
 */
export async function runVercelHandler(
  handler: VercelHandler,
  request: NextRequest,
): Promise<Response> {
  const rawBuf = Buffer.from(await request.arrayBuffer());
  const req = buildRequest(request, rawBuf);
  const captured = buildResponse();
  await handler(req, captured.res);
  return captured.toResponse();
}

/**
 * Invoke a Vercel-style handler in-process (no HTTP) from server code — used to call the
 * ported brand-portal endpoints internally instead of fetching the external Nest deployment.
 */
export async function invokeVercelHandler(
  handler: VercelHandler,
  opts: {
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    query?: URLSearchParams | Record<string, string | string[]>;
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<{ status: number; data: Record<string, unknown> }> {
  const query: Record<string, string | string[]> = {};
  if (opts.query instanceof URLSearchParams) {
    for (const key of opts.query.keys()) {
      if (key in query) continue;
      const all = opts.query.getAll(key);
      query[key] = all.length > 1 ? all : all[0];
    }
  } else if (opts.query) {
    Object.assign(query, opts.query);
  }

  const req = {
    method: opts.method,
    url: "/",
    query,
    body: opts.body ?? undefined,
    headers: opts.headers ?? {},
    cookies: {},
    on: () => req,
  } as unknown as VercelRequest;

  const captured = buildResponse();
  await handler(req, captured.res);
  const resp = captured.toResponse();
  const text = await resp.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { raw: text };
  }
  return { status: resp.status, data };
}
