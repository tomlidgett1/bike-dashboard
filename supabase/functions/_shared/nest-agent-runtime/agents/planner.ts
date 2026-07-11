import type { PlannerOutput, RuntimeContext } from "../types.ts";
import { parseAgentSpecMarkdown } from "../markdown/parse-agent-spec.ts";
import { getOpenAIClient, getResponseText } from "../../ai/models.ts";
import { normaliseComposioToolkitSlug } from "../tool-gateway/provider-bindings.ts";

export const NESTV3_ROUTER_MODEL = "gpt-5.4-mini";

const NESTV3_ROUTER_INSTRUCTIONS = `You are the 100% LLM router for Nest Agent Runtime v1.

Every inbound message must be classified by this model. There are no deterministic fast paths.

Return strict JSON only, with this exact shape:
{
  "mode": "casual" | "smart" | "automation_create" | "automation_cancel" | "trigger_create" | "clarification_needed",
  "intent": "short plain English intent",
  "immediateRunRequested": true,
  "schedule": {
    "type": "daily" | "cron" | "none",
    "cronExpression": "0 9 * * *",
    "timezone": "Australia/Melbourne"
  },
  "requiredCapabilities": [],
  "requiredApps": [],
  "candidateEmailApps": [],
  "selectedEmailApp": null,
  "writeActions": [],
  "approval": {},
  "successConditions": [],
  "allowedToolkits": [],
  "clarificationQuestion": null
}

Routing rules:
- casual: greetings, banter, static chat, and messages that need no tools or personal/current/account data.
- smart: connected-app reads, current data, web search, semantic/internal search, account data, personal data, or one-off tool work.
- automation_create: user asks for a recurring/scheduled behaviour or durable agent spec.
- automation_cancel: user asks to delete, cancel, stop, remove, disable, or not send a previously-created automation.
- trigger_create: user asks for "when X happens" external connected-app event monitoring.
- clarification_needed: the user request is impossible to route without a missing choice.

Follow-up clarification rules:
- If pending clarification context is provided, treat the new message as an answer to that prior question unless it clearly starts a totally unrelated task.
- A fresh standalone request wins over pending clarification. Sports results, latest news, weather, markets, Xero/accounting questions, or any new named app/topic should route as the new task, not as an answer to the old question.
- Short acknowledgements like "done", "all g", "ok", "yes", "Gmail", or a page/database name may answer the pending clarification. A question like "How'd the Dees go?" does not.
- Merge the user's answer with the prior request and output the route for the resolved original task.
- Example: prior question "Which Grand Prix do you mean?" and user replies "F1" means route the original Grand Prix request as smart/web_search for Formula 1.

Connected app rules:
- Any named external app such as Strava, Slack, GitHub, Linear, Notion, Xero, Google Sheets, Airtable, HubSpot, Salesforce, Spotify, YouTube, Google Drive routes to smart unless it is explicitly recurring or trigger-based.
- Directions, travel time, public transport, driving, walking, cycling, places, restaurants, bars, cafes, attractions, venues, business phone numbers, opening hours, and "near me/near <place>" route to smart using first-party Google Maps tools, not generic web search.
- For place searches/recommendations/details, output requiredCapabilities ["places_search"], requiredApps [], allowedToolkits [].
- For directions/routes/travel time/public transport, output requiredCapabilities ["travel_time"], requiredApps [], allowedToolkits [].
- For "Send me a summary of my Strava last 2 years", output smart with requiredApps ["strava"], requiredCapabilities ["strava_summary"], allowedToolkits ["strava"].
- For ambiguous "my email", include requiredApps ["email_provider"], candidateEmailApps ["gmail","outlook"], selectedEmailApp null.
- For "all my email", leave selectedEmailApp null but indicate all email providers in intent/success conditions.

Automation rules:
- If schedule is daily/morning/9am/every day, use schedule.type "daily".
- If user says every morning at 9am, use cronExpression "0 9 * * *".
- Use the runtime timezone if known, otherwise Australia/Melbourne.
- Automation creation writes include create_agent_spec and create_automation, plus any requested app write such as notion_create_page.
- Requests like "after the match finishes", "when the game ends", "after the event", or "text me after X" are automation_create even when the exact time is unknown.
- For those delayed follow-up automations, include requiredCapabilities ["web_search","create_agent_spec","create_automation"], writeActions ["create_agent_spec","create_automation"], and successConditions that the scheduled agent must first use web/current data to find or estimate the event finish time, then run after that time to fetch the final result and send the iMessage.
- If latest automation context is provided and the user says "delete this", "cancel that", "don't send it", "stop this", or similar, output automation_cancel with requiredCapabilities ["cancel_automation"], writeActions ["cancel_automation"], and intent describing the latest automation being cancelled.

Tool naming:
- web search: web_search.
- Google Maps place search/details: places_search.
- Google Maps directions/travel time: travel_time.
- semantic/internal search: semantic_search.
- email: email_search, email_read.
- Notion page write: notion_create_page.
- External app summary: <toolkit>_summary, e.g. strava_summary.
- Dynamic broad Composio work may use composio_search_tools, composio_get_tool_schema, composio_execute_tool if no curated capability exists.

Safety:
- Never mark writes approved unless the user explicitly requested that write.
- Never output markdown or prose outside JSON.`;

function parseRouterJson(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`NESTV3 router returned no JSON: ${trimmed.slice(0, 200)}`);
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => typeof v === "string")
      .map(([k, v]) => [k, String(v)]),
  );
}

function formatRecentTurns(ctx: RuntimeContext): string {
  if (ctx.recentTurns.length === 0) return "Recent conversation: none";
  const lines = ctx.recentTurns.slice(-20).map((turn) =>
    `${turn.role}: ${turn.content.replace(/\s+/g, " ").slice(0, 500)}`
  );
  return `Recent conversation:\n${lines.join("\n")}`;
}

function formatUserProfile(ctx: RuntimeContext): string {
  const profile = ctx.userProfile;
  if (!profile) return "User profile: none";
  const facts = profile.facts.length ? profile.facts.slice(0, 12).join("; ") : "none";
  const contextProfile = profile.contextProfile ? JSON.stringify(profile.contextProfile).slice(0, 1200) : "none";
  return [
    "User profile:",
    `Name: ${profile.name ?? "unknown"}`,
    `Handle: ${profile.handle}`,
    `Facts: ${facts}`,
    `Context profile: ${contextProfile}`,
    `Gen Z voice: ${profile.genz === true ? "yes" : "no"}`,
  ].join("\n");
}

export function normalisePlannerOutput(raw: Record<string, unknown>, ctx: RuntimeContext): PlannerOutput {
  let mode = ["casual", "smart", "automation_create", "automation_cancel", "trigger_create", "clarification_needed"].includes(String(raw.mode))
    ? String(raw.mode) as PlannerOutput["mode"]
    : "smart";
  const scheduleRaw = raw.schedule && typeof raw.schedule === "object" && !Array.isArray(raw.schedule)
    ? raw.schedule as Record<string, unknown>
    : null;
  const schedule = scheduleRaw && scheduleRaw.type !== "none"
    ? {
      type: scheduleRaw.type === "cron" ? "cron" as const : "daily" as const,
      cronExpression: typeof scheduleRaw.cronExpression === "string" ? scheduleRaw.cronExpression : undefined,
      timezone: typeof scheduleRaw.timezone === "string" ? scheduleRaw.timezone : ctx.timezone ?? "Australia/Melbourne",
    }
    : undefined;

  let requiredCapabilities = stringArray(raw.requiredCapabilities);
  const rawIntent = typeof raw.intent === "string" ? raw.intent : "";
  const originalText = typeof raw.originalUserMessage === "string" ? raw.originalUserMessage : "";
  const combinedIntent = `${rawIntent} ${originalText}`.toLowerCase();
  const cancelLatest = Boolean(ctx.latestAutomation) &&
    /\b(delete|cancel|stop|remove|disable)\b[\s\S]{0,80}\b(this|that|it|automation|reminder|agent|text|message|send)|\bdon'?t\s+send\s+(it|this|that)|\bdo\s+not\s+send\s+(it|this|that)/i.test(combinedIntent);
  if (cancelLatest) {
    mode = "automation_cancel";
    requiredCapabilities = ["cancel_automation"];
  }
  const delayedFollowUp = !cancelLatest &&
    /\b(after|when)\b[\s\S]{0,60}\b(match|game|event|race)\b[\s\S]{0,80}\b(finish|finishes|finished|ends?|over)\b|\b(text|message|send)\b[\s\S]{0,80}\bafter\b[\s\S]{0,80}\b(match|game|event|race)\b/i.test(combinedIntent);
  if (delayedFollowUp) {
    mode = "automation_create";
    for (const capability of ["web_search", "create_agent_spec", "create_automation"]) {
      if (!requiredCapabilities.includes(capability)) requiredCapabilities.push(capability);
    }
  }
  if (requiredCapabilities.includes("email_summary")) {
    requiredCapabilities = requiredCapabilities.flatMap((capability) =>
      capability === "email_summary" ? ["email_search", "email_read"] : [capability]
    );
  }
  requiredCapabilities = [...new Set(requiredCapabilities)];

  let requiredApps = stringArray(raw.requiredApps);
  if (cancelLatest) requiredApps = [];
  const mentionsEmail = requiredApps.includes("email_provider") ||
    requiredCapabilities.includes("email_search") ||
    requiredCapabilities.includes("email_read");
  if (mentionsEmail && !requiredApps.includes("email_provider")) {
    requiredApps = [...requiredApps, "email_provider"];
  }

  const selectedEmailApp = typeof raw.selectedEmailApp === "string" ? raw.selectedEmailApp : null;
  let allowedToolkits = stringArray(raw.allowedToolkits).flatMap((toolkit) => {
    const lower = normaliseComposioToolkitSlug(toolkit);
    if (
      lower === "email" ||
      lower === "email_provider" ||
      lower === "emailsearch" ||
      lower === "emailread" ||
      lower === "emailtrigger"
    ) return selectedEmailApp ? [selectedEmailApp] : ["gmail", "outlook"];
    return [lower];
  });
  if (mentionsEmail && allowedToolkits.length === 0) {
    allowedToolkits = selectedEmailApp ? [selectedEmailApp] : ["gmail", "outlook"];
  }
  allowedToolkits = [...new Set(allowedToolkits.map(normaliseComposioToolkitSlug))];
  if (cancelLatest) allowedToolkits = [];

  let writeActions = stringArray(raw.writeActions);
  if (cancelLatest) writeActions = ["cancel_automation"];
  if (mode === "clarification_needed" && (schedule || writeActions.includes("create_agent_spec") || writeActions.includes("create_automation") || delayedFollowUp)) {
    // The LLM router can be conservative about provider choice. Runtime provider
    // resolution can still proceed when exactly one email provider is connected;
    // true ambiguity is handled later by the Tool Gateway.
    mode = "automation_create";
  }

  const approval = stringRecord(raw.approval);
  if (mode === "automation_create") {
    for (const action of ["create_agent_spec", "create_automation"]) {
      if (!writeActions.includes(action)) writeActions.push(action);
    }
    if (!approval.automation_creation) approval.automation_creation = "explicitly_requested";
  }
  if (mode === "automation_cancel" && !approval.cancel_automation) {
    if (!writeActions.includes("cancel_automation")) writeActions.push("cancel_automation");
    approval.cancel_automation = "explicitly_requested";
  }

  return {
    mode,
    intent: typeof raw.intent === "string" && raw.intent.trim()
      ? raw.intent.trim()
      : "Route the user's message safely.",
    immediateRunRequested: raw.immediateRunRequested !== false,
    schedule,
    requiredCapabilities,
    requiredApps,
    candidateEmailApps: stringArray(raw.candidateEmailApps),
    selectedEmailApp,
    writeActions,
    approval,
    successConditions: stringArray(raw.successConditions),
    allowedToolkits,
    clarificationQuestion: typeof raw.clarificationQuestion === "string" ? raw.clarificationQuestion : undefined,
  };
}

async function runLlmRouter(userMessage: string, ctx: RuntimeContext): Promise<PlannerOutput> {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: NESTV3_ROUTER_MODEL,
    instructions: NESTV3_ROUTER_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [
          `Runtime timezone: ${ctx.timezone ?? "Australia/Melbourne"}`,
          `Has agent spec markdown: ${ctx.agentSpecMarkdown ? "yes" : "no"}`,
          formatUserProfile(ctx),
          formatRecentTurns(ctx),
          ctx.pendingClarification
            ? `Pending clarification:\nPrevious user request: ${ctx.pendingClarification.userMessage}\nQuestion Nest asked: ${ctx.pendingClarification.question}\nPrevious intent: ${ctx.pendingClarification.intent}\nPrevious planner output: ${JSON.stringify(ctx.pendingClarification.plannerOutput)}`
            : "Pending clarification: none",
          ctx.latestAutomation
            ? `Latest active automation:\nID: ${ctx.latestAutomation.id}\nIntent: ${ctx.latestAutomation.intent}\nCron: ${ctx.latestAutomation.cronExpression}\nNext run: ${ctx.latestAutomation.nextRunAt}`
            : "Latest active automation: none",
          `Message: ${userMessage}`,
        ].join("\n"),
      },
    ],
    max_output_tokens: 1200,
    store: false,
    prompt_cache_key: "NESTV3-router-v1",
    reasoning: { effort: "low" as const },
  } as Parameters<typeof client.responses.create>[0]);

  return normalisePlannerOutput({ ...parseRouterJson(getResponseText(response)), originalUserMessage: userMessage }, ctx);
}

export async function planNestTurn(
  userMessage: string,
  ctx: RuntimeContext,
  options?: { routerJson?: Record<string, unknown> },
): Promise<PlannerOutput> {
  if (ctx.agentSpecMarkdown) {
    const parsed = parseAgentSpecMarkdown(ctx.agentSpecMarkdown);
    const caps = Array.isArray(parsed.frontmatter.required_capabilities)
      ? parsed.frontmatter.required_capabilities.map(String)
      : [];
    const apps = Array.isArray(parsed.frontmatter.required_apps)
      ? parsed.frontmatter.required_apps.map(String)
      : [];
    const allowedToolkits = Array.isArray(parsed.frontmatter.allowed_toolkits)
      ? parsed.frontmatter.allowed_toolkits.map(String)
      : apps.flatMap((app) => app === "email_provider" ? ["gmail", "outlook"] : [app]);
    const writeActions = Array.isArray(parsed.frontmatter.write_actions)
      ? parsed.frontmatter.write_actions.map(String)
      : caps.filter((cap) => cap.includes("create") || cap.includes("send"));
    return {
      mode: "smart",
      intent: String(parsed.frontmatter.description ?? "Run scheduled Nest agent spec."),
      immediateRunRequested: true,
      requiredCapabilities: caps,
      requiredApps: apps,
      candidateEmailApps: ["gmail", "outlook"],
      selectedEmailApp: typeof parsed.frontmatter.email_provider === "string"
        ? parsed.frontmatter.email_provider
        : null,
      writeActions,
      approval: Object.fromEntries(writeActions.map((action) => [action, "approved_by_agent_spec"])),
      successConditions: ["Scheduled spec executed truthfully"],
      allowedToolkits,
    };
  }
  if (options?.routerJson) return normalisePlannerOutput(options.routerJson, ctx);
  return runLlmRouter(userMessage, ctx);
}
