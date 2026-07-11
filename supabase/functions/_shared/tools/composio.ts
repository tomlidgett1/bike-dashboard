import type { ToolContract, ToolContext, ToolOutput } from "./types.ts";
import {
  executeComposioActionTool,
  executeComposioReadTool,
  getComposioToolSchema,
  getComposioUserId,
  listComposioConnectedAccounts,
  mintComposioConnectLink,
  searchComposioTools,
} from "../composio-tools.ts";
import {
  createComposioTrigger,
  formatComposioTriggerError,
  getComposioTriggerType,
  listComposioActiveTriggersForUser,
  listComposioTriggerTypes,
} from "../composio-triggers.ts";

function jsonResult(payload: Record<string, unknown>): ToolOutput {
  return {
    content: JSON.stringify(payload),
    structuredData: payload,
  };
}

function buildUserId(ctx: ToolContext): string {
  return getComposioUserId(ctx.authUserId, ctx.senderHandle);
}

export const composioListConnectedAccountsTool: ToolContract = {
  name: "composio_list_connected_accounts",
  description:
    "List the user's Composio connected accounts and their toolkits. Use this before choosing a specific connected account, or to explain what is already linked.",
  namespace: "composio.read",
  sideEffect: "read",
  idempotent: true,
  timeoutMs: 12000,
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  handler: async (_input, ctx) => {
    try {
      const accounts = await listComposioConnectedAccounts(buildUserId(ctx));
      return jsonResult({ accounts, count: accounts.length });
    } catch (error) {
      return jsonResult({ error: formatComposioTriggerError(error) });
    }
  },
};

export const composioGetConnectionLinkTool: ToolContract = {
  name: "composio_get_connection_link",
  description:
    "Create a Composio connection link for a toolkit when the user needs to connect or reconnect an app. If the result JSON contains an \"error\" field, repeat that error text to the user verbatim (do not paraphrase or joke about failures).",
  namespace: "composio.read",
  sideEffect: "read",
  idempotent: true,
  timeoutMs: 15000,
  inputSchema: {
    type: "object",
    properties: {
      toolkit: {
        type: "string",
        description: "Toolkit slug, e.g. gmail, slack, notion, github, hubspot.",
      },
    },
    required: ["toolkit"],
    additionalProperties: false,
  },
  handler: async (input, ctx) => {
    try {
      const toolkit = String(input.toolkit ?? "").trim().toLowerCase();
      if (!toolkit) return jsonResult({ error: "toolkit is required" });
      const result = await mintComposioConnectLink({
        userId: buildUserId(ctx),
        toolkit,
      });
      return jsonResult(result);
    } catch (error) {
      return jsonResult({ error: formatComposioTriggerError(error) });
    }
  },
};

export const composioSearchToolsTool: ToolContract = {
  name: "composio_search_tools",
  description:
    "Search the Composio tool catalogue across integrations. Use this first to find the exact tool slug for a user request before fetching its schema or executing it.",
  namespace: "composio.read",
  sideEffect: "read",
  idempotent: true,
  timeoutMs: 15000,
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Natural-language tool search query." },
      toolkits: {
        type: "array",
        items: { type: "string" },
        description: "Optional toolkit slugs to narrow the search.",
      },
      limit: { type: "number", description: "Maximum results to return (default 12)." },
    },
    required: ["query"],
    additionalProperties: false,
  },
  handler: async (input) => {
    try {
      const result = await searchComposioTools({
        query: String(input.query ?? ""),
        toolkits: Array.isArray(input.toolkits)
          ? input.toolkits.map((v) => String(v))
          : undefined,
        limit: typeof input.limit === "number" ? input.limit : undefined,
      });
      return jsonResult(result);
    } catch (error) {
      return jsonResult({ error: formatComposioTriggerError(error) });
    }
  },
};

export const composioGetToolSchemaTool: ToolContract = {
  name: "composio_get_tool_schema",
  description:
    "Fetch the schema for a single Composio tool slug. Use this before executing so you know the required arguments and whether it looks read-only or mutating.",
  namespace: "composio.read",
  sideEffect: "read",
  idempotent: true,
  timeoutMs: 15000,
  inputSchema: {
    type: "object",
    properties: {
      slug: { type: "string", description: "Composio tool slug to inspect." },
    },
    required: ["slug"],
    additionalProperties: false,
  },
  handler: async (input) => {
    try {
      const result = await getComposioToolSchema(String(input.slug ?? ""));
      return jsonResult(result);
    } catch (error) {
      return jsonResult({ error: formatComposioTriggerError(error) });
    }
  },
};

export const composioExecuteTool: ToolContract = {
  name: "composio_execute_tool",
  description:
    "Execute a read-only Composio tool after you already know the slug and schema. Use this for fetch/search/read/list tools, not mutating actions.",
  namespace: "composio.read",
  sideEffect: "read",
  idempotent: true,
  timeoutMs: 30000,
  inputSchema: {
    type: "object",
    properties: {
      slug: { type: "string", description: "Composio tool slug to execute." },
      connected_account_id: {
        type: "string",
        description: "Optional connected account ID when multiple accounts exist.",
      },
      arguments: {
        type: "object",
        description: "Arguments object matching the tool schema.",
        additionalProperties: true,
      },
    },
    required: ["slug", "arguments"],
    additionalProperties: false,
  },
  handler: async (input, ctx) => {
    try {
      const result = await executeComposioReadTool({
        userId: buildUserId(ctx),
        slug: String(input.slug ?? ""),
        connectedAccountId: typeof input.connected_account_id === "string"
          ? input.connected_account_id
          : undefined,
        input: (input.arguments as Record<string, unknown>) ?? {},
      });
      return jsonResult(result);
    } catch (error) {
      return jsonResult({ error: formatComposioTriggerError(error) });
    }
  },
};

export const composioExecuteActionTool: ToolContract = {
  name: "composio_execute_action_tool",
  description:
    "Execute a mutating Composio tool after the user has clearly asked for the action. Use this for create/update/send/post/delete-style tools.",
  namespace: "composio.write",
  sideEffect: "commit",
  idempotent: false,
  timeoutMs: 30000,
  inputSchema: {
    type: "object",
    properties: {
      slug: { type: "string", description: "Composio tool slug to execute." },
      connected_account_id: {
        type: "string",
        description: "Optional connected account ID when multiple accounts exist.",
      },
      arguments: {
        type: "object",
        description: "Arguments object matching the tool schema.",
        additionalProperties: true,
      },
    },
    required: ["slug", "arguments"],
    additionalProperties: false,
  },
  handler: async (input, ctx) => {
    try {
      const result = await executeComposioActionTool({
        userId: buildUserId(ctx),
        slug: String(input.slug ?? ""),
        connectedAccountId: typeof input.connected_account_id === "string"
          ? input.connected_account_id
          : undefined,
        input: (input.arguments as Record<string, unknown>) ?? {},
      });
      return jsonResult(result);
    } catch (error) {
      return jsonResult({ error: formatComposioTriggerError(error) });
    }
  },
};

export const composioListTriggerTypesTool: ToolContract = {
  name: "composio_list_trigger_types",
  description:
    "List available Composio trigger types. Use this to discover the right trigger slug before creating a trigger.",
  namespace: "composio.read",
  sideEffect: "read",
  idempotent: true,
  timeoutMs: 15000,
  inputSchema: {
    type: "object",
    properties: {
      toolkits: {
        type: "array",
        items: { type: "string" },
        description: "Optional toolkit slugs to narrow the trigger search.",
      },
      limit: { type: "number" },
      cursor: { type: "string" },
    },
    additionalProperties: false,
  },
  handler: async (input) => {
    try {
      const result = await listComposioTriggerTypes({
        toolkits: Array.isArray(input.toolkits)
          ? input.toolkits.map((v) => String(v))
          : undefined,
        limit: typeof input.limit === "number" ? input.limit : undefined,
        cursor: typeof input.cursor === "string" ? input.cursor : undefined,
      });
      return jsonResult(result as Record<string, unknown>);
    } catch (error) {
      return jsonResult({ error: formatComposioTriggerError(error) });
    }
  },
};

export const composioGetTriggerTypeTool: ToolContract = {
  name: "composio_get_trigger_type",
  description:
    "Fetch one Composio trigger type by slug, including the required triggerConfig schema and payload shape.",
  namespace: "composio.read",
  sideEffect: "read",
  idempotent: true,
  timeoutMs: 15000,
  inputSchema: {
    type: "object",
    properties: {
      slug: { type: "string", description: "Trigger slug to inspect." },
    },
    required: ["slug"],
    additionalProperties: false,
  },
  handler: async (input) => {
    try {
      const result = await getComposioTriggerType(String(input.slug ?? ""));
      return jsonResult(result as Record<string, unknown>);
    } catch (error) {
      return jsonResult({ error: formatComposioTriggerError(error) });
    }
  },
};

export const composioCreateTriggerTool: ToolContract = {
  name: "composio_create_trigger",
  description:
    "Create a persistent Composio trigger for this user's chat. Use for ongoing monitoring: \"whenever I get an email\", \"notify me when…\", \"let me know when…\". For Gmail new-mail, the usual slug is GMAIL_NEW_GMAIL_MESSAGE — call composio_get_trigger_type with that slug to see trigger_config. When config includes \`query\`, set Gmail search for the sender, e.g. \`from:person@example.com\`. The user needs Gmail (or the right toolkit) connected via Composio (use composio_list_connected_accounts); Nest's native Google link is separate. Gmail triggers are polled (often ~15+ min latency). Pass connected_account_id when they have multiple mailboxes.",
  namespace: "composio.write",
  sideEffect: "commit",
  idempotent: false,
  timeoutMs: 20000,
  inputSchema: {
    type: "object",
    properties: {
      slug: { type: "string", description: "Trigger slug to create." },
      connected_account_id: {
        type: "string",
        description: "Optional connected account ID when multiple accounts exist.",
      },
      trigger_config: {
        type: "object",
        description: "Object satisfying the trigger type's required config schema.",
        additionalProperties: true,
      },
    },
    required: ["slug", "trigger_config"],
    additionalProperties: false,
  },
  handler: async (input, ctx) => {
    try {
      const result = await createComposioTrigger({
        userId: buildUserId(ctx),
        authUserId: ctx.authUserId,
        handle: ctx.senderHandle,
        chatId: ctx.chatId,
        botNumber: null,
        slug: String(input.slug ?? ""),
        connectedAccountId: typeof input.connected_account_id === "string"
          ? input.connected_account_id
          : undefined,
        triggerConfig: (input.trigger_config as Record<string, unknown>) ?? {},
      });
      return jsonResult({
        ...result,
        confirmation:
          "Trigger created. Future events will come back to this Nest chat through LINQ.",
      });
    } catch (error) {
      return jsonResult({ error: formatComposioTriggerError(error) });
    }
  },
};

export const composioListActiveTriggersTool: ToolContract = {
  name: "composio_list_active_triggers",
  description:
    "List this user's active Composio triggers (scoped to their Composio connected accounts only). Use to avoid duplicates or explain what is already being monitored.",
  namespace: "composio.read",
  sideEffect: "read",
  idempotent: true,
  timeoutMs: 15000,
  inputSchema: {
    type: "object",
    properties: {
      connected_account_ids: {
        type: "array",
        items: { type: "string" },
      },
      trigger_names: {
        type: "array",
        items: { type: "string" },
      },
      show_disabled: { type: "boolean" },
      limit: { type: "number" },
      cursor: { type: "string" },
    },
    additionalProperties: false,
  },
  handler: async (input, ctx) => {
    try {
      const result = await listComposioActiveTriggersForUser(buildUserId(ctx), {
        connectedAccountIds: Array.isArray(input.connected_account_ids)
          ? input.connected_account_ids.map((v) => String(v))
          : undefined,
        triggerNames: Array.isArray(input.trigger_names)
          ? input.trigger_names.map((v) => String(v))
          : undefined,
        showDisabled: input.show_disabled === true,
        limit: typeof input.limit === "number" ? input.limit : undefined,
        cursor: typeof input.cursor === "string" ? input.cursor : undefined,
      });
      return jsonResult(result as Record<string, unknown>);
    } catch (error) {
      return jsonResult({ error: formatComposioTriggerError(error) });
    }
  },
};
