import { Agent, run } from "npm:@openai/agents";
import { z } from "npm:zod";
import type { PlannerOutput, RuntimeContext } from "../types.ts";
import { normalisePlannerOutput } from "./planner.ts";

export const NESTV3_PLANNER_AGENT_MODEL = "gpt-5.4";

const PlannerSchema = z.object({
  mode: z.enum([
    "casual",
    "smart",
    "automation_create",
    "automation_cancel",
    "trigger_create",
    "clarification_needed",
  ]),
  intent: z.string(),
  immediateRunRequested: z.boolean(),
  schedule: z.object({
    type: z.enum(["daily", "cron", "none"]),
    cronExpression: z.string().nullable(),
    timezone: z.string().nullable(),
  }).nullable(),
  requiredCapabilities: z.array(z.string()),
  requiredApps: z.array(z.string()),
  candidateEmailApps: z.array(z.string()),
  selectedEmailApp: z.string().nullable(),
  writeActions: z.array(z.string()),
  approval: z.array(z.object({
    key: z.string(),
    value: z.string(),
  })),
  successConditions: z.array(z.string()),
  allowedToolkits: z.array(z.string()),
  clarificationQuestion: z.string().nullable(),
  planSummary: z.string(),
  executionSteps: z.array(z.string()),
  assumptions: z.array(z.string()),
  risks: z.array(z.string()),
  verificationPlan: z.array(z.string()),
});

type PlannerAgentOutput = z.infer<typeof PlannerSchema>;

function formatPlannerContext(ctx: RuntimeContext): string {
  const turns = ctx.recentTurns.length
    ? ctx.recentTurns.slice(-20).map((turn) =>
      `${turn.role}: ${turn.content.replace(/\s+/g, " ").slice(0, 500)}`
    ).join("\n")
    : "none";
  const profile = ctx.userProfile
    ? [
      `Name: ${ctx.userProfile.name ?? "unknown"}`,
      `Handle: ${ctx.userProfile.handle}`,
      `Facts: ${ctx.userProfile.facts.slice(0, 12).join("; ") || "none"}`,
      `Context profile: ${ctx.userProfile.contextProfile ? JSON.stringify(ctx.userProfile.contextProfile).slice(0, 1200) : "none"}`,
      `Gen Z voice: ${ctx.userProfile.genz === true ? "yes" : "no"}`,
    ].join("\n")
    : "none";
  return `User profile:\n${profile}\n\nRecent conversation:\n${turns}`;
}

const NESTV3_PLANNER_AGENT_INSTRUCTIONS = `You are the world-class planning agent for Nest Agent Runtime.

You receive a user text message plus router context. Produce a concrete, executable plan for Nest.

You are not a casual chat bot. You are the planning brain that determines:
- the actual job to be done
- hidden dependencies
- current-data lookups needed before scheduling
- Composio/Nest tools needed
- missing clarifications
- verification criteria
- the safe user-facing outcome

Return structured output only.

Planning requirements:
- Be precise and operational. executionSteps must be concrete steps another agent can execute.
- Pending clarification context is only a hint, not a trap. If the user sends a fresh standalone request, especially a sports result, latest news, weather, market, accounting/Xero, or new connected-app question, plan the new request and ignore the old clarification.
- For time-dependent requests such as "after the match finishes", plan a two-stage workflow:
  1. use current web evidence to identify/estimate event finish time
  2. schedule a one-shot automation after that time
  3. scheduled run re-checks final score/result and sends iMessage
- For recurring email summaries, include email_search and email_read as future-run capabilities; setup writes are create_agent_spec and create_automation.
- For cancellation requests, use mode automation_cancel and requiredCapabilities ["cancel_automation"] if latest automation context exists.
- For ambiguous missing choices, use clarification_needed and set a short iMessage-style clarificationQuestion.
- Router/model implementation details, raw chain-of-thought, and private reasoning must not be included.
- planSummary is a sanitised explanation of the plan, not chain-of-thought.

Mode selection:
- casual: no tools/current data/account data/personal memory needed.
- smart: one-off tool/current-data/account-data work.
- automation_create: recurring, scheduled, delayed, after-event, or durable future work.
- automation_cancel: cancel/delete/disable/don't-send latest automation.
- trigger_create: external event subscription such as "whenever I get an email".
- clarification_needed: cannot safely proceed without user choice.

Tool/capability naming:
- web_search for current internet data.
- places_search for Google Maps place, venue, restaurant, cafe, bar, attraction, opening-hours, review, phone-number, or "near me/near <place>" requests.
- travel_time for Google Maps directions, routes, driving, walking, cycling, public transport, next train/bus/tram, distance, or "can I get there by..." requests.
- semantic_search for internal/personal search.
- email_search, email_read for email summaries.
- create_agent_spec and create_automation for scheduled setup.
- cancel_automation for cancellation.
- trigger_create flows may use email_monitoring, email_sender_filter, notification_delivery.
`;

export async function runPlannerAgent(args: {
  userMessage: string;
  router: PlannerOutput;
  ctx: RuntimeContext;
}): Promise<PlannerOutput & {
  planSummary: string;
  executionSteps: string[];
  assumptions: string[];
  risks: string[];
  verificationPlan: string[];
  plannerAgentModel: string;
}> {
  if (args.ctx.agentSpecMarkdown) {
    return {
      ...args.router,
      planSummary: "Use the stored Markdown agent spec for this scheduled run.",
      executionSteps: ["Load the stored spec", "Run the approved capabilities", "Verify and send the iMessage result"],
      assumptions: [],
      risks: [],
      verificationPlan: ["Verify required tools return real outputs before final response"],
      plannerAgentModel: "stored_spec",
    };
  }

  const agent = new Agent({
    name: "NESTV3 Planner Agent",
    model: NESTV3_PLANNER_AGENT_MODEL,
    instructions: NESTV3_PLANNER_AGENT_INSTRUCTIONS,
    outputType: PlannerSchema,
  });

  const result = await run(agent, [
    {
      role: "user",
      content: [
        `User message: ${args.userMessage}`,
        `Timezone: ${args.ctx.timezone ?? "Australia/Melbourne"}`,
        `Router output: ${JSON.stringify({
          ...args.router,
          approval: Object.entries(args.router.approval).map(([key, value]) => ({ key, value })),
        })}`,
        args.ctx.pendingClarification
          ? `Pending clarification: ${JSON.stringify(args.ctx.pendingClarification)}`
          : "Pending clarification: none",
        args.ctx.latestAutomation
          ? `Latest active automation: ${JSON.stringify(args.ctx.latestAutomation)}`
          : "Latest active automation: none",
        formatPlannerContext(args.ctx),
      ].join("\n\n"),
    },
  ]);

  const output = result.finalOutput as PlannerAgentOutput | undefined;
  if (!output) throw new Error("Planner Agent did not return structured output");

  const normalised = normalisePlannerOutput({
    ...output,
    approval: Object.fromEntries(output.approval.map((entry) => [entry.key, entry.value])),
    schedule: output.schedule?.type === "none" ? undefined : output.schedule,
    originalUserMessage: args.userMessage,
  }, args.ctx);

  return {
    ...normalised,
    planSummary: output.planSummary,
    executionSteps: output.executionSteps,
    assumptions: output.assumptions,
    risks: output.risks,
    verificationPlan: output.verificationPlan,
    plannerAgentModel: NESTV3_PLANNER_AGENT_MODEL,
  };
}
