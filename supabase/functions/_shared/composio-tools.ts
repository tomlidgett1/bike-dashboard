import { getOptionalEnv } from "./env.ts";
import {
  authConfigsForComposioToolkits,
  getComposioClient,
  formatComposioAuthErrorMessage,
} from "./composio-client.ts";

export interface ComposioConnectedAccountSummary {
  id: string;
  toolkit: string;
  label: string;
  status: string;
}

export function getComposioUserId(
  authUserId: string | null,
  senderHandle: string,
): string {
  return authUserId ? `auth:${authUserId}` : `handle:${senderHandle}`;
}

export function getComposioUserIds(
  authUserId: string | null,
  senderHandle: string,
): string[] {
  return [
    ...(authUserId ? [`auth:${authUserId}`] : []),
    `handle:${senderHandle}`,
  ].filter((value, index, arr) => arr.indexOf(value) === index);
}

const DEFAULT_COMPOSIO_CALLBACK = "https://nest.expert/dashboard";

/** Coerce env values into an absolute http(s) URL Composio will accept. */
function normaliseToAbsoluteUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t.length) return null;
  // Relative paths are never valid OAuth callback bases for their API.
  if (t.startsWith("/")) return null;
  let candidate = t;
  if (t.startsWith("//")) {
    candidate = `https:${t}`;
  } else if (!/^https?:\/\//i.test(t)) {
    candidate = `https://${t}`;
  }
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Resolved in order; first value that parses as a valid http(s) URL wins.
 * Use COMPOSIO_CALLBACK_URL for an explicit OAuth return URL registered in Composio.
 */
export function resolveComposioCallbackUrl(): string {
  const keys = [
    "COMPOSIO_CALLBACK_URL",
    "NEST_PUBLIC_URL",
    "NEST_PUBLIC_SITE_URL",
    "VERCEL_URL",
  ] as const;
  for (const key of keys) {
    const raw = getOptionalEnv(key);
    if (!raw) continue;
    const url = normaliseToAbsoluteUrl(raw);
    if (url) return url;
  }
  return DEFAULT_COMPOSIO_CALLBACK;
}

function normaliseToolkit(value: Record<string, unknown>): string {
  const toolkit = value.toolkit as Record<string, unknown> | undefined;
  return String(
    value.toolkit_slug ??
      toolkit?.slug ??
      value.appName ??
      value.name ??
      "unknown",
  ).toLowerCase();
}

function normaliseLabel(value: Record<string, unknown>): string {
  const toolkit = value.toolkit as Record<string, unknown> | undefined;
  return String(toolkit?.name ?? value.appName ?? value.name ?? normaliseToolkit(value));
}

function normaliseStatus(value: Record<string, unknown>): string {
  return String(value.status ?? "ACTIVE").toUpperCase();
}

function inferToolRisk(tool: Record<string, unknown>): "read" | "write" {
  const slug = String(tool.slug ?? "").toUpperCase();
  const description = String(tool.description ?? "").toLowerCase();

  const writeSlug =
    /(CREATE|UPDATE|DELETE|SEND|POST|WRITE|PATCH|UPSERT|REMOVE|CANCEL|ARCHIVE|REPLY|COMMENT|BOOK|SCHEDULE|INVITE)/.test(
      slug,
    );
  const writeDescription =
    /\b(create|update|delete|send|post|write|patch|upsert|remove|cancel|archive|reply|comment|book|schedule|invite)\b/.test(
      description,
    );

  return writeSlug || writeDescription ? "write" : "read";
}

async function appendConnectLinkIfHelpful(
  message: string,
  userId: string,
  toolkit: string | null,
): Promise<string> {
  const lower = message.toLowerCase();
  const looksLikeConnectionIssue =
    lower.includes("connected account") ||
    lower.includes("not connected") ||
    lower.includes("auth") ||
    lower.includes("token") ||
    lower.includes("access denied") ||
    lower.includes("unauthorized");

  if (!looksLikeConnectionIssue || !toolkit) {
    return formatComposioAuthErrorMessage(message);
  }

  try {
    const composio = getComposioClient();
    const authConfigs = authConfigsForComposioToolkits([toolkit]);
    const session = await composio.create(userId, {
      toolkits: [toolkit] as never,
      manageConnections: true,
      ...(authConfigs ? { authConfigs } : {}),
    });
    const connectionRequest = await session.authorize(toolkit, {
      callbackUrl: resolveComposioCallbackUrl(),
    });
    const link = connectionRequest.redirectUrl?.trim();
    if (!link) return formatComposioAuthErrorMessage(message);
    return `${formatComposioAuthErrorMessage(message)}\n\nReconnect ${toolkit}: ${link}`;
  } catch {
    return formatComposioAuthErrorMessage(message);
  }
}

export async function listComposioConnectedAccounts(
  userId: string,
): Promise<ComposioConnectedAccountSummary[]> {
  const composio = getComposioClient();
  const response = await composio.connectedAccounts.list({ userIds: [userId] });
  const items = (
    (response as { items?: unknown[] }).items ??
    (response as { data?: unknown[] }).data ??
    []
  ) as unknown[];

  return items
    .map((item) => item as Record<string, unknown>)
    .map((account) => ({
      id: String(account.id ?? ""),
      toolkit: normaliseToolkit(account),
      label: normaliseLabel(account),
      status: normaliseStatus(account),
    }))
    .filter((account) => account.id.length > 0);
}

export async function mintComposioConnectLink(args: {
  userId: string;
  toolkit: string;
}): Promise<{ toolkit: string; url: string }> {
  const composio = getComposioClient();
  const authConfigs = authConfigsForComposioToolkits([args.toolkit]);
  const session = await composio.create(args.userId, {
    toolkits: [args.toolkit] as never,
    manageConnections: true,
    ...(authConfigs ? { authConfigs } : {}),
  });
  const connectionRequest = await session.authorize(args.toolkit, {
    callbackUrl: resolveComposioCallbackUrl(),
  });
  if (!connectionRequest.redirectUrl) {
    throw new Error(`Composio did not return a redirect URL for ${args.toolkit}`);
  }
  return { toolkit: args.toolkit, url: connectionRequest.redirectUrl };
}

export async function searchComposioTools(args: {
  query: string;
  toolkits?: string[];
  limit?: number;
}) {
  const composio = getComposioClient();
  const limit = args.limit ?? 12;
  const toolkitSlug = args.toolkits?.[0]?.trim();
  let response: unknown;
  const clientTools = (composio as unknown as {
    client?: { tools?: { list?: (query: Record<string, unknown>) => Promise<unknown> } };
  }).client?.tools;

  if (clientTools?.list) {
    response = await clientTools.list({
      query: args.query,
      ...(toolkitSlug ? { toolkit_slug: toolkitSlug } : {}),
      limit,
    });
  } else {
    response = await composio.tools.getRawComposioTools({
      query: args.query,
      search: args.query,
      ...(toolkitSlug ? { toolkit_slug: toolkitSlug, toolkits: args.toolkits } : {}),
      limit,
    } as never);
  }

  const raw = response as unknown as {
    items?: unknown[];
    data?: unknown[];
    tools?: unknown[];
    results?: unknown[];
  };
  const items = (
    Array.isArray(response) ? response :
      raw.items ?? raw.data ?? raw.tools ?? raw.results ?? []
  ) as Array<Record<string, unknown>>;

  return {
    items: items.map((tool) => ({
      slug: String(tool.slug ?? ""),
      name: String(tool.name ?? ""),
      toolkit: normaliseToolkit(tool),
      description: String(tool.description ?? ""),
      risk: inferToolRisk(tool),
    })),
    total: Number((response as { total_items?: unknown; total?: unknown }).total_items ?? items.length),
  };
}

export async function searchComposioSessionTools(args: {
  userId: string;
  query: string;
  toolkits?: string[];
  limit?: number;
}) {
  const composio = getComposioClient();
  const authConfigs = authConfigsForComposioToolkits(args.toolkits ?? []);
  const session = await composio.create(args.userId, {
    ...(args.toolkits?.length ? { toolkits: args.toolkits as never } : {}),
    manageConnections: true,
    ...(authConfigs ? { authConfigs } : {}),
  });
  const search = await session.search({
    query: args.query,
    ...(args.toolkits?.length ? { toolkits: args.toolkits } : {}),
  } as never);
  const schemas = (search.toolSchemas ?? {}) as Record<string, {
    toolSlug?: string;
    toolkit?: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    hasFullSchema?: boolean;
  }>;
  const orderedSlugs: string[] = [];
  for (const result of search.results ?? []) {
    for (const slug of result.primaryToolSlugs ?? []) {
      if (!orderedSlugs.includes(slug)) orderedSlugs.push(slug);
    }
    for (const slug of result.relatedToolSlugs ?? []) {
      if (!orderedSlugs.includes(slug)) orderedSlugs.push(slug);
    }
  }
  const items = orderedSlugs
    .map((slug) => {
      const schema = schemas[slug] ?? {};
      return {
        slug,
        name: slug,
        toolkit: String(schema.toolkit ?? slug.split("_")[0]?.toLowerCase() ?? "unknown").toLowerCase(),
        description: String(schema.description ?? ""),
        risk: inferToolRisk({ slug, description: schema.description ?? "" }),
        inputParameters: schema.inputSchema ?? {},
        outputParameters: schema.outputSchema ?? {},
        hasFullSchema: schema.hasFullSchema ?? false,
      };
    })
    .slice(0, args.limit ?? 12);
  return {
    sessionId: search.session?.id ?? null,
    items,
    total: items.length,
    toolkitConnectionStatuses: search.toolkitConnectionStatuses ?? [],
    nextStepsGuidance: search.nextStepsGuidance ?? [],
    raw: search,
  };
}

export async function executeComposioSessionTool(args: {
  userId: string;
  slug: string;
  input: Record<string, unknown>;
  toolkits?: string[];
}) {
  const composio = getComposioClient();
  const authConfigs = authConfigsForComposioToolkits(args.toolkits ?? []);
  const session = await composio.create(args.userId, {
    ...(args.toolkits?.length ? { toolkits: args.toolkits as never } : {}),
    manageConnections: true,
    ...(authConfigs ? { authConfigs } : {}),
  });
  const result = await session.execute(args.slug, args.input);
  return {
    slug: args.slug,
    result,
  };
}

export async function getComposioToolSchema(slug: string) {
  const composio = getComposioClient();
  const clientTools = (composio as unknown as {
    client?: { tools?: { retrieve?: (slug: string) => Promise<unknown> } };
  }).client?.tools;
  const tool = (clientTools?.retrieve
    ? await clientTools.retrieve(slug)
    : await composio.tools.getRawComposioToolBySlug(slug)) as Record<string, unknown>;
  const toolkit = (tool.toolkit && typeof tool.toolkit === "object" && !Array.isArray(tool.toolkit))
    ? tool.toolkit as Record<string, unknown>
    : {};

  return {
    slug: String(tool.slug ?? slug),
    name: String(tool.name ?? slug),
    description: String(tool.description ?? ""),
    toolkit: typeof toolkit.slug === "string" ? toolkit.slug : null,
    risk: inferToolRisk(tool as unknown as Record<string, unknown>),
    inputParameters: tool.inputParameters ?? tool.input_parameters,
  };
}

async function executeComposioToolInternal(args: {
  userId: string;
  slug: string;
  connectedAccountId?: string;
  input: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const composio = getComposioClient();
  const tool = await composio.tools.getRawComposioToolBySlug(args.slug);

  try {
    const executeArgs = {
      userId: args.userId,
      user_id: args.userId,
      connectedAccountId: args.connectedAccountId,
      connected_account_id: args.connectedAccountId,
      arguments: args.input,
      dangerouslySkipVersionCheck: true,
    } as unknown as Parameters<typeof composio.tools.execute>[1];
    const result = await composio.tools.execute(args.slug, executeArgs);

    return {
      slug: args.slug,
      toolkit: tool.toolkit?.slug ?? null,
      risk: inferToolRisk(tool as unknown as Record<string, unknown>),
      result,
    };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    throw new Error(
      await appendConnectLinkIfHelpful(
        raw,
        args.userId,
        tool.toolkit?.slug ?? null,
      ),
    );
  }
}

export async function executeComposioReadTool(args: {
  userId: string;
  slug: string;
  connectedAccountId?: string;
  input: Record<string, unknown>;
}) {
  return executeComposioToolInternal(args);
}

export async function executeComposioActionTool(args: {
  userId: string;
  slug: string;
  connectedAccountId?: string;
  input: Record<string, unknown>;
}) {
  return executeComposioToolInternal(args);
}
