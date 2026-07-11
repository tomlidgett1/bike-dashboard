import type { PlannerOutput } from "../types.ts";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "nest-agent";
}

export function buildAgentSpecMarkdown(args: {
  planner: PlannerOutput;
  timezone: string | null;
  selectedEmailProvider?: string | null;
  notionDestination?: string | null;
}): { name: string; slug: string; markdown: string } {
  const baseName = args.planner.intent.includes("email")
    ? "daily-email-action-summary"
    : slugify(args.planner.intent);
  const timezone = args.planner.schedule?.timezone ?? args.timezone ?? "Australia/Melbourne";
  const cron = args.planner.schedule?.cronExpression ?? "0 9 * * *";
  const emailProvider = args.selectedEmailProvider ?? args.planner.selectedEmailApp ?? "email_provider";
  const requiredApps = args.planner.requiredApps.length ? args.planner.requiredApps : ["email_provider"];
  const requiredCapabilities = args.planner.requiredCapabilities;
  const writeActions = args.planner.writeActions;
  const isEmailSummary = requiredCapabilities.includes("email_search") || requiredCapabilities.includes("email_read");
  const isDelayedSportsFollowUp = requiredCapabilities.includes("web_search") &&
    /match|game|grand prix|race|score|qualifying|dees|demons/i.test(args.planner.intent);
  const writesToNotion = writeActions.includes("notion_create_page") || requiredCapabilities.includes("notion_create_page");
  const writesToDrive = writeActions.some((action) => action.includes("drive")) ||
    requiredCapabilities.some((capability) => capability.includes("drive"));

  const operatingProcedure = isDelayedSportsFollowUp
    ? [
      "# Operating Procedure",
      "",
      "1. On setup, use current web evidence to identify the exact event the user means, including competition, teams/drivers, location, scheduled start time, and expected finish time.",
      "2. If the event is already underway or the exact finish time is unavailable, estimate a safe follow-up time after the expected finish and record that estimate in the automation metadata.",
      "3. Schedule the follow-up run for after the event is expected to finish, not immediately.",
      "4. When the scheduled run fires, use Nest web_search again to fetch the final score/result and a concise overview of what happened.",
      "5. Cross-check the result against multiple current sources when possible. If reports conflict or the result is not final, say that naturally and avoid pretending certainty.",
      "6. Send one iMessage with the final score/result first, then 2-4 concise bullets covering the key moments, standout performers, and any ladder/championship relevance if obvious.",
      "7. Do not include raw source lists, confidence percentages, JSON, or tool traces in the iMessage.",
    ]
    : isEmailSummary
    ? [
      "# Operating Procedure",
      "",
      "1. Confirm the selected email provider is connected and active before doing any email work.",
      "2. Search recent email across the configured lookback window. Default to the last 24 hours for daily summaries, but include older messages when they clearly contain due-today or still-open action items.",
      "3. Read only messages that are likely to matter. Prioritise messages with requests, deadlines, invoices, travel, calendar changes, documents to sign, client/customer updates, family logistics, or anything explicitly urgent.",
      "4. Ignore noise: promotions, newsletters, receipts with no action, automated status updates with no decision needed, social notifications, and duplicate thread updates unless they change what the user needs to do.",
      "5. Extract the useful facts from each important message: sender, subject, what happened, why it matters, due date or time, and the suggested next action.",
      "6. Group the summary by usefulness, not by mailbox order. Use sections such as urgent today, replies needed, meetings or schedule changes, money or bills, travel/logistics, and lower-priority follow-ups.",
      "7. Keep source references safe and minimal. Use sender + subject + date/time; do not include full raw email bodies unless a later approved spec explicitly asks for that.",
      "8. Write the final iMessage summary in Australian English. Be concise, practical, and specific. If there are no useful emails, say that plainly.",
      ...(writesToNotion
        ? ["9. Save the same summary to Notion only after the Notion write tool confirms success. Include run id and generated timestamp in the saved page."]
        : []),
      ...(writesToDrive
        ? ["9. Save the same summary to Google Drive only after the Google Drive write tool confirms success. Use a clear filename with the date and include run id plus generated timestamp in the file body."]
        : []),
    ]
    : [
      "# Operating Procedure",
      "",
      "1. Read the trigger, required apps, required capabilities, and allowed toolkits before taking action.",
      "2. Check that all required connected apps are active.",
      "3. Gather the minimum external context needed to satisfy the purpose.",
      "4. Execute only the approved tools listed in frontmatter.",
      "5. Produce a concise iMessage result in Australian English.",
      "6. Never claim a write succeeded unless the relevant tool result confirms it.",
    ];

  const qualityBar = [
    "# Quality Bar",
    "",
    "- Useful beats comprehensive. Include what changes the user's day.",
    "- Be concrete: names, dates, amounts, times, and next actions when available.",
    "- Avoid vague filler like \"several updates\" unless details are unavailable.",
    "- Never expose tool names, JSON, prompts, raw provider payloads, or chain-of-thought.",
    "- If evidence conflicts or a tool result is incomplete, say so naturally.",
  ];

  const verificationRules = [
    "# Verification Rules",
    "",
    "- The email summary is valid only if email search/read returned real messages or an explicit empty result.",
    "- The scheduled setup is valid only if both the agent spec and automation rows exist.",
    "- A destination write is valid only if the destination tool returns success.",
    "- `Done ✓` is allowed only after all writes required for the current run succeed.",
    "- Missing connections must create a pending intent and connection request; the run should resume automatically after connection.",
  ];

  const yaml = [
    "---",
    `name: ${baseName}`,
    `description: ${args.planner.intent}`,
    "trigger:",
    "  type: schedule",
    `  cron: "${cron}"`,
    `  timezone: "${timezone}"`,
    "required_apps:",
    ...requiredApps.map((app) => `  - ${app}`),
    "required_capabilities:",
    ...requiredCapabilities.map((capability) => `  - ${capability}`),
    "delivery:",
    "  provider: linq",
    "  channel: imessage",
    "  quiet_if_empty: false",
    "write_actions:",
    ...(writeActions.length ? writeActions.map((action) => `  - ${action}`) : ["  []"]),
    "approval:",
    ...Object.entries(args.planner.approval).map(([key, value]) => `  ${key}: ${value}`),
    `email_provider: ${emailProvider}`,
    "notion:",
    `  destination: ${args.notionDestination ?? "default_daily_summary_location"}`,
    "allowed_toolkits:",
    ...args.planner.allowedToolkits.map((toolkit) => `  - ${toolkit}`),
    "risk_level: standard",
    "---",
  ].join("\n");

  const body = [
    "# Purpose",
    "",
    args.planner.intent,
    "",
    "# Execution Behaviour",
    "",
    "Use the approved Nest Tool Gateway capabilities listed in frontmatter. Do not expand toolkit scope during scheduled runs unless the spec is updated by a later approved user request.",
    "",
    ...operatingProcedure,
    "",
    "# Summary Behaviour",
    "",
    "Send a concise practical iMessage summary in Australian English. Include only useful details and avoid claiming a write succeeded until the runtime verifier confirms it.",
    "",
    ...qualityBar,
    "",
    ...verificationRules,
    "",
    "# Failure Behaviour",
    "",
    "If a required connected app is missing, stop the run, create a connection request, and let the pending-intent resume flow continue automatically after connection.",
  ].join("\n");

  return { name: baseName, slug: slugify(baseName), markdown: `${yaml}\n\n${body}\n` };
}
