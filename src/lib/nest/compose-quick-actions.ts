export type NestComposeBuiltinId =
  | "request_money"
  | "linkpay"
  | "send_receipt"
  | "ask_to_call"
  | "bike_ready"
  | "request_review";

export type NestComposeBuiltinAction = {
  id: string;
  kind: "builtin";
  builtin: NestComposeBuiltinId;
};

export type NestComposeCustomAction = {
  id: string;
  kind: "custom";
  label: string;
  /** Middle of the message. Supports {name}, {store}, {phone}, {review_url}. */
  body: string;
};

export type NestComposeQuickAction = NestComposeBuiltinAction | NestComposeCustomAction;

export const NEST_COMPOSE_BUILTIN_META: Record<
  NestComposeBuiltinId,
  { label: string; description: string }
> = {
  request_money: {
    label: "Request money",
    description: "Create a payment link for store credit",
  },
  linkpay: {
    label: "LinkPay",
    description: "Create a Linq Agent Pay checkout card for store credit",
  },
  send_receipt: {
    label: "Send receipt",
    description: "Attach a Lightspeed workorder receipt",
  },
  ask_to_call: {
    label: "Request callback",
    description: "Ask the customer to call the store back",
  },
  bike_ready: {
    label: "Bike ready",
    description: "Tell them their bike is ready for collection",
  },
  request_review: {
    label: "Request review",
    description: "Ask them to leave a Google review",
  },
};

export const DEFAULT_NEST_COMPOSE_QUICK_ACTIONS: NestComposeQuickAction[] = [
  { id: "builtin:request_money", kind: "builtin", builtin: "request_money" },
  { id: "builtin:linkpay", kind: "builtin", builtin: "linkpay" },
  { id: "builtin:send_receipt", kind: "builtin", builtin: "send_receipt" },
  { id: "builtin:ask_to_call", kind: "builtin", builtin: "ask_to_call" },
  { id: "builtin:bike_ready", kind: "builtin", builtin: "bike_ready" },
  { id: "builtin:request_review", kind: "builtin", builtin: "request_review" },
];

/** Prefs key for a store-specific Google review link (overrides env). */
export const NEST_GOOGLE_REVIEW_URL_PREFS_KEY = "nest_google_review_url";

const MAX_ACTIONS = 12;
const MAX_CUSTOM_LABEL = 28;
const MAX_CUSTOM_BODY = 600;

function firstNameFromCustomer(name: string | null | undefined): string {
  const cleaned = name?.trim().split(/\s+/).filter(Boolean)[0] ?? "";
  return cleaned || "there";
}

export function applyComposePlaceholders(
  template: string,
  values: { name: string; store: string; phone: string; reviewUrl?: string },
): string {
  return template
    .replaceAll("{name}", values.name)
    .replaceAll("{store}", values.store)
    .replaceAll("{phone}", values.phone)
    .replaceAll("{review_url}", values.reviewUrl?.trim() || "")
    .trim();
}

export function buildSignedComposeDraft(args: {
  customerName?: string | null;
  storeName: string | null;
  storePhone: string | null;
  signoffTemplate: string;
  body: string;
  reviewUrl?: string | null;
}): string {
  const firstName = firstNameFromCustomer(args.customerName);
  const store = args.storeName?.trim() || "the store";
  const phone = args.storePhone?.trim() || "";
  const reviewUrl = args.reviewUrl?.trim() || "";
  const values = { name: firstName, store, phone, reviewUrl };
  const body = applyComposePlaceholders(args.body, values);
  const signoff =
    applyComposePlaceholders(args.signoffTemplate, values) || `Cheers,\n${store}`;

  return [`Hi ${firstName},`, ``, body, ``, signoff].join("\n");
}

export function builtinDraftBody(
  builtin: NestComposeBuiltinId,
  storePhone: string | null,
  googleReviewUrl?: string | null,
): string | null {
  if (builtin === "ask_to_call") {
    return storePhone?.trim()
      ? `When you get a chance, could you please give us a call on {phone}?`
      : `When you get a chance, could you please give the store a call?`;
  }
  if (builtin === "bike_ready") {
    return `Just a friendly message to let you know that your bike is ready for collection.`;
  }
  if (builtin === "request_review") {
    const url = googleReviewUrl?.trim();
    if (!url) return null;
    return [
      `If you have a spare moment, we'd really appreciate a quick Google review — it helps other cyclists find {store}.`,
      ``,
      `You can leave one here:`,
      `{review_url}`,
    ].join("\n");
  }
  return null;
}

/**
 * Resolve the Google review link for Nest compose.
 * Prefs override env. No fabricated URL — returns null when unset.
 */
export function resolveGoogleReviewUrl(options?: {
  preferences?: unknown;
  envUrl?: string | null;
}): string | null {
  const prefs =
    options?.preferences &&
    typeof options.preferences === "object" &&
    !Array.isArray(options.preferences)
      ? (options.preferences as Record<string, unknown>)
      : null;
  const fromPrefs =
    typeof prefs?.[NEST_GOOGLE_REVIEW_URL_PREFS_KEY] === "string"
      ? (prefs[NEST_GOOGLE_REVIEW_URL_PREFS_KEY] as string).trim()
      : "";
  if (fromPrefs) return fromPrefs;

  const fromEnv = options?.envUrl?.trim() || "";
  if (fromEnv) return fromEnv;

  return null;
}

function isBuiltinId(value: unknown): value is NestComposeBuiltinId {
  return (
    value === "request_money" ||
    value === "linkpay" ||
    value === "send_receipt" ||
    value === "ask_to_call" ||
    value === "bike_ready" ||
    value === "request_review"
  );
}

export function createCustomComposeAction(label: string, body: string): NestComposeCustomAction {
  return {
    id: `custom:${crypto.randomUUID()}`,
    kind: "custom",
    label: label.trim().slice(0, MAX_CUSTOM_LABEL),
    body: body.trim().slice(0, MAX_CUSTOM_BODY),
  };
}

export function parseNestComposeQuickActions(raw: unknown): NestComposeQuickAction[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_NEST_COMPOSE_QUICK_ACTIONS.map((action) => ({ ...action }));
  }

  const seen = new Set<string>();
  const parsed: NestComposeQuickAction[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id || seen.has(id)) continue;

    if (row.kind === "builtin" && isBuiltinId(row.builtin)) {
      const builtinId = `builtin:${row.builtin}`;
      if (seen.has(builtinId)) continue;
      seen.add(builtinId);
      parsed.push({ id: builtinId, kind: "builtin", builtin: row.builtin });
      continue;
    }

    if (row.kind === "custom") {
      const label = typeof row.label === "string" ? row.label.trim() : "";
      const body = typeof row.body === "string" ? row.body.trim() : "";
      if (!label || !body) continue;
      seen.add(id);
      parsed.push({
        id,
        kind: "custom",
        label: label.slice(0, MAX_CUSTOM_LABEL),
        body: body.slice(0, MAX_CUSTOM_BODY),
      });
    }
  }

  return parsed.length > 0
    ? parsed.slice(0, MAX_ACTIONS)
    : DEFAULT_NEST_COMPOSE_QUICK_ACTIONS.map((action) => ({ ...action }));
}

export function serializeNestComposeQuickActions(
  actions: unknown,
): NestComposeQuickAction[] {
  return parseNestComposeQuickActions(actions);
}

export function missingBuiltinActions(
  actions: NestComposeQuickAction[],
): NestComposeBuiltinAction[] {
  const present = new Set(
    actions
      .filter((action): action is NestComposeBuiltinAction => action.kind === "builtin")
      .map((action) => action.builtin),
  );
  return DEFAULT_NEST_COMPOSE_QUICK_ACTIONS.filter(
    (action): action is NestComposeBuiltinAction =>
      action.kind === "builtin" && !present.has(action.builtin),
  );
}

export const NEST_COMPOSE_QUICK_ACTIONS_PREFS_KEY = "nest_compose_quick_actions";
export const NEST_COMPOSE_MAX_ACTIONS = MAX_ACTIONS;
export const NEST_COMPOSE_MAX_CUSTOM_LABEL = MAX_CUSTOM_LABEL;
export const NEST_COMPOSE_MAX_CUSTOM_BODY = MAX_CUSTOM_BODY;
