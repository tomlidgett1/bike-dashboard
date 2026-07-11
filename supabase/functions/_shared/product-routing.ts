import { resolveCanonicalBrandKey } from "./brand-registry.ts";
import { getOptionalEnv, requireAnyEnv } from "./env.ts";
import { internalJsonHeaders } from "./internal-auth.ts";
import type { NormalisedIncomingMessage } from "./linq.ts";
import { normaliseToE164 } from "./phone-normalise.ts";
import { getAdminClient } from "./supabase.ts";
import { ensureNestUser } from "./state.ts";

export type ProductRoute =
  | "nest"
  | "brand"
  | "quid"
  | "ash-internal"
  | "yellow-jersey-upload";
export type RouteScope = "direct" | "group";
export type RouteSource =
  | "route-switch"
  | "yellow_jersey_upload_phone_routes"
  | "yellow_jersey_ash_phone_routes"
  | "user_profiles"
  | "group_chats"
  | "quid_users"
  | "default"
  | "invalid";

export interface RouteTarget {
  route: ProductRoute;
  brandKey: string | null;
}

export interface RouteSwitchCommand extends RouteTarget {
  confirmation: string;
  command: string;
}

export interface ProductRouteDecision extends RouteTarget {
  scope: RouteScope;
  source: RouteSource;
  routeSwitch: RouteSwitchCommand | null;
  authUserId: string | null;
  defaultPersisted: boolean;
  repairedInvalidRoute: boolean;
  createdOrRepairedProfile: boolean;
}

type RouteRow = {
  route: string | null;
  route_brand_key?: string | null;
};

type YellowJerseyAshPhoneRouteRow = {
  phone_e164: string;
  brand_key: string | null;
};

type YellowJerseyUploadPhoneRouteRow = {
  phone_e164: string;
  status: string | null;
  expires_at: string | null;
};

const DEFAULT_ROUTE: RouteTarget = { route: "nest", brandKey: null };
const VALID_ROUTES: ProductRoute[] = [
  "nest",
  "brand",
  "quid",
  "ash-internal",
  "yellow-jersey-upload",
];
const YELLOW_JERSEY_UPLOAD_PHONE_ROUTES_TABLE =
  "yellow_jersey_upload_phone_routes";
const YELLOW_JERSEY_ASH_PHONE_ROUTES_TABLE = "yellow_jersey_ash_phone_routes";

let yellowJerseyUploadPhoneRoutesMissingLogged = false;
let yellowJerseyAshPhoneRoutesMissingLogged = false;

function compactWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function cleanRouteCommand(text: string): string {
  return compactWhitespace(text).toLowerCase();
}

export function normaliseRouteValue(
  rawRoute: string | null | undefined,
  rawBrandKey?: string | null,
): RouteTarget | null {
  const value = compactWhitespace(String(rawRoute ?? "")).toLowerCase();
  if (!value) return null;

  if (value === "ash" || value === "ash-brand") {
    return { route: "brand", brandKey: "ash" };
  }

  if (value === "brand") {
    return {
      route: "brand",
      brandKey: compactWhitespace(rawBrandKey ?? "").toLowerCase() || "ash",
    };
  }

  if (value === "ash-internal") {
    return { route: "ash-internal", brandKey: null };
  }

  if (value === "yellow-jersey-upload" || value === "upload") {
    return { route: "yellow-jersey-upload", brandKey: null };
  }

  if (value === "nest" || value === "quid") {
    return { route: value, brandKey: null };
  }

  return null;
}

export async function parseRouteSwitchCommand(
  text: string,
): Promise<RouteSwitchCommand | null> {
  const cleaned = cleanRouteCommand(text);
  if (!cleaned) return null;

  if (cleaned === "hey nest") {
    return {
      route: "nest",
      brandKey: null,
      confirmation: "Switched to Nest.",
      command: cleaned,
    };
  }

  if (cleaned === "hey quid") {
    return {
      route: "quid",
      brandKey: null,
      confirmation: "Switched to Quid.",
      command: cleaned,
    };
  }

  if (cleaned === "hey ash internal") {
    return {
      route: "ash-internal",
      brandKey: null,
      confirmation: "Switched to Ash Internal.",
      command: cleaned,
    };
  }

  if (cleaned === "hey ash") {
    return {
      route: "brand",
      brandKey: "ash",
      confirmation: "Switched to Ash.",
      command: cleaned,
    };
  }

  const dynamic = cleaned.match(/^hey ([a-z0-9][a-z0-9_-]{0,63})$/);
  if (!dynamic) return null;

  const activationWord = dynamic[1];
  if (
    activationWord === "nest" || activationWord === "quid" ||
    activationWord === "ash" || activationWord === "upload"
  ) return null;

  const brandKey = await resolveCanonicalBrandKey(activationWord);
  if (!brandKey || brandKey.endsWith("-internal")) return null;

  return {
    route: "brand",
    brandKey,
    confirmation: `Switched to ${brandKey}.`,
    command: cleaned,
  };
}

function logRoutingDecision(
  event: string,
  payload: Record<string, unknown>,
): void {
  console.log(`[product-router] ${event}`, payload);
}

function routeToPersistedRow(target: RouteTarget): RouteRow {
  return {
    route: target.route,
    route_brand_key: target.route === "brand" ? target.brandKey ?? "ash" : null,
  };
}

async function updateDirectRoute(
  handle: string,
  target: RouteTarget,
): Promise<void> {
  const { error } = await getAdminClient()
    .from("user_profiles")
    .update(routeToPersistedRow(target))
    .eq("handle", handle);
  if (error) throw new Error(`direct route update failed: ${error.message}`);
}

export async function setDirectProductRouteForHandle(
  handle: string,
  botNumber: string,
  target: RouteTarget,
): Promise<void> {
  await ensureNestUser(handle, botNumber);
  await updateDirectRoute(handle, target);
}

async function upsertGroupRoute(
  message: NormalisedIncomingMessage,
  target: RouteTarget,
): Promise<void> {
  const { error } = await getAdminClient()
    .from("group_chats")
    .upsert({
      chat_id: message.chatId,
      display_name: message.chatName ?? null,
      participant_count: message.participantNames.length,
      last_activity_at: new Date().toISOString(),
      ...routeToPersistedRow(target),
    }, { onConflict: "chat_id" });
  if (error) throw new Error(`group route upsert failed: ${error.message}`);
}

async function readDirectRoute(handle: string): Promise<RouteRow | null> {
  const { data, error } = await getAdminClient()
    .from("user_profiles")
    .select("route, route_brand_key")
    .eq("handle", handle)
    .maybeSingle<RouteRow>();
  if (error) {
    throw new Error(`direct route read failed: ${error.message}`);
  }
  return data ?? null;
}

async function readGroupRoute(chatId: string): Promise<RouteRow | null> {
  const { data, error } = await getAdminClient()
    .from("group_chats")
    .select("route, route_brand_key")
    .eq("chat_id", chatId)
    .maybeSingle<RouteRow>();
  if (error) {
    throw new Error(`group route read failed: ${error.message}`);
  }
  return data ?? null;
}

async function isKnownQuidUser(phone: string): Promise<boolean> {
  const { data, error } = await getAdminClient()
    .from("quid_users")
    .select("id")
    .eq("phone", phone)
    .limit(1);
  if (error) {
    // Quid tables may not exist in local/dev branches yet. That should not
    // prevent Nest from handling normal traffic.
    if (/relation .*quid_users.* does not exist/i.test(error.message)) {
      return false;
    }
    console.warn("[product-router] quid user lookup failed:", error.message);
    return false;
  }
  return Boolean(data && data.length > 0);
}

function isMissingYellowJerseyAshPhoneRoutesTable(message: string): boolean {
  return /relation .*yellow_jersey_ash_phone_routes.* does not exist/i.test(
    message,
  ) ||
    /Could not find the table .*yellow_jersey_ash_phone_routes/i.test(message);
}

function isMissingYellowJerseyUploadPhoneRoutesTable(message: string): boolean {
  return /relation .*yellow_jersey_upload_phone_routes.* does not exist/i.test(
    message,
  ) ||
    /Could not find the table .*yellow_jersey_upload_phone_routes/i.test(
      message,
    );
}

async function lookupYellowJerseyUploadPhoneRoute(
  senderHandle: string,
): Promise<RouteTarget | null> {
  const phoneE164 = normaliseToE164(senderHandle);
  if (!phoneE164) return null;

  const { data, error } = await getAdminClient()
    .from(YELLOW_JERSEY_UPLOAD_PHONE_ROUTES_TABLE)
    .select("phone_e164, status, expires_at")
    .eq("phone_e164", phoneE164)
    .maybeSingle<YellowJerseyUploadPhoneRouteRow>();

  if (error) {
    if (isMissingYellowJerseyUploadPhoneRoutesTable(error.message)) {
      if (!yellowJerseyUploadPhoneRoutesMissingLogged) {
        console.warn(
          "[product-router] yellow jersey upload phone route table missing; falling back to normal routing",
        );
        yellowJerseyUploadPhoneRoutesMissingLogged = true;
      }
      return null;
    }
    console.warn(
      "[product-router] yellow jersey upload phone route lookup failed:",
      error.message,
    );
    return null;
  }

  if (!data?.phone_e164) return null;
  if (data.status !== "active" && data.status !== "completed") return null;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    return null;
  }

  return { route: "yellow-jersey-upload", brandKey: null };
}

async function lookupYellowJerseyAshPhoneRoute(
  senderHandle: string,
): Promise<RouteTarget | null> {
  const phoneE164 = normaliseToE164(senderHandle);
  if (!phoneE164) return null;

  const { data, error } = await getAdminClient()
    .from(YELLOW_JERSEY_ASH_PHONE_ROUTES_TABLE)
    .select("phone_e164, brand_key")
    .eq("phone_e164", phoneE164)
    .maybeSingle<YellowJerseyAshPhoneRouteRow>();

  if (error) {
    if (isMissingYellowJerseyAshPhoneRoutesTable(error.message)) {
      if (!yellowJerseyAshPhoneRoutesMissingLogged) {
        console.warn(
          "[product-router] yellow jersey ash phone route table missing; falling back to normal routing",
        );
        yellowJerseyAshPhoneRoutesMissingLogged = true;
      }
      return null;
    }
    console.warn(
      "[product-router] yellow jersey ash phone route lookup failed:",
      error.message,
    );
    return null;
  }

  if (!data?.phone_e164) return null;

  const brandKey = compactWhitespace(data.brand_key ?? "").toLowerCase() ||
    "ash";
  if (brandKey !== "ash") {
    console.warn(
      "[product-router] ignoring non-Ash yellow jersey phone route",
      {
        sender: senderHandle,
        phoneE164,
        brandKey,
      },
    );
    return null;
  }

  return { route: "brand", brandKey: "ash" };
}

async function ensureDirectProfile(
  message: NormalisedIncomingMessage,
): Promise<{ authUserId: string | null; repaired: boolean }> {
  const { data: existing } = await getAdminClient()
    .from("user_profiles")
    .select("handle")
    .eq("handle", message.from)
    .maybeSingle<{ handle: string }>();
  const user = await ensureNestUser(
    message.from,
    message.conversation.fromNumber,
  );
  if (!existing) {
    logRoutingDecision("created missing user profile", {
      sender: message.from,
      chatId: message.chatId,
      routeScope: "direct",
    });
  }
  return { authUserId: user.authUserId ?? null, repaired: !existing };
}

async function persistDirectDefault(
  message: NormalisedIncomingMessage,
  sourceHint: "default" | "quid_users" | "invalid",
): Promise<
  {
    target: RouteTarget;
    source: RouteSource;
    defaultPersisted: boolean;
    repairedInvalidRoute: boolean;
  }
> {
  const target = sourceHint === "quid_users"
    ? { route: "quid" as const, brandKey: null }
    : DEFAULT_ROUTE;
  await updateDirectRoute(message.from, target);
  return {
    target,
    source: sourceHint,
    defaultPersisted: sourceHint !== "invalid",
    repairedInvalidRoute: sourceHint === "invalid",
  };
}

async function resolveDirectRoute(
  message: NormalisedIncomingMessage,
): Promise<ProductRouteDecision> {
  const profile = await ensureDirectProfile(message);
  const row = await readDirectRoute(message.from);
  const normalised = normaliseRouteValue(row?.route, row?.route_brand_key);

  if (normalised) {
    if (row?.route === "ash" || row?.route === "ash-brand") {
      await updateDirectRoute(message.from, normalised);
    }
    return {
      ...normalised,
      scope: "direct",
      source: "user_profiles",
      routeSwitch: null,
      authUserId: profile.authUserId,
      defaultPersisted: false,
      repairedInvalidRoute: false,
      createdOrRepairedProfile: profile.repaired,
    };
  }

  const hadInvalidRoute = Boolean(row?.route);
  const quidKnown = !hadInvalidRoute && await isKnownQuidUser(message.from);
  const repaired = await persistDirectDefault(
    message,
    hadInvalidRoute ? "invalid" : quidKnown ? "quid_users" : "default",
  );

  return {
    ...repaired.target,
    scope: "direct",
    source: repaired.source,
    routeSwitch: null,
    authUserId: profile.authUserId,
    defaultPersisted: repaired.defaultPersisted,
    repairedInvalidRoute: repaired.repairedInvalidRoute,
    createdOrRepairedProfile: profile.repaired ||
      repaired.source === "quid_users",
  };
}

async function resolveGroupRoute(
  message: NormalisedIncomingMessage,
): Promise<ProductRouteDecision> {
  const row = await readGroupRoute(message.chatId);
  const normalised = normaliseRouteValue(row?.route, row?.route_brand_key);

  if (normalised) {
    if (row?.route === "ash" || row?.route === "ash-brand") {
      await upsertGroupRoute(message, normalised);
    }
    return {
      ...normalised,
      scope: "group",
      source: "group_chats",
      routeSwitch: null,
      authUserId: null,
      defaultPersisted: false,
      repairedInvalidRoute: false,
      createdOrRepairedProfile: false,
    };
  }

  const hadInvalidRoute = Boolean(row?.route);
  await upsertGroupRoute(message, DEFAULT_ROUTE);
  return {
    ...DEFAULT_ROUTE,
    scope: "group",
    source: hadInvalidRoute ? "invalid" : "default",
    routeSwitch: null,
    authUserId: null,
    defaultPersisted: !hadInvalidRoute,
    repairedInvalidRoute: hadInvalidRoute,
    createdOrRepairedProfile: false,
  };
}

export async function resolveProductRoute(
  message: NormalisedIncomingMessage,
): Promise<ProductRouteDecision> {
  const scope: RouteScope = message.isGroupChat ? "group" : "direct";
  logRoutingDecision("inbound received", {
    chatId: message.chatId,
    sender: message.from,
    isGroupChat: message.isGroupChat,
    conversationId: message.conversation.chatId,
    groupId: message.conversation.groupId,
  });

  if (scope === "direct") {
    const yellowJerseyUploadRoute = await lookupYellowJerseyUploadPhoneRoute(
      message.from,
    );
    if (yellowJerseyUploadRoute) {
      const profile = await ensureDirectProfile(message);
      const decision: ProductRouteDecision = {
        ...yellowJerseyUploadRoute,
        scope,
        source: "yellow_jersey_upload_phone_routes",
        routeSwitch: null,
        authUserId: profile.authUserId,
        defaultPersisted: false,
        repairedInvalidRoute: false,
        createdOrRepairedProfile: profile.repaired,
      };
      logResolvedRoute(decision, message);
      return decision;
    }

    const yellowJerseyAshRoute = await lookupYellowJerseyAshPhoneRoute(
      message.from,
    );
    if (yellowJerseyAshRoute) {
      const profile = await ensureDirectProfile(message);
      const decision: ProductRouteDecision = {
        ...yellowJerseyAshRoute,
        scope,
        source: "yellow_jersey_ash_phone_routes",
        routeSwitch: null,
        authUserId: profile.authUserId,
        defaultPersisted: false,
        repairedInvalidRoute: false,
        createdOrRepairedProfile: profile.repaired,
      };
      logResolvedRoute(decision, message);
      return decision;
    }
  }

  const routeSwitch = await parseRouteSwitchCommand(message.text);
  if (routeSwitch) {
    if (scope === "group") {
      await upsertGroupRoute(message, routeSwitch);
    } else {
      const profile = await ensureDirectProfile(message);
      await updateDirectRoute(message.from, routeSwitch);
      const decision: ProductRouteDecision = {
        ...routeSwitch,
        scope,
        source: "route-switch",
        routeSwitch,
        authUserId: profile.authUserId,
        defaultPersisted: false,
        repairedInvalidRoute: false,
        createdOrRepairedProfile: profile.repaired,
      };
      logResolvedRoute(decision, message);
      return decision;
    }

    const decision: ProductRouteDecision = {
      ...routeSwitch,
      scope,
      source: "route-switch",
      routeSwitch,
      authUserId: null,
      defaultPersisted: false,
      repairedInvalidRoute: false,
      createdOrRepairedProfile: false,
    };
    logResolvedRoute(decision, message);
    return decision;
  }

  const decision = scope === "group"
    ? await resolveGroupRoute(message)
    : await resolveDirectRoute(message);
  logResolvedRoute(decision, message);
  return decision;
}

export function logResolvedRoute(
  decision: ProductRouteDecision,
  message: NormalisedIncomingMessage,
): void {
  logRoutingDecision("route resolved", {
    chatId: message.chatId,
    sender: message.from,
    isGroupChat: message.isGroupChat,
    routeSwitchDetected: Boolean(decision.routeSwitch),
    route: decision.route,
    routeBrandKey: decision.brandKey,
    source: decision.source,
    scope: decision.scope,
    defaultPersisted: decision.defaultPersisted,
    repairedInvalidRoute: decision.repairedInvalidRoute,
    createdOrRepairedProfile: decision.createdOrRepairedProfile,
  });
}

export function isValidProductRoute(route: string): route is ProductRoute {
  return VALID_ROUTES.includes(route as ProductRoute);
}

export async function invokeQuidSms(
  message: NormalisedIncomingMessage,
): Promise<void> {
  const supabaseUrl = (getOptionalEnv("SUPABASE_URL") ?? "").replace(/\/$/, "");
  if (!supabaseUrl) throw new Error("SUPABASE_URL is not configured");
  const secret = requireAnyEnv(
    "INTERNAL_EDGE_SHARED_SECRET",
    "NEST_INTERNAL_EDGE_SHARED_SECRET",
    "SUPABASE_SECRET_KEY",
    "NEW_SUPABASE_SECRET_KEY",
  );
  const response = await fetch(`${supabaseUrl}/functions/v1/quid-sms`, {
    method: "POST",
    headers: internalJsonHeaders(secret),
    body: JSON.stringify({
      phone: message.from,
      text: message.text,
      chatId: message.chatId,
      messageId: message.messageId,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `quid-sms failed (${response.status}): ${body.slice(0, 300)}`,
    );
  }
}
