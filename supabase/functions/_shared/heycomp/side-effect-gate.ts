export type HeyCompToolRisk = "read" | "low_risk_write" | "confirm_required";

const READ_TOOL_RE = /(^|_)(GET|LIST|SEARCH|FETCH|READ|LOOKUP|RETRIEVE|FIND|QUERY)(_|$)/i;
const HIGH_RISK_WRITE_RE =
  /(^|_)(SEND|POST|PUBLISH|DELETE|REMOVE|DESTROY|PURCHASE|BUY|PAY|TRANSFER|SUBMIT|CANCEL|INVITE|MESSAGE|EMAIL|TWEET|COMMENT|REPLY)(_|$)/i;
const LOW_RISK_WRITE_RE = /(^|_)(DRAFT|CREATE_NOTE|CREATE_PAGE|CREATE_DOCUMENT|SAVE|REMINDER|PRIVATE|NOTE)(_|$)/i;
const META_TOOL_RE = /^COMPOSIO_(REMOTE_WORKBENCH|REMOTE_BASH_TOOL|MULTI_EXECUTE_TOOL)$/i;
const RISKY_INSTRUCTION_RE =
  /\b(send|post|publish|delete|remove|destroy|purchase|buy|pay|transfer|submit|cancel|invite|reply|comment)\b.{0,80}\b(email|mail|message|slack|tweet|post|record|file|issue|ticket|payment|purchase)\b/i;
const RISKY_COMPOSIO_CALL_RE =
  /\b(run_composio_tool|tool_slug|slug|name)\b[\s\S]{0,200}(SEND|POST|PUBLISH|DELETE|REMOVE|DESTROY|PURCHASE|BUY|PAY|TRANSFER|SUBMIT|CANCEL|INVITE|REPLY|COMMENT)/i;

function stringifyArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args).toLowerCase();
  } catch {
    return "";
  }
}

function nestedMultiExecuteTools(args: Record<string, unknown>): Array<{
  slug: string;
  arguments: Record<string, unknown>;
}> {
  const rawTools = args.tools;
  if (!Array.isArray(rawTools)) return [];
  return rawTools
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const slug = String(row.tool_slug ?? row.slug ?? row.name ?? "").trim();
      const toolArgs = row.arguments && typeof row.arguments === "object" && !Array.isArray(row.arguments)
        ? row.arguments as Record<string, unknown>
        : {};
      return slug ? { slug, arguments: toolArgs } : null;
    })
    .filter((item): item is { slug: string; arguments: Record<string, unknown> } => Boolean(item));
}

function classifySingleToolRisk(
  toolName: string,
  args: Record<string, unknown>,
): HeyCompToolRisk {
  const upper = toolName.toUpperCase();
  const argText = stringifyArgs(args);

  // Starting an OAuth/connect-link flow is safe to do immediately. The user still
  // has to tap the link and authorise in the browser before any account is usable.
  if (upper === "COMPOSIO_MANAGE_CONNECTIONS") return "low_risk_write";
  if (upper === "COMPOSIO_CREATE_TRIGGER") return "low_risk_write";
  if (META_TOOL_RE.test(upper)) {
    return RISKY_COMPOSIO_CALL_RE.test(argText) ? "confirm_required" : "read";
  }
  if (READ_TOOL_RE.test(upper)) return "read";
  if (HIGH_RISK_WRITE_RE.test(upper)) return "confirm_required";
  if (RISKY_COMPOSIO_CALL_RE.test(argText) || RISKY_INSTRUCTION_RE.test(argText)) {
    return "confirm_required";
  }
  if (LOW_RISK_WRITE_RE.test(upper)) return "low_risk_write";

  // Unknown does not imply write. Hey Comp only asks iMessage confirmation for
  // explicit write/destructive actions; read-only Composio tools often have neutral names.
  return "read";
}

export function classifyHeyCompToolRisk(
  toolName: string,
  args: Record<string, unknown>,
): HeyCompToolRisk {
  if (toolName.toUpperCase() === "COMPOSIO_MULTI_EXECUTE_TOOL") {
    const nested = nestedMultiExecuteTools(args);
    if (nested.length === 0) return "read";
    const risks = nested.map((tool) => classifySingleToolRisk(tool.slug, tool.arguments));
    if (risks.includes("confirm_required")) return "confirm_required";
    if (risks.includes("low_risk_write")) return "low_risk_write";
    return "read";
  }

  return classifySingleToolRisk(toolName, args);
}

export function buildConfirmationPrompt(toolName: string, args: Record<string, unknown>): string {
  const readableName = summariseToolForUser(toolName, args);
  return `I can do that, but I want to confirm first. Reply yes to ${readableName}.`;
}

function summariseToolForUser(toolName: string, args: Record<string, unknown>): string {
  const upper = toolName.toUpperCase();
  const nested = upper === "COMPOSIO_MULTI_EXECUTE_TOOL" ? nestedMultiExecuteTools(args) : [];
  const riskyNested = nested.find((tool) => classifySingleToolRisk(tool.slug, tool.arguments) === "confirm_required");
  if (riskyNested) return summariseToolForUser(riskyNested.slug, riskyNested.arguments);

  const to = Array.isArray(args.to)
    ? args.to.join(", ")
    : typeof args.to === "string"
    ? args.to
    : typeof args.recipient === "string"
    ? args.recipient
    : typeof args.email === "string"
    ? args.email
    : "";
  const subject = typeof args.subject === "string" ? args.subject : "";
  const channel = typeof args.channel === "string" ? args.channel : "";

  if (upper.includes("EMAIL") || upper.includes("GMAIL") || upper.includes("MAIL")) {
    const bits = [to && `to ${to}`, subject && `about “${subject.slice(0, 80)}”`].filter(Boolean);
    return `send the email${bits.length ? ` ${bits.join(" ")}` : ""}`;
  }
  if (upper.includes("SLACK") || upper.includes("MESSAGE")) {
    return `send the message${channel ? ` to ${channel}` : ""}`;
  }
  if (upper.includes("DELETE") || upper.includes("REMOVE") || upper.includes("DESTROY")) {
    return "delete the item";
  }
  if (upper.includes("POST") || upper.includes("PUBLISH")) {
    return "publish the post";
  }
  if (upper.includes("CREATE") && (upper.includes("ISSUE") || upper.includes("TICKET"))) {
    return "create the ticket";
  }

  return toolName.toLowerCase().replace(/^composio_/, "").replace(/_/g, " ");
}
